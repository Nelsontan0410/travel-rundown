# 2026-10-15 导入后编辑行程 浏览器验收
# 运行：npm run build && python3 qa/edit_flow.py [截图目录]
import os, re, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright, expect

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
PORT = 4195; BASE = f'http://localhost:{PORT}'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'editshots'); os.makedirs(OUT, exist_ok=True)
md = open(os.path.join(HERE, 'sample-v2.md'), encoding='utf-8').read()

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
            page.goto(BASE + '/import/paste'); page.locator('textarea').fill(md); page.get_by_text('解析并预览').click()
            page.get_by_role('button', name='确认导入').click(); page.wait_for_url('**/itinerary/**')
            trip = page.url.rsplit('/', 1)[1]
            # Day 2 → 小樽运河：先打勾，再编辑
            page.get_by_role('tab').nth(1).click(); page.wait_for_timeout(300)
            page.get_by_role('checkbox', name='标记完成：小樽运河').click(); page.wait_for_timeout(300)
            page.get_by_text('小樽运河').first.click(); page.wait_for_url('**/item/**')
            page.get_by_role('button', name='编辑这一项').click(); page.wait_for_url('**/edit')
            page.get_by_label('标题').fill('小樽运河散步')
            page.get_by_label('开始时间').fill('11:00')
            page.get_by_label('当地语言地址').fill('北海道小樽市港町5')
            page.get_by_label('必逛 / 必体验（一行一项）').fill('音乐盒堂\n北一硝子\n运河夜景')
            page.get_by_label('预订编号').fill('OTARU-777')
            page.screenshot(path=os.path.join(OUT, f'{w}-01-edit.png'), full_page=True)
            page.get_by_role('button', name='保存').last.click()
            expect(page.get_by_role('heading', name='小樽运河散步')).to_be_visible()
            expect(page.get_by_text('OTARU-777').first).to_be_visible()
            expect(page.get_by_text('运河夜景')).to_be_visible()
            expect(page.get_by_text('改为待完成')).to_be_visible()      # 完成状态跟着改名后的项
            page.get_by_role('button', name='给司机看').click()
            expect(page.get_by_role('dialog')).to_contain_text('北海道小樽市港町5')
            page.get_by_role('dialog').get_by_role('button', name='关闭').click()
            # 行程页：按新时间排序；编辑当天；新增一项
            page.goto(f'{BASE}/itinerary/{trip}'); page.get_by_role('tab').nth(1).click(); page.wait_for_timeout(300)
            titles = page.locator('[role=checkbox]').evaluate_all('els => els.map(e => e.getAttribute("aria-label"))')
            assert titles.index('标记完成：三角市场海鲜丼') < titles.index('取消完成：小樽运河散步') if '标记完成：三角市场海鲜丼' in titles else True, titles
            page.get_by_role('button', name='编辑当天').click()
            page.get_by_label('当天主题').fill('小樽慢慢逛')
            page.get_by_role('button', name='保存').click()
            expect(page.get_by_text('Day 2 · 小樽慢慢逛')).to_be_visible()
            page.get_by_role('button', name='添加一项').click(); page.wait_for_url('**/add?day=*')
            page.get_by_label('标题').fill('北一硝子三号馆')
            page.get_by_label('开始时间').fill('16:00')
            page.get_by_label('当地语言名称').first.fill('北一硝子三号館')
            page.get_by_role('button', name='保存').last.click(); page.wait_for_url(re.compile(r'.*/item/[^/]+$'))
            expect(page.get_by_role('heading', name='北一硝子三号馆')).to_be_visible()
            page.screenshot(path=os.path.join(OUT, f'{w}-02-new-item.png'), full_page=True)
            # 删除新增的那一项
            page.get_by_role('button', name='编辑这一项').click()
            page.get_by_role('button', name='删除这一项').click()
            page.get_by_role('button', name='删除', exact=True).click()
            page.wait_for_url('**/itinerary/**'); page.get_by_role('tab').nth(1).click(); page.wait_for_timeout(300)
            expect(page.get_by_text('北一硝子三号馆')).to_have_count(0)
            page.screenshot(path=os.path.join(OUT, f'{w}-03-itinerary.png'), full_page=True)
            # 旅程名称
            page.goto(f'{BASE}/trip/{trip}/settings'); page.wait_for_timeout(300)
            page.get_by_text('旅程名称').click()
            page.get_by_role('dialog').get_by_role('textbox').fill('北海道慢游，日本')
            page.get_by_role('button', name='保存').click()
            expect(page.get_by_text('北海道慢游，日本').first).to_be_visible()
            # 重新导入：起始文字就是改过的内容
            page.get_by_text('重新导入行程').click(); page.wait_for_url('**/import/paste**')
            txt = page.locator('textarea').input_value()
            assert '# 北海道慢游，日本' in txt and '小樽运河散步' in txt and 'OTARU-777' in txt and '小樽慢慢逛' in txt, txt[:400]
            assert '北一硝子三号馆' not in txt
            page.get_by_text('解析并预览').click()
            expect(page.get_by_text('准备检查').first).to_be_visible()
            page.screenshot(path=os.path.join(OUT, f'{w}-04-reimport.png'), full_page=True)
            assert page.evaluate('document.documentElement.scrollWidth > innerWidth') is False
            assert not errs, errs
            print('ok', w)
            ctx.close()
finally:
    srv.terminate()
