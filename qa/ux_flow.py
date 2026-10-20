# 2026-10-19 访问与首次使用验收：具体行程链接的各种状态、资料页三种状态、首页两条路径、粘贴导入（空 / 示例 / 错误 / 部分识别）、刷新与前进后退
# 运行：npm run build && python3 qa/ux_flow.py [截图目录]
import os, re, subprocess, sys, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'sync_flow.py'), encoding='utf-8').read()
exec(src[:src.index('srv = subprocess.Popen')].replace("PORT = 4197", "PORT = 4208").replace("'syncshots'", "'uxshots'"))
from playwright.sync_api import sync_playwright, expect

BAD_LINE = md.replace('### [spot] 10:00 白色恋人公园', '### [spot] 25:99 白色恋人公园')
srv = subprocess.Popen(['npx', 'vite', 'preview', '--port', str(PORT), '--strictPort'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
OFFLINE = {'on': False}
orig_binding = binding
def flaky(source, payload):
    if OFFLINE['on']: return json.dumps({'err': 'Failed to fetch'})
    return orig_binding(source, payload)
try:
    for _ in range(60):
        try: urllib.request.urlopen(BASE, timeout=1); break
        except Exception: time.sleep(.5)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        def ctx(dev='Pixel 7', viewport=None):
            c = b.new_context(**(pw.devices[dev] if dev else {'viewport': viewport}), locale='zh-CN', timezone_id='Asia/Singapore')
            c.expose_binding('__cloudCall', flaky); c.add_init_script(FAKE_JS)
            pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            return c, pg, errs
        shot = lambda pg, name: pg.screenshot(path=os.path.join(OUT, name), full_page=True)

        # ———— 首次使用：首页只有两条路；资料页、每日行程页没有旅程时给下一步 ————
        nc, npg, nerr = ctx()
        npg.goto(BASE + '/trips'); npg.wait_for_timeout(500)
        expect(npg.get_by_role('heading', name='下一段旅程，从这里开始')).to_be_visible()
        # 390×844 首屏不用滚动就能看到：主按钮、次按钮、示例与模板、邀请码
        for loc in (npg.get_by_role('button', name='粘贴行程文字'), npg.get_by_role('button', name='导入文件'), npg.get_by_role('button', name='查看示例与模板'), npg.get_by_label('收到同伴的邀请？')):
            box = loc.bounding_box(); assert box and box['y'] + box['height'] <= 844 - 64, (loc, box)
        expect(npg.get_by_text('恢复备份')).to_have_count(0)
        npg.get_by_role('button', name='加入', exact=True).click()
        expect(npg.get_by_text('请填主用户给你的邀请码')).to_be_visible()
        npg.get_by_label('收到同伴的邀请？').fill('a!'); npg.get_by_role('button', name='加入', exact=True).click()
        expect(npg.get_by_text('邀请码格式不对')).to_be_visible()
        shot(npg, '390-01-home-empty.png')
        npg.get_by_role('button', name='更多').click(); expect(npg.get_by_text('恢复备份')).to_be_visible(); npg.keyboard.press('Escape')
        npg.goto(BASE + '/docs'); expect(npg.get_by_text('先创建或加入旅程，再添加机票')).to_be_visible()
        expect(npg.get_by_text('点右上角')).to_have_count(0)
        expect(npg.get_by_role('button', name='创建旅程')).to_be_visible()
        shot(npg, '390-02-docs-notrip.png')
        npg.goto(BASE + '/itinerary'); expect(npg.get_by_text('创建或加入一份旅程后')).to_be_visible()
        npg.get_by_role('button', name='用邀请码加入').click(); npg.wait_for_url('**/trips#join')
        tabs = [t.inner_text().replace('\n', '') for t in npg.get_by_role('navigation', name='主导航').get_by_role('link').all()]
        assert tabs == ['旅程', '日程', '资料'], tabs
        print('ok first-run home / docs / itinerary empty states')

        # ———— 粘贴：空、示例、错误（原文保留）、部分识别（警告） ————
        npg.goto(BASE + '/import/paste')
        ta = npg.get_by_label('行程内容'); expect(ta).to_be_visible()
        expect(npg.get_by_text('能识别的格式：')).to_be_visible()
        npg.get_by_role('button', name='解析并预览').click()
        expect(npg.get_by_text('还没有内容。')).to_be_visible()
        npg.get_by_role('button', name='查看格式示例').click()
        expect(ta).to_have_value(re.compile('示例：北海道 4 天'))
        shot(npg, '390-03-paste-sample.png')
        ta.fill('明天去小樽，下午看运河，晚上吃海鲜'); npg.get_by_role('button', name='解析并预览').click(); npg.wait_for_url('**/preview')
        expect(npg.get_by_text('没有识别到任何一天').first).to_be_visible()
        expect(npg.get_by_role('button', name='确认导入')).to_be_disabled()
        shot(npg, '390-04-preview-error.png')
        npg.get_by_role('button', name='返回修改').click(); npg.wait_for_url('**/paste')
        expect(npg.get_by_label('行程内容')).to_have_value('明天去小樽，下午看运河，晚上吃海鲜')
        npg.get_by_label('行程内容').fill(BAD_LINE); npg.get_by_role('button', name='解析并预览').click(); npg.wait_for_url('**/preview')
        expect(npg.get_by_text(re.compile('开始时间无法识别')).first).to_be_visible()
        print('ok paste empty / sample / error keeps text / partial warning')

        # ———— 主用户（有旅程）：首页先看到自己的旅程；具体链接直接显示；刷新、前进后退 ————
        oc, op, oerr = ctx(None, {'width': 1280, 'height': 860})
        op.goto(BASE + '/import/paste'); op.get_by_label('行程内容').fill(md); op.get_by_role('button', name='解析并预览').click()
        op.get_by_role('button', name='确认导入').click(); op.wait_for_url('**/itinerary/**')
        trip = op.url.rsplit('/', 1)[1]
        # 2026-10-20：电脑上不再显示行程页头（旅程名在左侧导航里）
        expect(op.get_by_role('navigation', name='主导航')).to_contain_text('北海道，日本')
        op.goto(BASE + '/trips'); expect(op.get_by_text('我的旅程（1）')).to_be_visible()  # 有旅程：先看到自己的旅程
        first_heading = op.locator('main h2, main h3').first.inner_text()
        assert '我的旅程' in first_heading or '北海道' in op.locator('main').inner_text()[:200], first_heading
        shot(op, '1280-01-home-trips.png')
        op.goto(f'{BASE}/itinerary/{trip}'); expect(op.get_by_text('Day 1').first).to_be_visible()
        op.reload(); expect(op.get_by_text('Day 1').first).to_be_visible()
        op.get_by_role('button', name='邀请同伴').click(); op.wait_for_url('**/settings#sync')
        op.go_back(); expect(op.get_by_text('Day 1').first).to_be_visible(); assert op.url.endswith(trip)
        op.go_forward(); op.wait_for_url('**/settings#sync')
        op.goto(f'{BASE}/docs'); expect(op.get_by_role('button', name='添加资料').first).to_be_visible()
        expect(op.get_by_text('未上传证明').first).to_be_visible()  # 有预订项：列出来，等着加证明
        shot(op, '1280-02-docs-list.png')
        # 另一份只有景点的旅程：真正「没有资料」的状态，有能用的「添加资料」按钮
        SIMPLE = '# 小旅行\n- 日期: 01-02-2027 ~ 01-02-2027\n- 出发地时区: Asia/Singapore\n\n## Day 1 | 01-02-2027 | 新加坡 | Asia/Singapore | 散步\n\n### [spot] 10:00 植物园\n'
        op.goto(BASE + '/import/paste'); op.get_by_label('行程内容').fill(SIMPLE); op.get_by_role('button', name='解析并预览').click()
        op.get_by_role('button', name='确认导入').click(); op.wait_for_url('**/itinerary/**')
        op.goto(f'{BASE}/docs'); expect(op.get_by_text('还没有预订资料')).to_be_visible()
        op.get_by_role('button', name='添加资料').last.click(); expect(op.get_by_text('从文件选择')).to_be_visible()
        shot(op, '1280-03-docs-empty.png'); op.keyboard.press('Escape')
        op.goto(BASE + '/trips'); op.get_by_text('北海道，日本').first.click(); op.wait_for_url('**/itinerary')
        print('ok owner link / refresh / back-forward / docs empty with add')

        # 主用户开启同步、生成邀请
        op.goto(f'{BASE}/trip/{trip}/settings'); op.wait_for_timeout(500)
        op.get_by_text('开启同步（成为主用户）').click()
        d = op.get_by_role('dialog', name='开启同步'); d.get_by_label('你的名字').fill('阿权'); d.get_by_role('button', name='开启并发布第一版').click()
        expect(op.get_by_text('已开启同步，现在可以邀请同伴')).to_be_visible()
        code = op.evaluate("async(t)=>await window.__CLOUD_FAKE__.createInvite(t,'小明')", trip)

        # ———— 新浏览器直接打开具体行程链接：说明 + 邀请码加入 → 回到这份行程 ————
        npg.goto(f'{BASE}/itinerary/{trip}'); npg.wait_for_timeout(600)
        expect(npg.get_by_text('这台设备上没有这份旅程')).to_be_visible()
        expect(npg.get_by_text('直接复制网址不能分享')).to_be_visible()
        assert npg.url.endswith(trip), npg.url  # 不再跳走
        shot(npg, '390-05-link-no-access.png')
        npg.goto(f'{BASE}/itinerary/not-a-trip'); expect(npg.get_by_text('链接不完整或已失效')).to_be_visible()
        npg.goto(f'{BASE}/itinerary/{trip}'); npg.get_by_label('邀请码').fill(code[:5] + '-' + code[5:])
        npg.get_by_role('button', name='用邀请码加入').click(); npg.wait_for_url('**/join/**')
        npg.get_by_role('button', name='加入并下载行程').click(); npg.wait_for_url(f'**/itinerary/{trip}')
        expect(npg.get_by_role('navigation', name='主导航')).to_contain_text('北海道，日本') if npg.viewport_size['width'] >= 1024 else expect(npg.get_by_role('button', name=re.compile('当前旅程：北海道，日本'))).to_be_visible()
        expect(npg.get_by_text('同伴 · 已套用 v1')).to_be_visible()  # 真实同步状态
        shot(npg, '390-06-joined.png')
        print('ok no-access link → join → back to the trip')

        # ———— 同一设备的同伴：本机删了这份旅程后再打开链接 → 可以直接重新下载 ————
        npg.goto(f'{BASE}/trips'); npg.get_by_role('button', name=re.compile('删除')).first.click()
        npg.get_by_role('button', name='删除', exact=True).last.click(); npg.wait_for_timeout(500)
        npg.goto(f'{BASE}/itinerary/{trip}'); expect(npg.get_by_role('button', name='下载到这台设备')).to_be_visible()
        # 网络失败
        OFFLINE['on'] = True
        npg.reload(); expect(npg.get_by_text('所以没法确认你能不能看这份旅程')).to_be_visible()
        shot(npg, '390-07-link-network-error.png')
        OFFLINE['on'] = False
        npg.get_by_role('button', name='重试').click(); npg.get_by_role('button', name='下载到这台设备').click()
        expect(npg.get_by_text('Day 1').first).to_be_visible(timeout=8000)
        assert npg.url.endswith(trip)
        print('ok member re-download + network error state')

        for pg in (npg, op):
            assert pg.evaluate('document.documentElement.scrollWidth > innerWidth') is False
        assert not nerr and not oerr, (nerr, oerr)
        print('UX PASS')
finally:
    srv.terminate()
