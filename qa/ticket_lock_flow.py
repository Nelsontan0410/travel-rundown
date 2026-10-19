# 2026-10-19 机票识别：上锁的证明文件、带打开密码的 PDF 都能输入密码后识别
# 运行：npm run build && python3 qa/ticket_lock_flow.py
import os, subprocess, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright, expect

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
PORT = 4206; BASE = f'http://localhost:{PORT}'
md = open(os.path.join(HERE, 'sample-v2.md'), encoding='utf-8').read()
TICKET = '<html><body style="font:16px sans-serif"><h1>E-ticket</h1><p>Departure: Kuala Lumpur KUL 13 JAN 2027 08:30</p><p>Arrival: Sapporo CTS 13 JAN 2027 16:10</p><p>Departure: Sapporo CTS 16 JAN 2027 10:30</p><p>Arrival: Kuala Lumpur KUL 16 JAN 2027 16:50</p></body></html>'

srv = subprocess.Popen(['npx', 'vite', 'preview', '--port', str(PORT), '--strictPort'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
tmp = tempfile.mkdtemp()
try:
    for _ in range(60):
        try: urllib.request.urlopen(BASE, timeout=1); break
        except Exception: time.sleep(.5)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        plain = os.path.join(tmp, 'E-itinerary.pdf'); locked = os.path.join(tmp, 'Protected.pdf')
        p0 = b.new_page(); p0.set_content(TICKET); p0.pdf(path=plain, format='A5'); p0.close()
        subprocess.run(['qpdf', '--encrypt', 'pdfpw1', 'owner', '256', '--', plain, locked], check=True)

        c = b.new_context(**pw.devices['Pixel 7'], locale='zh-CN', timezone_id='Asia/Singapore')
        pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(BASE + '/import/paste'); pg.locator('textarea').fill(md); pg.get_by_text('解析并预览').click()
        pg.get_by_role('button', name='确认导入').click(); pg.wait_for_url('**/itinerary/**')
        trip = pg.url.rsplit('/', 1)[1]

        # 1) 在资料页加一份上锁的机票 PDF
        pg.get_by_role('link', name='资料').first.click(); pg.get_by_role('button', name='添加').click()
        with pg.expect_file_chooser() as fc: pg.get_by_text('从文件选择').click()
        fc.value.set_files(plain)
        dlg = pg.get_by_role('dialog')
        dlg.get_by_role('tab', name='机票').click()
        dlg.get_by_text('设置密码（防止别人打开）').click()
        dlg.get_by_label('密码', exact=True).fill('secret1'); dlg.get_by_label('再输入一次').fill('secret1')
        dlg.get_by_label('密码提示（可选）').fill('生日')
        dlg.get_by_role('button', name='保存').click(); pg.wait_for_timeout(800)

        # 2) 行程页 → 设置航班时间 → 从 PDF 机票填写时间：上锁的可以选，出现密码框
        pg.goto(f'{BASE}/itinerary/{trip}'); pg.get_by_role('button', name='设置航班时间').first.click()
        pg.get_by_text('从 PDF 机票填写时间').click()
        sel = pg.get_by_label('已保存的 PDF 机票')
        sel.select_option(label='E-itinerary.pdf（已上锁，需要密码）')
        expect(pg.get_by_label('文件密码（提示：生日）')).to_be_visible()
        btn = pg.get_by_role('button', name='解锁并识别')
        expect(btn).to_be_disabled()
        pg.get_by_label('文件密码（提示：生日）').fill('wrong00'); btn.click()
        expect(pg.get_by_text('文件密码不正确')).to_be_visible()
        pg.get_by_label('文件密码（提示：生日）').fill('secret1'); btn.click()
        expect(pg.get_by_text('已找到候选时间')).to_be_visible(timeout=15000)
        expect(pg.get_by_label('选择去程起飞航段')).to_contain_text('2027-01-13 08:30')
        print('ok locked saved ticket')

        # 3) 直接选一份有打开密码的 PDF：出现 PDF 密码框，输入后识别
        with pg.expect_file_chooser() as fc: pg.get_by_text('选择 PDF 机票（可选去程和回程两份）').click()
        fc.value.set_files(locked)
        expect(pg.get_by_label('PDF 打开密码')).to_be_visible(timeout=15000)
        pg.get_by_label('PDF 打开密码').fill('nope'); pg.get_by_role('button', name='用这个密码识别').click()
        expect(pg.get_by_text('PDF 密码不正确')).to_be_visible(timeout=15000)
        pg.get_by_label('PDF 打开密码').fill('pdfpw1'); pg.get_by_role('button', name='用这个密码识别').click()
        expect(pg.get_by_label('PDF 打开密码')).to_have_count(0, timeout=15000)
        expect(pg.get_by_label('选择回程起飞航段')).to_contain_text('2027-01-16 10:30')
        print('ok password-protected pdf')
        assert not errs, errs
        print('TICKET LOCK PASS')
finally:
    srv.terminate()
