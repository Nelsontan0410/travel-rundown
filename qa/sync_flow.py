# 2026-10-18 同步第一步 浏览器验收：两个浏览器环境（主用户电脑 1280、同伴手机 390）+ 模拟后端（Python 里，规则同 supabase/schema.sql）
# 运行：npm run build && python3 qa/sync_flow.py [截图目录]
import base64, json, os, re, subprocess, sys, tempfile, time, urllib.request, itertools
from playwright.sync_api import sync_playwright, expect

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
PORT = 4197; BASE = f'http://localhost:{PORT}'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'syncshots'); os.makedirs(OUT, exist_ok=True)
md = open(os.path.join(HERE, 'sample-v2.md'), encoding='utf-8').read()

# ———— 模拟后端 ————
S = {'trips': {}, 'members': [], 'invites': [], 'versions': [], 'files': {}, 'events': [], 'suggestions': []}
seq = itertools.count(1)
def ts(): return f'2026-10-18T00:00:{next(seq):02d}.000Z'
def is_member(me, t): return any(m['tripId'] == t and m['userId'] == me for m in S['members'])
def is_owner(me, t): return t in S['trips'] and S['trips'][t]['owner'] == me

def mname(t, u): return next((m['name'] for m in S['members'] if m['tripId'] == t and m['userId'] == u), None)
def log(t, me, kind, title, detail=None):
    S['events'].append({'id': len(S['events']) + 1, 'tripId': t, 'actorId': me, 'actorName': mname(t, me), 'kind': kind, 'title': title, 'detail': detail or {}, 'createdAt': ts()})

def handle(me, name, a):
    if not me: raise Exception('请先登录')
    if name == 'createTrip':
        tid, title, nm = a
        if tid not in S['trips']:
            S['trips'][tid] = {'owner': me, 'title': title, 'version': 0, 'note': None, 'important': False, 'updatedAt': ts()}
            S['members'].append({'tripId': tid, 'userId': me, 'name': nm, 'role': 'owner'})
        return None
    if name == 'publish':
        tid, note, important, snap, title, summary = a
        if not is_owner(me, tid): raise Exception('只有主用户可以发布更新')
        t = S['trips'][tid]; t['version'] += 1; t.update(note=note, important=important, title=title, updatedAt=ts())
        S['versions'].append({'tripId': tid, 'version': t['version'], 'note': note, 'important': important, 'snapshot': snap, 'createdAt': ts()})
        log(tid, me, 'publish', f"{mname(tid, me) or '有人'} 发布了 v{t['version']}{'（重要更新）' if important else ''}", {'version': t['version'], 'note': note, 'important': important, 'summary': summary or {}})
        return t['version']
    if name == 'latest':
        return [{'id': i, 'title': S['trips'][i]['title'], 'version': S['trips'][i]['version'], 'note': S['trips'][i]['note'], 'important': S['trips'][i]['important'], 'updatedAt': S['trips'][i]['updatedAt']} for i in a[0] if is_member(me, i)]
    if name == 'fetchVersion':
        tid, v = a
        if not is_member(me, tid): return None
        vs = [x for x in S['versions'] if x['tripId'] == tid]
        r = next((x for x in vs if x['version'] == v), None) if v else (vs[-1] if vs else None)
        return r and {k: r[k] for k in ('version', 'note', 'important', 'snapshot', 'createdAt')}
    if name == 'members':
        return [{'userId': m['userId'], 'name': m['name'], 'role': m['role']} for m in S['members'] if m['tripId'] == a[0]] if is_member(me, a[0]) else []
    if name == 'tripInvites':
        return [{k: i[k] for k in ('id', 'tripId', 'code', 'name', 'acceptedAt', 'createdAt')} for i in S['invites'] if i['tripId'] == a[0]] if is_owner(me, a[0]) else []
    if name == 'createInvite':
        tid, nm = a
        if not is_owner(me, tid): raise Exception('只有主用户可以邀请')
        code = f'QACODE{next(seq):04d}'
        inviter = next((m['name'] for m in S['members'] if m['tripId'] == tid and m['userId'] == me), None)
        S['invites'].append({'id': f'inv{next(seq)}', 'tripId': tid, 'code': code, 'name': nm, 'inviterName': inviter, 'acceptedAt': None, 'acceptedBy': None, 'createdAt': ts()})
        return code
    if name == 'revokeInvite':
        S['invites'] = [i for i in S['invites'] if not (i['id'] == a[0] and is_owner(me, i['tripId']))]; return None
    if name == 'removeMember':
        tid, uid = a
        if not is_owner(me, tid): raise Exception('只有主用户可以移除成员')
        gone = [m for m in S['members'] if m['tripId'] == tid and m['userId'] == uid and m['role'] == 'member']
        S['members'] = [m for m in S['members'] if m not in gone]
        if gone: log(tid, me, 'remove', f"{mname(tid, me) or '有人'} 移除了 {gone[0]['name'] or '一位同伴'}")
        S['invites'] = [i for i in S['invites'] if not (i['tripId'] == tid and i['acceptedBy'] == uid)]
        return None
    if name == 'peekInvite':
        c = a[0].upper().replace('-', '').replace(' ', '')
        inv = next((i for i in S['invites'] if i['code'] == c), None)
        if not inv: return None
        t = S['trips'][inv['tripId']]
        return {'tripId': inv['tripId'], 'tripTitle': t['title'], 'inviterName': inv['inviterName'], 'name': inv['name'],
                'usable': (inv['acceptedBy'] in (None, me)) and t['owner'] != me, 'mine': t['owner'] == me or inv['acceptedBy'] == me}
    if name == 'joinWithCode':
        c, nm_ = a
        c = c.upper().replace('-', '').replace(' ', '')
        inv = next((i for i in S['invites'] if i['code'] == c), None)
        if not inv: raise Exception('邀请码不对，或者已被主用户撤回')
        if inv['acceptedBy'] not in (None, me): raise Exception('这个邀请码已经在别的手机上用过了，请主用户重新生成')
        if not is_member(me, inv['tripId']):
            S['members'].append({'tripId': inv['tripId'], 'userId': me, 'name': nm_, 'role': 'member'})
            log(inv['tripId'], me, 'join', f"{nm_} 加入了旅程")
        inv['acceptedAt'] = inv['acceptedAt'] or ts(); inv['acceptedBy'] = me; return inv['tripId']
    if name == 'submitSuggestion':
        tid, base, note, changes, summary = a
        if not is_member(me, tid) or is_owner(me, tid): raise Exception('只有同伴可以提交建议')
        sg = {'id': f'sg{next(seq)}', 'tripId': tid, 'authorId': me, 'authorName': mname(tid, me), 'baseVersion': base, 'note': note or None, 'changes': changes, 'status': 'pending', 'decisions': None, 'createdAt': ts(), 'decidedAt': None}
        S['suggestions'].append(sg)
        log(tid, me, 'suggest', f"{mname(tid, me) or '有人'} 提交了 {len(changes)} 处修改建议", {'suggestionId': sg['id'], 'note': note or None, 'count': len(changes), 'summary': summary or {}})
        return sg['id']
    if name == 'suggestions':
        return [x for x in reversed(S['suggestions']) if x['tripId'] == a[0] and (is_owner(me, a[0]) or x['authorId'] == me)]
    if name == 'decideSuggestion':
        sid, decisions, acc, rej = a
        sg = next((x for x in S['suggestions'] if x['id'] == sid), None)
        if not sg: raise Exception('建议不存在或已撤回')
        if not is_owner(me, sg['tripId']): raise Exception('只有主用户可以处理建议')
        if sg['status'] != 'pending': raise Exception('这条建议已经处理过了')
        sg['status'] = 'accepted' if rej == 0 else 'rejected' if acc == 0 else 'partial'; sg['decisions'] = decisions; sg['decidedAt'] = ts()
        who = mname(sg['tripId'], me) or '有人'
        t = f"{who} 没有采纳 {sg['authorName']} 的建议" if sg['status'] == 'rejected' else f"{who} 采纳了 {sg['authorName']} 的 {acc} 处建议" + (f"（{rej} 处未采纳）" if sg['status'] == 'partial' else '')
        log(sg['tripId'], me, 'decide', t, {'suggestionId': sid, 'authorId': sg['authorId'], 'accepted': acc, 'rejected': rej})
        return None
    if name == 'withdrawSuggestion':
        S['suggestions'] = [x for x in S['suggestions'] if not (x['id'] == a[0] and x['authorId'] == me and x['status'] == 'pending')]; return None
    if name == 'events':
        ids, after = a
        return [e for e in S['events'] if e['tripId'] in ids and is_member(me, e['tripId']) and (not after or e['id'] > after)][-100:]
    if name == 'leaveTrip':
        S['members'] = [m for m in S['members'] if not (m['tripId'] == a[0] and m['userId'] == me and m['role'] == 'member')]; return None
    if name == 'upload':
        path, b64, typ = a
        if not is_owner(me, path.split('/')[0]): raise Exception('只有主用户能上传')
        S['files'].setdefault(path, (b64, typ)); return None
    if name == 'download':
        path = a[0]
        if not is_member(me, path.split('/')[0]): raise Exception('没有权限')
        if path not in S['files']: raise Exception('Object not found')
        b64, typ = S['files'][path]; return {'b64': b64, 'type': typ}
    raise Exception('unknown ' + name)

def binding(source, payload):
    req = json.loads(payload)
    try:
        return json.dumps({'ok': handle(req['me'], req['name'], req['args'])})
    except Exception as e:
        return json.dumps({'err': str(e)})

FAKE_JS = r'''
(() => {
  const K = 'fake-cloud-session';
  const get = () => { try { return JSON.parse(localStorage.getItem(K) || 'null'); } catch { return null; } };
  const listeners = new Set();
  const call = async (name, args) => {
    const s = get();
    const r = JSON.parse(await window.__cloudCall(JSON.stringify({ me: s && s.userId, name, args })));
    if (r.err) throw new Error(r.err);
    return r.ok;
  };
  const b64 = (blob) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.readAsDataURL(blob); });
  window.__CLOUD_FAKE__ = {
    async getSession() { return get(); },
    async ensureSession() {
      let s = get();
      if (!s) { s = { userId: 'u:' + Math.random().toString(36).slice(2) }; localStorage.setItem(K, JSON.stringify(s)); listeners.forEach((l) => l(s)); }
      return s;
    },
    onSessionChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    createTrip: (id, title, name) => call('createTrip', [id, title, name]),
    publish: (t, n, i, snap, title, summary) => call('publish', [t, n, i, snap, title, summary ?? null]),
    events: (ids, after) => call('events', [ids, after ?? null]),
    submitSuggestion: (t, b, n, c, s) => call('submitSuggestion', [t, b, n, c, s ?? null]),
    suggestions: (t) => call('suggestions', [t]),
    decideSuggestion: (i, d, a, r) => call('decideSuggestion', [i, d, a, r]),
    withdrawSuggestion: (i) => call('withdrawSuggestion', [i]),
    watchEvents() { return () => {}; },
    latest: (ids) => call('latest', [ids]),
    fetchVersion: (t, v) => call('fetchVersion', [t, v ?? null]),
    members: (t) => call('members', [t]),
    tripInvites: (t) => call('tripInvites', [t]),
    createInvite: (t, n) => call('createInvite', [t, n]),
    revokeInvite: (i) => call('revokeInvite', [i]),
    removeMember: (t, u) => call('removeMember', [t, u]),
    peekInvite: (c) => call('peekInvite', [c]),
    joinWithCode: (c, n) => call('joinWithCode', [c, n]),
    leaveTrip: (t) => call('leaveTrip', [t]),
    async upload(path, blob) { await call('upload', [path, await b64(blob), blob.type]); },
    async download(path) {
      const r = await call('download', [path]);
      const bin = atob(r.b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return new Blob([u], { type: r.type });
    },
  };
})();
'''

srv = subprocess.Popen(['npx', 'vite', 'preview', '--port', str(PORT), '--strictPort'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

try:
    for _ in range(60):
        try: urllib.request.urlopen(BASE, timeout=1); break
        except Exception: time.sleep(.5)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        def ctx_for(w, h):
            c = b.new_context(viewport={'width': w, 'height': h}, locale='zh-CN', timezone_id='Asia/Singapore')
            c.expose_binding('__cloudCall', binding)
            c.add_init_script(FAKE_JS)
            pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            return c, pg, errs
        oc, op, oerr = ctx_for(1280, 860)
        mc, mp, merr = ctx_for(390, 844)

        # 主用户：导入、登录、开启同步、邀请
        op.goto(BASE + '/import/paste'); op.locator('textarea').fill(md); op.get_by_text('解析并预览').click()
        op.get_by_role('button', name='确认导入').click(); op.wait_for_url('**/itinerary/**')
        trip = op.url.rsplit('/', 1)[1]
        # 从旅程页的「邀请同伴」入口进到设置的同步区块
        op.goto(f'{BASE}/itinerary/{trip}'); op.wait_for_timeout(400)
        op.get_by_role('button', name='邀请同伴').click(); op.wait_for_url('**/settings#sync')
        op.wait_for_timeout(600)
        op.get_by_text('开启同步（成为主用户）').click()
        dlg = op.get_by_role('dialog', name='开启同步')
        dlg.get_by_role('button', name='开启并发布第一版').click()
        expect(op.get_by_text('先填你的名字，同伴会看到')).to_be_visible()
        dlg.get_by_label('你的名字').fill('阿权'); dlg.get_by_role('button', name='开启并发布第一版').click()
        expect(op.get_by_text('已开启同步，现在可以邀请同伴')).to_be_visible()
        expect(op.get_by_text('v1')).to_be_visible()
        op.evaluate('navigator.share = undefined')
        op.context.grant_permissions(['clipboard-read', 'clipboard-write'])
        op.get_by_label('同伴的名字').fill('小明'); op.get_by_role('button', name='生成邀请', exact=True).click()
        expect(op.get_by_text('已复制邀请，可以贴给同伴')).to_be_visible()
        expect(op.get_by_text(re.compile('还没加入 · 邀请码'))).to_be_visible()
        shared = op.evaluate('navigator.clipboard.readText()')
        link = re.search(r'https?://\S+/join/(\w+)', shared); assert link, shared
        code = link.group(1)
        assert '阿权 邀请你一起看' in shared, shared
        op.screenshot(path=os.path.join(OUT, '1280-01-owner-settings.png'), full_page=True)
        assert S['trips'][trip]['version'] == 1 and len(S['versions']) == 1
        print('ok owner enable + invite')

        # 同伴：在「旅程」页输入邀请码 → 看到旅程 → 填名字加入
        mp.goto(BASE + '/trips'); mp.wait_for_timeout(400)
        mp.get_by_label('收到同伴的邀请？').fill(code[:5].lower() + '-' + code[5:]); mp.get_by_role('button', name='加入', exact=True).click()
        mp.wait_for_url('**/join/**')
        expect(mp.get_by_text('阿权 邀请你一起看这份行程')).to_be_visible()
        expect(mp.get_by_label('你的名字')).to_have_value('小明')
        mp.screenshot(path=os.path.join(OUT, '390-01-invite.png'), full_page=True)
        mp.get_by_role('button', name='加入并下载行程').click(); mp.wait_for_url('**/itinerary/**')
        assert mp.url.endswith(trip)
        mp.get_by_role('tab').nth(1).click(); mp.wait_for_timeout(300)
        mp.get_by_role('checkbox', name='标记完成：小樽运河').click(); mp.wait_for_timeout(300)
        print('ok mate join')

        # 主用户：底部「通知」有红点，点进去看到「小明 加入了旅程」
        op.goto(f'{BASE}/trips'); op.wait_for_timeout(800)
        expect(op.get_by_role('link', name='通知（1 条未读）')).to_be_visible()
        op.get_by_role('link', name='通知（1 条未读）').click(); op.wait_for_url('**/notifications')
        expect(op.get_by_text('小明 加入了旅程')).to_be_visible()
        expect(op.get_by_text('你 发布了 v1')).to_be_visible()
        op.screenshot(path=os.path.join(OUT, '1280-00-notify.png'), full_page=True)
        expect(op.get_by_role('link', name='通知', exact=True)).to_be_visible()
        print('ok owner sees join notification')

        # 主用户：改标题和时间，发布重要更新
        op.goto(f'{BASE}/itinerary/{trip}'); op.get_by_role('tab').nth(1).click(); op.wait_for_timeout(300)
        op.get_by_text('小樽运河').first.click(); op.wait_for_url('**/item/**')
        op.get_by_role('button', name='编辑这一项').click(); op.wait_for_url('**/edit')
        op.get_by_label('标题').fill('小樽运河散步'); op.get_by_label('开始时间').fill('11:00')
        op.get_by_role('button', name='保存').last.click(); op.wait_for_timeout(500)
        op.goto(f'{BASE}/trip/{trip}/settings'); op.wait_for_timeout(600)
        op.get_by_text('发布更新（1 处改动）').click()
        dlg = op.get_by_role('dialog', name='发布更新')
        expect(dlg).to_contain_text('小樽运河散步')
        dlg.get_by_placeholder('例如：Day 3 改坐 JR，酒店换了').fill('Day 2 运河晚一点去')
        dlg.get_by_text('重要更新（同伴那边醒目提醒）').click()
        op.screenshot(path=os.path.join(OUT, '1280-02-publish.png'))
        dlg.get_by_role('button', name='发布').click()
        expect(op.get_by_text('已发布 v2')).to_be_visible()
        print('ok owner publish v2')

        # 同伴：通知页看到「阿权 发布了 v2（重要更新）」和改了什么，点它进预览
        mp.goto(f'{BASE}/notifications'); mp.wait_for_timeout(800)
        expect(mp.get_by_text('阿权 发布了 v2（重要更新）')).to_be_visible()
        expect(mp.get_by_text('Day 2 运河晚一点去').first).to_be_visible()
        expect(mp.get_by_text('修改 1')).to_be_visible()
        mp.screenshot(path=os.path.join(OUT, '390-01b-notify.png'), full_page=True)
        mp.get_by_text('阿权 发布了 v2（重要更新）').click(); mp.wait_for_url('**/update')
        print('ok mate sees publish notification')

        # 同伴：重新打开就看到重要更新 → 预览 → 套用；勾选保留
        mp.goto(f'{BASE}/itinerary/{trip}'); mp.wait_for_timeout(800)
        expect(mp.get_by_text('重要更新 v2：Day 2 运河晚一点去')).to_be_visible()
        mp.screenshot(path=os.path.join(OUT, '390-02-notice.png'))
        mp.get_by_role('button', name='查看', exact=True).click(); mp.wait_for_url('**/update')
        expect(mp.get_by_text('小樽运河散步')).to_be_visible()
        mp.screenshot(path=os.path.join(OUT, '390-03-preview.png'), full_page=True)
        mp.get_by_role('button', name='套用这个版本').click(); mp.wait_for_url(f'**/itinerary/{trip}')
        expect(mp.get_by_text('重要更新 v2')).to_have_count(0)
        mp.get_by_role('tab').nth(1).click(); mp.wait_for_timeout(300)
        expect(mp.get_by_role('checkbox', name='取消完成：小樽运河散步')).to_be_visible()
        # 同伴设置：主用户、已套用 v2、没有发布按钮
        mp.goto(f'{BASE}/trip/{trip}/settings'); mp.wait_for_timeout(500)
        expect(mp.get_by_text('阿权')).to_be_visible()
        expect(mp.get_by_text('v2')).to_be_visible()
        expect(mp.get_by_text('发布更新')).to_have_count(0)
        mp.screenshot(path=os.path.join(OUT, '390-04-mate-settings.png'), full_page=True)
        print('ok mate apply v2 (check kept)')

        # 主用户：成员名单里有同伴；移除后同伴看到提示
        op.goto(f'{BASE}/trip/{trip}/settings'); op.wait_for_timeout(600)
        expect(op.get_by_text('小明')).to_be_visible(); expect(op.get_by_text('已加入')).to_be_visible()
        op.screenshot(path=os.path.join(OUT, '1280-03-members.png'), full_page=True)
        op.get_by_role('button', name='移除').click(); op.get_by_role('button', name='移除', exact=True).last.click()
        expect(op.get_by_text('已移除')).to_be_visible()
        mp.reload(); mp.wait_for_timeout(800)
        expect(mp.get_by_text('你已经不在这份旅程的成员名单里')).to_be_visible()
        print('ok remove member')

        # 第三台手机：用过的邀请码不能再用
        tc, tp, terr = ctx_for(390, 844)
        tp.goto(f'{BASE}/join/{code}'); tp.wait_for_timeout(800)
        expect(tp.get_by_text('这个邀请用不了')).to_be_visible()
        # 主用户再生成一个，第三台手机能用；同一个在第四台手机上就显示用过了
        op.get_by_label('同伴的名字').fill('小红'); op.get_by_role('button', name='生成邀请', exact=True).click(); op.wait_for_timeout(500)
        code2 = re.search(r'/join/(\w+)', op.evaluate('navigator.clipboard.readText()')).group(1)
        tp.goto(f'{BASE}/join/{code2}'); tp.get_by_role('button', name='加入并下载行程').click(); tp.wait_for_url('**/itinerary/**')
        fc, fp, ferr = ctx_for(390, 844)
        fp.goto(f'{BASE}/join/{code2}'); expect(fp.get_by_text('这个邀请已经被用过了')).to_be_visible()
        assert not terr and not ferr, (terr, ferr)
        print('ok one code one phone')

        for pg in (op, mp):
            assert pg.evaluate('document.documentElement.scrollWidth > innerWidth') is False
        assert not oerr and not merr, (oerr, merr)
        print('SYNC PASS')
finally:
    srv.terminate()
