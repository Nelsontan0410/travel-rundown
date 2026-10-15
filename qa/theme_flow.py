# 修订 2026-10 · ISSUE-005 浏览器验收：每份旅程独立主题，互不串色，切换不重置数据
import datetime, os, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright, expect

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
PORT = 4183; BASE = f'http://localhost:{PORT}'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'themeshots'); os.makedirs(OUT, exist_ok=True)
md = open(os.path.join(HERE, 'fixtures/hokkaido-nomarks.md'), encoding='utf-8').read()
tpl = open(os.path.join(ROOT, 'src/importer/templates.ts'), encoding='utf-8').read()
json_t = tpl.split('JSON_TEMPLATE = `')[1].split('`;')[0].replace('北海道，日本', '首尔，韩国')
tmp = tempfile.mkdtemp(); jp = os.path.join(tmp, 'seoul.json'); open(jp, 'w', encoding='utf-8').write(json_t)

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
            theme = lambda: page.evaluate('document.documentElement.dataset.theme || "classic"')
            shot = lambda n: page.screenshot(path=os.path.join(OUT, f'{w}-{n}.png'), full_page=True)
            # 北海道（粘贴文字）+ 首尔（JSON）
            page.goto(BASE + '/import/paste'); page.locator('textarea').fill(md); page.get_by_text('解析并预览').click()
            page.get_by_role('button', name='确认导入').click(); page.wait_for_url('**/itinerary/**')
            hk = page.url.rsplit('/', 1)[1]
            page.goto(BASE + '/trips')
            with page.expect_file_chooser() as fc:
                page.get_by_role('button', name='导入文件').click()
            fc.value.set_files(jp)
            page.get_by_role('button', name='确认导入').click(); page.wait_for_url('**/itinerary/**')
            se = page.url.rsplit('/', 1)[1]
            # 北海道打一个卡，用来确认切主题不重置状态
            page.goto(f'{BASE}/itinerary/{hk}'); page.wait_for_timeout(400)
            page.get_by_role('checkbox', name='标记完成：抵达东京羽田机场').click(); page.wait_for_timeout(300)
            # 设置里改成 Winter
            page.goto(f'{BASE}/trip/{hk}/settings'); page.wait_for_timeout(300)
            assert theme() == 'classic'
            page.get_by_text('主题', exact=True).click(); page.get_by_text('Winter 冬季').click(); page.wait_for_timeout(300)
            assert theme() == 'winter', theme()
            shot('01-settings-winter')
            page.goto(f'{BASE}/itinerary/{hk}'); page.wait_for_timeout(500)
            assert theme() == 'winter'
            expect(page.get_by_role('checkbox', name='取消完成：抵达东京羽田机场')).to_have_attribute('aria-checked', 'true')
            shot('02-itinerary-winter')
            page.goto(f'{BASE}/trip/{hk}/story'); page.wait_for_timeout(1200)
            assert theme() == 'winter'
            page.screenshot(path=os.path.join(OUT, f'{w}-03-story-winter.png'))
            # 首尔仍是 Classic；旅程列表是 Classic
            page.goto(f'{BASE}/itinerary/{se}'); page.wait_for_timeout(400)
            assert theme() == 'classic', theme()
            page.goto(BASE + '/trips'); page.wait_for_timeout(400)
            assert theme() == 'classic'
            # 页面内导航（不刷新）：从列表打开北海道 → winter；回列表 → classic
            page.get_by_role('button', name='打开旅程：东京・富士山・北海道，日本').click(); page.wait_for_url('**/itinerary**'); page.wait_for_timeout(400)
            assert theme() == 'winter'
            page.get_by_role('link', name='旅程').first.click(); page.wait_for_timeout(400)
            assert theme() == 'classic'
            # 刷新后仍保留
            page.goto(f'{BASE}/itinerary/{hk}'); page.reload(); page.wait_for_timeout(500)
            assert theme() == 'winter'
            assert page.evaluate('document.documentElement.scrollWidth > innerWidth') is False
            assert not errs, errs
            print('ok', w)
            ctx.close()
finally:
    srv.terminate()
