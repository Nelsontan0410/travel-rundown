# 2026-10 第一批 ② 预订资料 + 离线准备检查 浏览器验收
# 运行：npm run build && python3 qa/booking_flow.py [截图目录]
import os, re, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright, expect

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
PORT = 4190; BASE = f'http://localhost:{PORT}'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'bookingshots'); os.makedirs(OUT, exist_ok=True)
md = open(os.path.join(HERE, 'sample-v2.md'), encoding='utf-8').read()
tmp = tempfile.mkdtemp()

# 一张假的二维码图（黑白方块），当作自己保存的票码截图
from PIL import Image, ImageDraw
qr = Image.new('RGB', (420, 420), 'white'); d = ImageDraw.Draw(qr)
import random; random.seed(3)
for y in range(21):
    for x in range(21):
        if random.random() < 0.5 or (x < 7 and y < 7) or (x > 13 and y < 7) or (x < 7 and y > 13):
            d.rectangle([x * 20, y * 20, x * 20 + 19, y * 20 + 19], fill='black')
qr_path = os.path.join(tmp, 'hotel-qr.png'); qr.save(qr_path)

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

            # 资料页：离线准备检查列出没凭证的项
            page.goto(BASE + '/docs'); page.wait_for_timeout(400)
            # 2026-10-15：顶部汇总区块已移除（和卡片重复），每张卡片自己显示离线状态
            expect(page.get_by_role('region', name='离线准备检查')).to_have_count(0)
            expect(page.get_by_text('预订编号可离线查看，但没有凭证文件').first).to_be_visible()
            # 分组：酒店 / 交通 / 门票
            page.get_by_role('tab', name='交通').click()
            expect(page.get_by_text('吉隆坡 → 新千岁').first).to_be_visible()
            page.get_by_role('tab', name='全部').click()
            page.screenshot(path=os.path.join(OUT, f'{w}-01-docs-before.png'), full_page=True)

            # 酒店：加一张二维码截图并标成票码
            page.goto(BASE + '/docs'); page.wait_for_timeout(300)
            page.get_by_text('添加资料', exact=True).first.click()
            with page.expect_file_chooser() as fc:
                page.get_by_text('从相册选择').click()
            fc.value.set_files(qr_path)
            page.get_by_text('这是二维码 / 票码（可离线出示）').click()
            page.get_by_text('关联行程项').click()
            page.locator('[role=dialog]').last.get_by_text('札幌站前酒店入住', exact=True).click()
            page.get_by_text('完成', exact=True).click()
            page.get_by_text('保存', exact=True).click(); page.wait_for_timeout(400)

            # 小樽运河：加一个动态票码链接
            page.get_by_text('添加资料', exact=True).first.click()
            page.get_by_text('添加链接或动态票码').click()
            page.get_by_placeholder('https://').fill('klook')
            page.get_by_text('保存', exact=True).click()
            expect(page.get_by_text('请填完整的链接')).to_be_visible()
            page.get_by_placeholder('https://').fill('https://www.klook.com/order/123')
            page.get_by_text('这是动态票码（要在官方 App 现场打开）').click()
            page.get_by_label('在哪个 App 打开（可选）').fill('Klook')
            page.get_by_text('关联行程项').click()
            page.locator('[role=dialog]').last.get_by_text('小樽运河', exact=True).click()
            page.get_by_text('完成', exact=True).click()
            page.get_by_text('保存', exact=True).click(); page.wait_for_timeout(400)

            expect(page.get_by_text('凭证文件已保存在本机').first).to_be_visible()
            expect(page.get_by_text('动态票码要在官方 App 里现场打开，截图无效').first).to_be_visible()
            # 所有卡片同样大小
            hs = page.evaluate("() => [...document.querySelectorAll('[class*=bookingGrid] > *')].map(e => Math.round(e.getBoundingClientRect().height))")
            assert len(set(hs)) == 1, hs
            expect(page.get_by_text('动态票码 · Klook · 现场需联网')).to_be_visible()
            page.screenshot(path=os.path.join(OUT, f'{w}-02-docs-after.png'), full_page=True)

            # 酒店卡片：全屏出示，第一页是票码图片，第二页是预订编号
            card = page.locator('article, div').filter(has_text='札幌站前酒店入住').filter(has=page.get_by_role('button', name='全屏出示')).last
            card.get_by_role('button', name='全屏出示').click()
            dlg = page.get_by_role('dialog')
            expect(dlg.locator('img')).to_be_visible()
            expect(dlg).to_contain_text('票码')
            page.wait_for_timeout(400)
            page.screenshot(path=os.path.join(OUT, f'{w}-03-pass-qr.png'))
            dlg.get_by_role('tab', name='第 2 页').click(); page.wait_for_timeout(700)
            expect(dlg.get_by_text('DEMO-H01')).to_be_in_viewport()
            page.screenshot(path=os.path.join(OUT, f'{w}-04-pass-ref.png'))
            dlg.get_by_role('button', name='关闭').click()
            expect(page.get_by_role('dialog')).to_have_count(0)

            # 行程详情：同样的状态和出示入口
            page.goto(BASE + '/itinerary'); page.wait_for_timeout(300)
            assert page.evaluate('document.documentElement.scrollWidth > innerWidth') is False
            assert not errs, errs
            print('ok', w)
            ctx.close()
finally:
    srv.terminate()
