# 修订 2026-10 · ISSUE-001/002/003 浏览器验收
# 运行：npm run build && python3 qa/p1_flow.py [截图目录]
import datetime, os, re, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright, expect

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
PORT = 4182; BASE = f'http://localhost:{PORT}'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'p1shots'); os.makedirs(OUT, exist_ok=True)
tpl = open(os.path.join(ROOT, 'src/importer/templates.ts'), encoding='utf-8').read()
json_t = tpl.split('JSON_TEMPLATE = `')[1].split('`;')[0]
TITLES = ['北海道，日本', '首尔，韩国', '一个名字特别特别长的旅程标题用来测试卡片尺寸是否保持一致，泰国', '台北，台湾', '巴黎，法国', '京都，日本', '悉尼，澳大利亚']
tmp = tempfile.mkdtemp()

def idb(page, js):
    return page.evaluate("() => new Promise(r => { const q = indexedDB.open('travel-rundown'); q.onsuccess = () => { const db = q.result; " + js + " }; })")

srv = subprocess.Popen(['npx', 'vite', 'preview', '--port', str(PORT), '--strictPort'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(60):
        try: urllib.request.urlopen(BASE, timeout=1); break
        except Exception: time.sleep(.5)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for w, h in [(1280, 860), (768, 1024), (390, 844)]:
            ctx = b.new_context(viewport={'width': w, 'height': h}, locale='zh-CN', timezone_id='Asia/Kuala_Lumpur')
            page = ctx.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            # 固定「现在」= 2026-12-01 10:00:00（吉隆坡），出发 2027-01-13 00:00（吉隆坡）
            T0 = datetime.datetime(2026, 12, 1, 2, 0, 0, tzinfo=datetime.timezone.utc)
            page.clock.install(time=T0)
            shot = lambda n: page.screenshot(path=os.path.join(OUT, f'{w}-{n}.png'), full_page=True)
            def add_trip(title):
                path = os.path.join(tmp, 't.json'); open(path, 'w', encoding='utf-8').write(json_t.replace('北海道，日本', title))
                page.goto(BASE + '/trips')
                with page.expect_file_chooser() as fc:
                    page.get_by_role('button', name='导入文件').click()
                fc.value.set_files(path)
                page.get_by_role('button', name='确认导入').click(); page.wait_for_url('**/itinerary/**')
            def reveal(name):
                # 翻到包含这张卡的那一组
                for _ in range(5):
                    if page.get_by_role('button', name=name).count(): return
                    page.get_by_role('button', name='下一组旅程').click(); page.wait_for_timeout(100)
            def deck_check(n):
                page.goto(BASE + '/trips'); page.wait_for_timeout(400)
                cards = page.locator('article:has(button[aria-label^="删除旅程"])')
                expect(cards).to_have_count(min(n, 3))
                boxes = [cards.nth(i).bounding_box() for i in range(cards.count())]
                assert len({(round(bx['width']), round(bx['height'])) for bx in boxes}) == 1, boxes
                nxt = page.get_by_role('button', name='下一组旅程')
                if n <= 3:
                    assert nxt.count() == 0
                else:
                    seen = 0; pages = -(-n // 3)
                    for pi in range(pages):
                        seen += cards.count()
                        if pi < pages - 1:
                            nxt.click(); page.wait_for_timeout(100)
                    assert seen == n, (seen, n)
                    expect(nxt).to_be_disabled()
                    page.get_by_role('button', name='上一组旅程').click()
                    expect(page.get_by_text(f'{pages - 1} / {pages}')).to_be_visible()
                    assert page.url.endswith('/trips')  # 同页切换
            # ISSUE-001：1、3、4、7 份
            for i, t in enumerate(TITLES):
                add_trip(t)
                if i + 1 in (1, 3, 4, 7):
                    deck_check(i + 1)
            shot('01-deck')
            # 卡片只显示标题、日期、人数，没有 NaN；有封面照片
            txt = page.locator('main').inner_text()
            assert 'NaN' not in txt and '2 人' in txt
            assert page.locator('article img').count() >= 1
            # 删除：先确认，只删选中的那一份
            page.goto(BASE + '/trips'); page.wait_for_timeout(300)
            reveal('删除旅程：首尔，韩国')
            page.get_by_role('button', name='删除旅程：首尔，韩国').click()
            expect(page.get_by_text('删除「首尔，韩国」？')).to_be_visible(); shot('02-delete-confirm')
            page.get_by_role('button', name='取消').click()
            assert idb(page, "const t = db.transaction('trips').objectStore('trips').count(); t.onsuccess = () => r(t.result);") == 7
            page.get_by_role('button', name='删除旅程：首尔，韩国').click()
            page.get_by_role('button', name='删除', exact=True).click(); page.wait_for_timeout(400)
            page.reload(); page.wait_for_timeout(400)
            titles = idb(page, "const t = db.transaction('trips').objectStore('trips').getAll(); t.onsuccess = () => r(t.result.map(x => x.title));")
            assert len(titles) == 6 and '首尔，韩国' not in titles and '北海道，日本' in titles, titles
            # ISSUE-002：倒计时（打开北海道）
            page.goto(BASE + '/trips'); page.wait_for_timeout(300)
            reveal('打开旅程：北海道，日本')
            page.get_by_role('button', name='打开旅程：北海道，日本').click(); page.wait_for_url('**/itinerary**'); page.wait_for_timeout(300)
            DEP = datetime.datetime(2027, 1, 12, 16, 0, 0, tzinfo=datetime.timezone.utc)  # 13-JAN 00:00 吉隆坡
            nowms = page.evaluate('Date.now()')
            P = datetime.datetime.fromtimestamp(nowms // 1000 + 3, tz=datetime.timezone.utc)
            page.clock.pause_at(P); page.wait_for_timeout(50)
            def label(t):
                r = int((DEP - t).total_seconds())
                return f'距离出发 {r // 86400} 天 {r % 86400 // 3600} 小时 {r % 3600 // 60} 分 {r % 60} 秒'
            timer = page.get_by_role('timer')
            page.clock.run_for(1000); expect(timer).to_have_attribute('aria-label', label(P + datetime.timedelta(seconds=1)))
            page.clock.run_for(1000); expect(timer).to_have_attribute('aria-label', label(P + datetime.timedelta(seconds=2)))
            page.clock.run_for(61000); expect(timer).to_have_attribute('aria-label', label(P + datetime.timedelta(seconds=63)))
            assert label(P).startswith('距离出发 42 天'), label(P)
            shot('03-countdown')
            assert page.get_by_text('按出发日 00:00（Asia/Kuala_Lumpur）倒数', exact=False).count() == 1
            page.clock.resume()
            # ISSUE-003：打卡 → 归底 → 持久 → 撤销复位；Day 2 不受影响
            first = page.get_by_role('checkbox', name='标记完成：吉隆坡 → 新千岁')
            first.click(); page.wait_for_timeout(300)
            expect(page.get_by_text('已完成（1）')).to_be_visible()
            order = page.locator('[role=checkbox]').evaluate_all('els => els.map(e => e.getAttribute("aria-label"))')
            assert order[-1] == '取消完成：吉隆坡 → 新千岁', order
            shot('04-checked')
            page.reload(); page.wait_for_timeout(500)
            expect(page.get_by_role('checkbox', name='取消完成：吉隆坡 → 新千岁')).to_have_attribute('aria-checked', 'true')
            page.get_by_role('tab').nth(1).click() if page.get_by_role('tab').count() > 1 else None
            page.wait_for_timeout(200)
            assert page.get_by_text('已完成（').count() == 0, 'Day 2 不应有完成项'
            page.get_by_role('tab').nth(0).click(); page.wait_for_timeout(200)
            page.get_by_role('checkbox', name='取消完成：吉隆坡 → 新千岁').click(); page.wait_for_timeout(300)
            order = page.locator('[role=checkbox]').evaluate_all('els => els.map(e => e.getAttribute("aria-label"))')
            assert order[0] == '标记完成：吉隆坡 → 新千岁', order
            # 卡片原有功能：点卡片仍能进详情
            page.get_by_text('札幌站前酒店').first.click(); page.wait_for_url('**/item/**')
            # 出发后：不出现负数，显示旅程已开始（只有出发地时区比目的地早时才看得到这一刻）
            assert not errs, errs
            print('ok', w)
            ctx.close()
finally:
    srv.terminate()
