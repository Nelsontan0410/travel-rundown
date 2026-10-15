import re
# 端到端冒烟：导入 → 标记完成 → 加证明 → 导出备份 → 换一个全新浏览器环境 → 恢复 → 断网打开
# 运行：npm run e2e（会先构建并自启 vite preview）
import datetime, os, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright, expect

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PORT = 4175
BASE = f'http://localhost:{PORT}'
md = open(os.path.join(HERE, 'fixtures', 'hokkaido.md'), encoding='utf-8').read()
FLIGHT = 'ANA NH844 新加坡 → 东京羽田'

server = subprocess.Popen(['npx', 'vite', 'preview', '--port', str(PORT), '--strictPort'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(60):
        try:
            urllib.request.urlopen(BASE, timeout=1); break
        except Exception:
            time.sleep(0.5)
    else:
        sys.exit('preview server did not start')

    tmp = tempfile.mkdtemp()
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.set_content('<html><body><h1>航班确认</h1><p>预订编号 DEMO-001</p></body></html>')
        pdf_path = os.path.join(tmp, '航班证明.pdf')
        pg.pdf(path=pdf_path, format='A5'); pg.close()

        def new_ctx():
            ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='zh-CN', timezone_id='Asia/Singapore', accept_downloads=True)
            page = ctx.new_page()
            page.clock.install(time=datetime.datetime(2027, 1, 5, 4, 0, tzinfo=datetime.timezone.utc))
            return ctx, page

        # 1. 导入
        ctx, page = new_ctx()
        page.goto(BASE + '/trips')
        page.get_by_text('粘贴行程文字').click()
        page.locator('textarea').fill(md)
        page.get_by_text('解析并预览').click()
        expect(page.get_by_text('准备检查')).to_be_visible()
        page.get_by_text('确认导入').click()
        # A4 阶段提示卡 → 修订 2026-10 改为四单位倒计时（精确数值在 qa/p1_flow.py 验证）
        expect(page.get_by_role('timer')).to_have_attribute('aria-label', re.compile(r'^距离出发 [34] 天 \d+ 小时 \d+ 分 \d+ 秒$'))
        print('ok import + phase card')

        # 2. 标记完成
        page.get_by_text(FLIGHT).first.click()
        page.get_by_text('标记完成').click()
        expect(page.get_by_text('改为待完成')).to_be_visible()
        page.get_by_label('更多').click()
        page.get_by_text('查看原文').click()                        # A2
        expect(page.get_by_text('[flight]', exact=False).first).to_be_visible()
        page.mouse.click(10, 10)
        print('ok mark done + source sheet')
        page.goto(BASE + '/itinerary')

        # 3. 添加证明
        page.get_by_text('资料', exact=True).click()
        page.get_by_text('添加', exact=True).click()
        with page.expect_file_chooser() as fc:
            page.get_by_text('从文件选择').click()
        fc.value.set_files(pdf_path)
        page.get_by_text('关联行程项').click()
        page.locator('[role=dialog]').last.get_by_text(FLIGHT, exact=True).click()
        page.get_by_text('完成', exact=True).click()
        page.get_by_text('保存', exact=True).click()
        expect(page.get_by_text('航班证明')).to_be_visible()
        print('ok add proof')

        # 4. 导出备份
        page.get_by_text('行程', exact=True).click()
        page.get_by_label('旅程设置').click()
        page.get_by_role('button', name='导出旅行包').click()
        with page.expect_download() as dl:
            page.get_by_role('button', name=re.compile('^含附件')).click()
        assert '含附件' in dl.value.suggested_filename, dl.value.suggested_filename
        zip_path = os.path.join(tmp, 'backup.zip')
        dl.value.save_as(zip_path)
        assert os.path.getsize(zip_path) > 1000
        page.get_by_role('button', name='导出旅行包').click()
        with page.expect_download() as dl2:
            page.get_by_role('button', name=re.compile('^不含附件')).click()
        lite_path = os.path.join(tmp, 'lite.zip')
        dl2.value.save_as(lite_path)
        assert os.path.getsize(lite_path) < os.path.getsize(zip_path)
        print('ok export trip package (with / without attachments)')
        ctx.close()

        # 5. 全新环境（等于清空）→ 恢复
        ctx, page = new_ctx()
        page.goto(BASE + '/trips')
        page.get_by_text('恢复备份').first.click()
        expect(page.get_by_text('恢复备份？')).to_be_visible()      # A6 恢复确认
        with page.expect_file_chooser() as fc:
            page.get_by_text('选择备份文件').click()
        fc.value.set_files(zip_path)
        expect(page.get_by_text('北海道冬季旅程').first).to_be_visible()
        page.get_by_text('行程', exact=True).click()
        page.get_by_text(FLIGHT).first.click()
        expect(page.get_by_text('改为待完成')).to_be_visible()      # 状态随备份恢复
        expect(page.get_by_text('航班证明').first).to_be_visible()  # 附件随包恢复
        print('ok restore (status kept)')

        # 5b. 不含附件的包恢复到全新环境：资料在，提示缺附件
        ctx2, page2 = new_ctx()
        page2.goto(BASE + '/trips')
        page2.get_by_text('恢复备份').first.click()
        with page2.expect_file_chooser() as fc2:
            page2.get_by_text('选择备份文件').click()
        fc2.value.set_files(lite_path)
        expect(page2.get_by_text('附件不在包里')).to_be_visible()
        expect(page2.get_by_text('北海道冬季旅程').first).to_be_visible()
        ctx2.close()
        print('ok restore lite package')

        # 6. 断网
        page.evaluate('navigator.serviceWorker.ready.then(() => true)')
        page.wait_for_timeout(1500)
        ctx.set_offline(True)
        page.goto(BASE + '/itinerary')
        expect(page.get_by_text(FLIGHT).first).to_be_visible()
        print('ok offline open')
        b.close()
    print('E2E PASS')
finally:
    server.terminate()
