# 分项预算冒烟 + 截图：导入 → 账本「AI 生成分项预算」→ 贴回复 → 预览 → 写入 → 分项预算清单 → 单项编辑预算
# 运行：npm run build && python3 qa/budget_flow.py [截图目录]
import os, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright, expect

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PORT = 4177
BASE = f'http://localhost:{PORT}'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'budgetshots')
os.makedirs(OUT, exist_ok=True)
md = open(os.path.join(HERE, 'sample-v2.md'), encoding='utf-8').read()

server = subprocess.Popen(['npx', 'vite', 'preview', '--port', str(PORT), '--strictPort'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(60):
        try:
            urllib.request.urlopen(BASE, timeout=1); break
        except Exception:
            time.sleep(0.5)
    else:
        sys.exit('preview server did not start')

    with sync_playwright() as p:
        b = p.chromium.launch()
        for w, h in [(390, 844), (1280, 860)]:
            ctx = b.new_context(viewport={'width': w, 'height': h}, locale='zh-CN', timezone_id='Asia/Kuala_Lumpur', permissions=['clipboard-read', 'clipboard-write'])
            page = ctx.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            shot = lambda name: page.screenshot(path=os.path.join(OUT, f'{w}-{name}.png'), full_page=True)

            page.goto(BASE + '/trips')
            page.get_by_text('粘贴行程文字').click()
            page.locator('textarea').fill(md)
            page.get_by_text('解析并预览').click()
            page.get_by_text('确认导入').click()
            page.wait_for_url('**/itinerary/**')

            # 账本
            trip_id = page.url.split('/itinerary/')[1].split('/')[0].split('?')[0]
            page.goto(f'{BASE}/trip/{trip_id}/ledger')
            expect(page.get_by_text('旅行账本').first).to_be_visible()
            shot('01-ledger-before')
            page.get_by_text('AI 生成分项预算').click()
            sheet = page.locator('[role=dialog]').last
            sheet.get_by_role('button', name='复制提示词').click()
            prompt = page.evaluate('navigator.clipboard.readText()')
            assert 'B01 | Day 1' in prompt and '# 预算' in prompt, prompt[:400]
            reply = '```text\n# 预算\n- B01 | 1200 | 往返机票\n- B02 | 900 | 住宿\n- B03 | 免费 | 步行\n- B99 | 5\n- B04 | 约 80-120 | 午餐\n```'
            sheet.locator('textarea').fill(reply)
            expect(sheet.get_by_text('读到 4 项预算')).to_be_visible()
            shot('02-plan-preview')
            sheet.get_by_text('写入 4 项').click()
            expect(page.get_by_text('分项预算').first).to_be_visible()
            expect(page.get_by_text('RM 1,200.00').first).to_be_visible()
            page.wait_for_timeout(300)
            shot('03-ledger-after')

            # 单项编辑预算
            page.get_by_text('回到行程').click()
            expect(page.get_by_text('吉隆坡 → 新千岁').first).to_be_visible()
            page.get_by_text('吉隆坡 → 新千岁').first.click()
            expect(page.get_by_text('预算').first).to_be_visible()
            shot('04-item-detail')
            page.get_by_role('button', name='编辑这一项').click()
            page.get_by_label('预算（MYR）').fill('abc')
            page.get_by_text('保存', exact=True).click()
            expect(page.get_by_text('预算只能写数字')).to_be_visible()
            page.get_by_label('预算（MYR）').fill('1300')
            page.get_by_text('保存', exact=True).click()
            expect(page.get_by_text('RM 1,300.00').first).to_be_visible()
            shot('05-item-edited')
            assert not errors, errors
            ctx.close()
        b.close()
    print('budget flow OK →', OUT)
finally:
    server.terminate()
