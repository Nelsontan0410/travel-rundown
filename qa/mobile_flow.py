# 2026-10-19 手机端改版验收：每日行程层级（出发前 / 行程中 / 已结束）、下一站与导航按钮、导入步骤与草稿、
# 底部导航隐藏、360 / 390 / 桌面截图、长列表底部不遮挡
# 运行：npm run build && python3 qa/mobile_flow.py [截图目录]
import datetime, os, re, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright, expect

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
PORT = 4209; BASE = f'http://localhost:{PORT}'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'mobileshots'); os.makedirs(OUT, exist_ok=True)
md = open(os.path.join(HERE, 'sample-v2.md'), encoding='utf-8').read()
TOKYO = datetime.timezone(datetime.timedelta(hours=9))
srv = subprocess.Popen(['npx', 'vite', 'preview', '--port', str(PORT), '--strictPort'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(60):
        try: urllib.request.urlopen(BASE, timeout=1); break
        except Exception: time.sleep(.5)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        def page_at(when, w=390, h=844):
            c = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, is_mobile=w < 768, has_touch=w < 768, locale='zh-CN', timezone_id='Asia/Singapore')
            pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.clock.install(time=when)
            return pg, errs
        def import_trip(pg):
            pg.goto(BASE + '/import/paste')
            expect(pg.get_by_role('navigation', name='主导航')).to_have_count(0)  # 导入时不显示底部导航
            expect(pg.get_by_label(re.compile('导入步骤：第 1 步'))).to_be_visible()
            pg.get_by_label('行程内容').fill(md)
            pg.get_by_role('button', name='解析并预览').click(); pg.wait_for_url('**/preview')
            expect(pg.get_by_label(re.compile('导入步骤：第 2 步'))).to_be_visible()
            expect(pg.get_by_role('navigation', name='主导航')).to_have_count(0)
            pg.get_by_role('button', name='确认导入').click(); pg.wait_for_url('**/itinerary/**')
            return pg.url.rsplit('/', 1)[1]

        # ———— 行程中：东京 2027-01-14 10:30（Day 2） ————
        pg, errs = page_at(datetime.datetime(2027, 1, 14, 10, 30, tzinfo=TOKYO))
        trip = import_trip(pg)
        pg.wait_for_timeout(600)
        expect(pg.get_by_text('旅程第 2 天 · 共 4 天')).to_be_visible()
        expect(pg.get_by_role('tab', selected=True)).to_contain_text('14')
        expect(pg.get_by_role('tab', selected=True)).to_contain_text('周四')
        nxt = pg.get_by_role('region', name=re.compile('下一站|进行中'))
        expect(nxt).to_be_visible(); expect(nxt).to_contain_text('小樽运河')
        expect(nxt.get_by_role('button', name='导航')).to_be_visible()
        assert pg.get_by_text('未开启同步').count() == 0 and pg.get_by_text(re.compile('已同步|已发布|已套用')).count() == 0  # 没开同步就不显示同步状态
        pg.screenshot(path=os.path.join(OUT, '390-itinerary-today.png'))
        pg.screenshot(path=os.path.join(OUT, '390-itinerary-today-full.png'), full_page=True)
        # 完成运河后，下一站变成没地点的项 → 不显示导航
        pg.get_by_role('checkbox', name='标记完成：小樽运河').click(); pg.wait_for_timeout(400)
        expect(nxt).to_contain_text('三角市场海鲜丼')
        # 底部入口和长列表：最后一个元素可以滚到底部导航上方
        pg.evaluate('window.scrollTo(0, document.body.scrollHeight)'); pg.wait_for_timeout(300)
        last = pg.get_by_role('navigation', name='旅程工具').last.bounding_box()
        tab = pg.get_by_role('navigation', name='主导航').bounding_box()
        assert last['y'] + last['height'] <= tab['y'] + 1, (last, tab)
        expect(pg.get_by_role('button', name='预订资料')).to_be_visible(); expect(pg.get_by_role('button', name='邀请同伴')).to_be_visible()
        # 选一个过去的日子：不显示下一站
        pg.evaluate('window.scrollTo(0,0)'); pg.get_by_role('tab', name=re.compile('13')).click(); pg.wait_for_timeout(300)
        expect(pg.get_by_role('region', name=re.compile('下一站|进行中|当天第一站'))).to_have_count(0)
        pg.get_by_role('tab', name=re.compile('15')).click(); pg.wait_for_timeout(300)
        expect(pg.get_by_role('region', name='当天第一站')).to_contain_text('白色恋人公园')
        assert not errs, errs
        print('ok during trip: phase / selected day / next stop / nav only with place / past & future days')

        # 草稿：粘贴一半返回，再进来还在；刷新也在
        pg.goto(BASE + '/import/paste'); pg.get_by_label('行程内容').fill('# 草稿测试')
        pg.go_back(); pg.goto(BASE + '/import/paste'); expect(pg.get_by_label('行程内容')).to_have_value('# 草稿测试')
        pg.reload(); expect(pg.get_by_label('行程内容')).to_have_value('# 草稿测试')
        pg.screenshot(path=os.path.join(OUT, '390-import-step1.png'))
        print('ok draft kept across back / reload')

        # ———— 出发前（360 宽）：显示倒数、当天第一站 ————
        pg2, errs2 = page_at(datetime.datetime(2026, 12, 20, 10, 0, tzinfo=TOKYO), 360, 740)
        import_trip(pg2); pg2.wait_for_timeout(600)
        expect(pg2.get_by_text(re.compile(r'\d+ 天后出发'))).to_be_visible()
        expect(pg2.get_by_role('region', name='当天第一站')).to_contain_text('吉隆坡')
        assert pg2.evaluate('document.documentElement.scrollWidth > innerWidth') is False
        pg2.screenshot(path=os.path.join(OUT, '360-itinerary-before.png'))
        pg2.goto(BASE + '/trips'); pg2.wait_for_timeout(400); pg2.screenshot(path=os.path.join(OUT, '360-trips.png'))
        print('ok before trip at 360px')

        # ———— 已结束 ————
        pg3, _ = page_at(datetime.datetime(2027, 2, 1, 10, 0, tzinfo=TOKYO))
        import_trip(pg3); pg3.wait_for_timeout(600)
        expect(pg3.get_by_text('旅程已结束').first).to_be_visible()
        expect(pg3.get_by_role('region', name=re.compile('下一站|当天第一站|进行中'))).to_have_count(0)
        print('ok after trip')

        # ———— 新用户首页 390 / 360，桌面 ————
        for w, h in ((390, 844), (360, 740)):
            p4, _ = page_at(datetime.datetime(2026, 12, 20, tzinfo=TOKYO), w, h)
            p4.goto(BASE + '/trips'); p4.wait_for_timeout(400)
            p4.screenshot(path=os.path.join(OUT, f'{w}-home-new.png'))
        pd, _ = page_at(datetime.datetime(2027, 1, 14, 10, 30, tzinfo=TOKYO), 1280, 860)
        import_trip(pd); pd.wait_for_timeout(600)
        expect(pd.get_by_role('navigation', name='旅程工具').first).to_be_visible()
        pd.screenshot(path=os.path.join(OUT, '1280-itinerary.png'))
        print('MOBILE PASS')
finally:
    srv.terminate()
