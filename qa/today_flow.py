# 2026-10 第一批 ⑤ 「今天」页 浏览器验收
# 运行：npm run build && python3 qa/today_flow.py [截图目录]
import datetime, os, re, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright, expect

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
PORT = 4193; BASE = f'http://localhost:{PORT}'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'todayshots'); os.makedirs(OUT, exist_ok=True)
md = open(os.path.join(HERE, 'sample-v2.md'), encoding='utf-8').read()
# 东京 2027-01-14 10:30（Day 2，小樽一日游）
NOW = datetime.datetime(2027, 1, 14, 1, 30, tzinfo=datetime.timezone.utc)

srv = subprocess.Popen(['npx', 'vite', 'preview', '--port', str(PORT), '--strictPort'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(60):
        try: urllib.request.urlopen(BASE, timeout=1); break
        except Exception: time.sleep(.5)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for w, h in [(390, 844), (1280, 860)]:
            ctx = b.new_context(viewport={'width': w, 'height': h}, locale='zh-CN', timezone_id='Asia/Singapore')
            page = ctx.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            page.clock.install(time=NOW)
            page.goto(BASE + '/import/paste'); page.locator('textarea').fill(md); page.get_by_text('解析并预览').click()
            page.get_by_role('button', name='确认导入').click(); page.wait_for_url('**/itinerary/**')
            # 行程页入口
            page.get_by_role('button', name=re.compile('^今天 · Day 2')).click(); page.wait_for_url('**/today')
            expect(page.get_by_text('今天 · Day 2')).to_be_visible()
            nxt = page.get_by_role('region', name='下一项')
            # 10:30 了早餐还没点完成：仍是下一项，只提示晚了多久和原定现在
            expect(nxt.get_by_role('button', name='打开详情：酒店早餐')).to_be_visible()
            expect(nxt).to_contain_text('原定 08:00')
            expect(nxt).to_contain_text('已过 2 小时 30 分')
            expect(nxt).to_contain_text('按原定时间，现在应在「小樽运河」')
            expect(page.get_by_role('region', name='今晚住')).to_contain_text('札幌站前酒店入住')
            expect(page.get_by_role('region', name='今天穿')).to_contain_text('这一天还没安排穿搭')
            page.screenshot(path=os.path.join(OUT, f'{w}-01-today.png'), full_page=True)
            # 完成 → 小樽运河；跳过 → 三角市场
            nxt.get_by_role('button', name='完成').click()
            expect(nxt.get_by_role('button', name='打开详情：小樽运河')).to_be_visible()
            expect(nxt).to_contain_text('已过 30 分钟')
            nxt.get_by_role('button', name='跳过').click()
            expect(nxt.get_by_role('button', name='打开详情：三角市场海鲜丼')).to_be_visible()
            expect(nxt).not_to_contain_text('已过')
            expect(nxt).not_to_contain_text('按原定时间')       # 小樽运河已跳过，不再提示
            agenda = page.get_by_role('region', name='Day 2 全部安排')
            expect(agenda).to_contain_text('已完成')
            expect(agenda).to_contain_text('已跳过')
            # 酒店：给司机看
            page.get_by_role('region', name='今晚住').get_by_role('button', name='给司机看').click()
            expect(page.get_by_role('dialog').get_by_role('heading', name='札幌駅前ホテル')).to_be_visible()
            page.get_by_role('dialog').get_by_role('button', name='关闭').click()
            # 酒店：出示预订（只有编号）
            page.get_by_role('region', name='今晚住').get_by_role('button', name='出示预订').click()
            expect(page.get_by_role('dialog')).to_contain_text('DEMO-H01')
            page.get_by_role('dialog').get_by_role('button', name='关闭').click()
            # 手动切到 Day 1 预览：交通与订单列出航班
            page.get_by_role('tab').nth(0).click()
            expect(page.get_by_text('预览 · Day 1')).to_be_visible()
            expect(page.get_by_role('region', name='今天的交通与订单')).to_contain_text('吉隆坡 → 新千岁')
            # Day 4：没有住宿；回到今天
            page.get_by_role('tab').nth(3).click()
            expect(page.get_by_role('region', name='今晚住')).to_contain_text('这一晚没有住宿安排')
            page.screenshot(path=os.path.join(OUT, f'{w}-02-day4.png'), full_page=True)
            page.get_by_role('button', name='回到今天').click()
            expect(page.get_by_text('今天 · Day 2')).to_be_visible()
            # 安排了穿搭后显示
            page.get_by_role('region', name='今天穿').get_by_role('button', name='安排穿搭').click(); page.wait_for_url('**/outfits')
            page.get_by_role('button', name='编辑 Day 2 的穿搭').click()
            page.get_by_role('button', name='新增单品').last.click()
            dlg = page.get_by_role('dialog', name='新增单品')
            dlg.get_by_placeholder('例如：黑色羽绒外套').fill('防风外套'); dlg.get_by_role('tab', name='外套').click(); dlg.get_by_role('button', name='保存').click()
            page.get_by_role('button', name='保存（1 件）').click()
            page.go_back(); page.wait_for_url('**/today')
            expect(page.get_by_role('region', name='今天穿')).to_contain_text('防风外套')
            page.screenshot(path=os.path.join(OUT, f'{w}-03-today-after.png'), full_page=True)
            assert page.evaluate('document.documentElement.scrollWidth > innerWidth') is False
            assert not errs, errs
            print('ok', w)
            ctx.close()

        # 出发前：预览 Day 1
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='zh-CN', timezone_id='Asia/Singapore')
        page = ctx.new_page(); page.clock.install(time=datetime.datetime(2026, 12, 20, 2, 0, tzinfo=datetime.timezone.utc))
        page.goto(BASE + '/import/paste'); page.locator('textarea').fill(md); page.get_by_text('解析并预览').click()
        page.get_by_role('button', name='确认导入').click(); page.wait_for_url('**/itinerary/**')
        page.get_by_role('button', name='预览「今天」页（从 Day 1 开始）').click()
        expect(page.get_by_text('还没出发 · 先预览 Day 1')).to_be_visible()
        expect(page.get_by_role('region', name='下一项')).not_to_contain_text('已过')
        print('ok before-trip')
        ctx.close()
finally:
    srv.terminate()
