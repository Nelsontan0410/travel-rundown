# 2026-10 第一批 ③ 当地语言地址卡 浏览器验收
# 运行：npm run build && python3 qa/address_flow.py [截图目录]
import os, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright, expect

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
PORT = 4191; BASE = f'http://localhost:{PORT}'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'addrshots'); os.makedirs(OUT, exist_ok=True)
md = open(os.path.join(HERE, 'sample-v2.md'), encoding='utf-8').read()

srv = subprocess.Popen(['npx', 'vite', 'preview', '--port', str(PORT), '--strictPort'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(60):
        try: urllib.request.urlopen(BASE, timeout=1); break
        except Exception: time.sleep(.5)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for w, h in [(390, 844), (1280, 860)]:
            ctx = b.new_context(viewport={'width': w, 'height': h}, locale='zh-CN', timezone_id='Asia/Singapore', permissions=['clipboard-read', 'clipboard-write'])
            opened = []
            ctx.route('https://www.google.com/**', lambda r: (opened.append(r.request.url), r.fulfill(body='ok')))
            page = ctx.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            page.goto(BASE + '/import/paste'); page.locator('textarea').fill(md); page.get_by_text('解析并预览').click()
            page.get_by_role('button', name='确认导入').click(); page.wait_for_url('**/itinerary/**')
            page.get_by_text('札幌站前酒店入住').first.click(); page.wait_for_url('**/item/**')
            expect(page.get_by_role('button', name='看路线')).to_be_visible()
            page.get_by_role('button', name='给司机看').click()
            dlg = page.get_by_role('dialog')
            expect(dlg.get_by_role('heading', name='札幌駅前ホテル')).to_be_visible()
            expect(dlg).to_contain_text('ここまでお願いします。')
            expect(dlg).to_contain_text('札幌市北区北7条西')
            expect(dlg).to_contain_text('札幌站前酒店')
            page.screenshot(path=os.path.join(OUT, f'{w}-01-hotel.png'))
            dlg.get_by_role('button', name='复制名称').click()
            expect(page.get_by_text('已复制名称')).to_be_visible()
            assert page.evaluate('navigator.clipboard.readText()') == '札幌駅前ホテル'
            dlg.get_by_role('button', name='复制全部').click()
            assert page.evaluate('navigator.clipboard.readText()') == '札幌駅前ホテル\n札幌市北区北7条西'
            with page.expect_popup() as pop:
                dlg.get_by_role('button', name='看路线').click()
            pop.value.wait_for_load_state()
            assert any('google.com/maps' in u for u in opened), opened
            pop.value.close()
            dlg.get_by_role('button', name='关闭').click()
            expect(page.get_by_role('dialog')).to_have_count(0)
            # 第一天的航班：出发机场在出发地，说英文
            page.go_back(); page.wait_for_url('**/itinerary/**')
            page.get_by_text('吉隆坡 → 新千岁').first.click(); page.wait_for_url('**/item/**')
            page.get_by_role('button', name='给司机看').click()
            expect(page.get_by_role('dialog')).to_contain_text('出发机场')
            expect(page.get_by_role('dialog')).to_contain_text('Please take me here.')
            page.screenshot(path=os.path.join(OUT, f'{w}-02-airport.png'))
            assert not errs, errs
            print('ok', w)
            ctx.close()
finally:
    srv.terminate()
