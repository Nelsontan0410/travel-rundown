# 2026-10-19 同步第二步 浏览器验收：同伴本机改 → 勾选提交 → 主用户收到通知 → 逐项审核 → 发布 → 同伴收到「采纳」通知并套用
# 运行：npm run build && python3 qa/suggest_flow.py [截图目录]
import os, re, subprocess, sys, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'sync_flow.py'), encoding='utf-8').read()
exec(src[:src.index('srv = subprocess.Popen')].replace("PORT = 4197", "PORT = 4207").replace("'syncshots'", "'suggestshots'"))
from playwright.sync_api import sync_playwright, expect

srv = subprocess.Popen(['npx', 'vite', 'preview', '--port', str(PORT), '--strictPort'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(60):
        try: urllib.request.urlopen(BASE, timeout=1); break
        except Exception: time.sleep(.5)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        def ctx_for(w, h, dev=None):
            c = b.new_context(**(pw.devices[dev] if dev else {'viewport': {'width': w, 'height': h}}), locale='zh-CN', timezone_id='Asia/Singapore')
            c.expose_binding('__cloudCall', binding); c.add_init_script(FAKE_JS)
            pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            return c, pg, errs
        oc, op, oerr = ctx_for(1280, 860)
        mc, mp, merr = ctx_for(0, 0, 'Pixel 7')

        # 主用户开启同步、生成邀请
        op.goto(BASE + '/import/paste'); op.locator('textarea').fill(md); op.get_by_text('解析并预览').click()
        op.get_by_role('button', name='确认导入').click(); op.wait_for_url('**/itinerary/**')
        trip = op.url.rsplit('/', 1)[1]
        op.goto(f'{BASE}/trip/{trip}/settings'); op.wait_for_timeout(500)
        op.get_by_text('开启同步（成为主用户）').click()
        d = op.get_by_role('dialog', name='开启同步'); d.get_by_label('你的名字').fill('阿权'); d.get_by_role('button', name='开启并发布第一版').click()
        expect(op.get_by_text('已开启同步，现在可以邀请同伴')).to_be_visible()
        code = op.evaluate("async(t)=>await window.__CLOUD_FAKE__.createInvite(t,'小明')", trip)

        # 同伴加入，在本机改两项、加一项
        mp.goto(f'{BASE}/join/{code}'); mp.get_by_role('button', name='加入并下载行程').click(); mp.wait_for_url('**/itinerary/**')
        mp.get_by_role('tab').nth(1).click(); mp.wait_for_timeout(300)
        mp.get_by_text('小樽运河').first.click(); mp.wait_for_url('**/item/**')
        mp.get_by_role('button', name='编辑这一项').click(); mp.wait_for_url('**/edit')
        mp.get_by_label('开始时间').fill('11:30'); mp.get_by_role('button', name='保存').last.click(); mp.wait_for_timeout(600)
        mp.goto(f'{BASE}/itinerary/{trip}'); mp.wait_for_timeout(600)
        expect(mp.get_by_text('你在本机改了 1 处，只有你看得到')).to_be_visible()
        mp.get_by_role('tab').nth(1).click(); mp.wait_for_timeout(300)
        mp.get_by_text('三角市场海鲜丼').first.click(); mp.wait_for_url('**/item/**')
        mp.get_by_role('button', name='编辑这一项').click(); mp.wait_for_url('**/edit')
        mp.get_by_label('标题').fill('三角市场海鲜丼（早点去排队）'); mp.get_by_role('button', name='保存').last.click(); mp.wait_for_timeout(600)

        # 「我的修改」：取消勾选海鲜丼，只提交运河
        mp.goto(f'{BASE}/itinerary/{trip}'); mp.wait_for_timeout(500)
        mp.get_by_role('button', name='查看', exact=True).click(); mp.wait_for_url('**/suggest')
        expect(mp.get_by_text('Day 2 · 小樽运河')).to_be_visible()
        mp.get_by_label(re.compile('提交：修改 · Day 2 三角市场')).uncheck()
        mp.get_by_label('给主用户的说明（可选）').fill('下雪的话晚点出发')
        mp.screenshot(path=os.path.join(OUT, '390-01-mine.png'), full_page=True)
        mp.get_by_role('button', name='提交给主用户（1 处）').click()
        expect(mp.get_by_text('已提交 1 处给主用户')).to_be_visible()
        expect(mp.get_by_text('等待主用户')).to_be_visible()
        print('ok mate submit 1 of 2')

        # 主用户：通知 → 审核页 → 接受 → 现在发布
        op.goto(f'{BASE}/notifications'); op.wait_for_timeout(800)
        expect(op.get_by_text('小明 提交了 1 处修改建议')).to_be_visible()
        op.get_by_text('小明 提交了 1 处修改建议').click(); op.wait_for_url('**/suggestion/**')
        expect(op.get_by_text('下雪的话晚点出发')).to_be_visible()
        expect(op.get_by_text('改了：开始时间')).to_be_visible()
        op.screenshot(path=os.path.join(OUT, '1280-01-review.png'), full_page=True)
        op.get_by_role('button', name='确认（接受 1 · 不采纳 0）').click()
        dlg = op.get_by_role('alertdialog', name='已接受 1 处'); expect(dlg).to_be_visible()
        dlg.get_by_role('button', name='现在发布').click()
        op.wait_for_url('**/settings**'); expect(op.get_by_text('已发布 v2，大家都会收到')).to_be_visible()
        print('ok owner accept + publish')

        # 同伴：收到「采纳」和「发布」通知，套用后运河不再是本机修改，海鲜丼仍是
        mp.goto(f'{BASE}/notifications'); mp.wait_for_timeout(800)
        expect(mp.get_by_text('阿权 采纳了 小明 的 1 处建议')).to_be_visible()
        expect(mp.get_by_text('阿权 发布了 v2')).to_be_visible()
        mp.screenshot(path=os.path.join(OUT, '390-02-notify.png'), full_page=True)
        mp.get_by_text('阿权 发布了 v2').click(); mp.wait_for_url('**/update')
        mp.get_by_role('button', name='套用这个版本').click(); mp.wait_for_url(f'**/itinerary/{trip}')
        mp.goto(f'{BASE}/trip/{trip}/suggest'); mp.wait_for_timeout(800)
        expect(mp.get_by_text('Day 2 · 三角市场海鲜丼（早点去排队）')).to_be_visible()
        expect(mp.get_by_text('Day 2 · 小樽运河')).to_have_count(0)  # 已被采纳，不再是本机修改
        expect(mp.get_by_text('修改 · Day 2 小樽运河 · ✓ 已采纳')).to_be_visible()
        expect(mp.get_by_text('已采纳', exact=True)).to_be_visible()
        print('ok mate apply; unsent edit kept')

        for pg in (op, mp):
            assert pg.evaluate('document.documentElement.scrollWidth > innerWidth') is False
        assert not oerr and not merr, (oerr, merr)
        print('SUGGEST PASS')
finally:
    srv.terminate()
