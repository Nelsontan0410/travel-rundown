# v2 冒烟 + 截图：导入（预览改日期）→ 必逛打勾 → 加密证明 → 账本记账 → 设置页改出发日期
# 运行：npm run build && python3 qa/v2_flow.py [截图目录]
import datetime, os, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright, expect

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PORT = 4176
BASE = f'http://localhost:{PORT}'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'v2shots')
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
        tmp = tempfile.mkdtemp()
        pg = b.new_page()
        pg.set_content('<html><body><h1>E-ticket</h1><p>XX 123 · DEMO-F01</p></body></html>')
        pdf_path = os.path.join(tmp, 'eticket.pdf')
        pg.pdf(path=pdf_path, format='A5'); pg.close()

        for w, h in [(390, 844), (1280, 860)]:
            tag = f'{w}'
            ctx = b.new_context(viewport={'width': w, 'height': h}, locale='zh-CN', timezone_id='Asia/Kuala_Lumpur', device_scale_factor=2 if w < 800 else 1)
            page = ctx.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            # 旅行中的第 2 天上午（东京时间 2027-01-14 09:00）
            page.clock.install(time=datetime.datetime(2027, 1, 14, 0, 0, tzinfo=datetime.timezone.utc))
            shot = lambda name: page.screenshot(path=os.path.join(OUT, f'{tag}-{name}.png'), full_page=True)

            # 1 导入 + 预览
            page.goto(BASE + '/trips')
            page.get_by_text('粘贴行程文字').click()
            page.locator('textarea').fill(md)
            page.get_by_text('解析并预览').click()
            expect(page.get_by_text('将要导入的内容')).to_be_visible()
            expect(page.get_by_text('RM 8,000.00')).to_be_visible()
            shot('01-preview')
            page.get_by_text('确认导入').click()
            expect(page.get_by_text('北海道，日本').first).to_be_visible()
            page.wait_for_timeout(300)
            shot('02-itinerary-day2')

            # 2 景点详情：必逛打勾
            page.get_by_text('小樽运河', exact=True).first.click()
            expect(page.get_by_text('必逛清单')).to_be_visible()
            page.get_by_role('checkbox', name='音乐盒堂').click()
            expect(page.get_by_text('1/3')).to_be_visible()
            shot('03-spot-mustdo')
            page.go_back()

            # 3 第 1 天的机票：信息 + 上传加密证明
            page.get_by_role('tab').first.click()
            page.get_by_text('吉隆坡 → 新千岁').first.click()
            expect(page.get_by_text('航班信息')).to_be_visible()
            page.get_by_text('上传文件').click()
            with page.expect_file_chooser() as fc:
                page.get_by_text('从文件选择').click()
            fc.value.set_files(pdf_path)
            page.get_by_role('switch').click()
            dlg = page.locator('[role=dialog]').last
            dlg.locator('input[type=password]').nth(0).fill('1234')
            dlg.locator('input[type=password]').nth(1).fill('1234')
            dlg.get_by_label('密码提示（可选）').fill('测试密码')
            shot('04-add-locked-proof')
            dlg.get_by_text('保存', exact=True).click()
            expect(page.get_by_text('eticket.pdf')).to_be_visible()
            shot('05-flight-detail')

            # 4 打开加密证明：先错后对
            page.get_by_text('eticket.pdf').click()
            expect(page.get_by_text('这份文件已加密')).to_be_visible()
            pw = page.locator('[role=dialog] input[type=password]')
            pw.fill('0000'); page.keyboard.press('Enter')
            expect(page.get_by_text('密码不正确')).to_be_visible()
            shot('06-doc-wrong-password')
            pw.fill('1234'); page.keyboard.press('Enter')
            expect(page.get_by_text('移除密码')).to_be_visible()
            page.wait_for_timeout(800)
            shot('07-doc-unlocked')
            page.go_back()

            # 5 账本：从行程详情记一笔
            page.get_by_label('更多').click()
            page.get_by_text('记一笔花费').click()
            dlg = page.locator('[role=dialog]').last
            dlg.locator('input[inputmode=decimal]').fill('1,250.80')
            dlg.get_by_text('保存', exact=True).click()
            expect(page.get_by_text('RM 1,250.80').first).to_be_visible()
            page.get_by_text('记一笔', exact=True).click()
            dlg = page.locator('[role=dialog]').last
            dlg.locator('input[inputmode=decimal]').fill('45')
            dlg.get_by_placeholder('其他').fill('三角市场海鲜丼')
            dlg.get_by_role('tab', name='餐饮').click()
            dlg.get_by_text('保存', exact=True).click()
            expect(page.get_by_text('RM 1,295.80').first).to_be_visible()
            expect(page.get_by_text('RM 6,704.20').first).to_be_visible()
            shot('08-ledger')

            # 6 行程页底部账本卡 + 设置页改出发日期
            page.goto(BASE + '/itinerary')
            expect(page.get_by_text('旅行账本')).to_be_visible()
            page.get_by_role('button', name='旅程设置').first.click()
            page.get_by_text('出发日期').click()
            page.locator('[role=dialog] input[type=date]').fill('2027-02-01')
            page.locator('[role=dialog]').get_by_text('保存', exact=True).click()
            expect(page.get_by_text('1-FEB — 4-FEB-2027').first).to_be_visible()
            shot('09-settings-shifted')
            page.goto(BASE + '/docs')
            expect(page.get_by_text('eticket.pdf')).to_be_visible()   # 改期后证明仍然关联
            shot('10-docs')

            assert not errors, errors
            print(f'ok {tag}')
            ctx.close()
        b.close()
finally:
    server.terminate()
