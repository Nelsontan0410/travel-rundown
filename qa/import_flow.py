# 修订 2026-10 · ISSUE-004 浏览器验收：MD / JSON / CSV / 粘贴 → 预览 → 修正 → 确认；同名旅程不覆盖
# 运行：npm run build && python3 qa/import_flow.py [截图目录]
import os, subprocess, sys, tempfile, time, urllib.request, json
from playwright.sync_api import sync_playwright, expect

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
PORT = 4181; BASE = f'http://localhost:{PORT}'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'importshots'); os.makedirs(OUT, exist_ok=True)
tmp = tempfile.mkdtemp()
def src(name):
    return open(os.path.join(ROOT, 'src/importer/templates.ts'), encoding='utf-8').read()
tpl = open(os.path.join(ROOT, 'src/importer/templates.ts'), encoding='utf-8').read()
json_t = tpl.split('JSON_TEMPLATE = `')[1].split('`;')[0]
csv_t = tpl.split('CSV_TEMPLATE = `')[1].split('`;')[0].replace('\\uFEFF', '﻿')
paths = {}
for name, body in [('trip.json', json_t), ('trip.csv', csv_t), ('messy.json', json.dumps({'itinerary': [{'type': 'attraction', 'time': '09:00', 'activity': '景福宫', 'weather': '晴'}, {'type': '??', 'activity': '自由活动'}]}, ensure_ascii=False))]:
    p = os.path.join(tmp, name); open(p, 'w', encoding='utf-8').write(body); paths[name] = p
md = open(os.path.join(HERE, 'fixtures/hokkaido-nomarks.md'), encoding='utf-8').read()

srv = subprocess.Popen(['npx', 'vite', 'preview', '--port', str(PORT), '--strictPort'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(60):
        try: urllib.request.urlopen(BASE, timeout=1); break
        except Exception: time.sleep(.5)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for w, h in [(390, 844), (1280, 860)]:
            ctx = b.new_context(viewport={'width': w, 'height': h}, locale='zh-CN', accept_downloads=True)
            page = ctx.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            shot = lambda n: page.screenshot(path=os.path.join(OUT, f'{w}-{n}.png'), full_page=True)
            def import_file(path):
                page.goto(BASE + '/trips')
                with page.expect_file_chooser() as fc:
                    page.get_by_role('button', name='导入文件').click()
                fc.value.set_files(path)
                expect(page.get_by_text('格式', exact=True)).to_be_visible()
            # 1 JSON 官方模板
            import_file(paths['trip.json']); shot('01-json-preview')
            expect(page.get_by_text('JSON', exact=True)).to_be_visible()
            page.get_by_role('button', name='确认导入').click(); page.wait_for_url('**/itinerary/**')
            expect(page.get_by_text('吉隆坡 → 新千岁').first).to_be_visible()
            # 2 CSV 模板：同名旅程 → 必须选择；默认另存为新旅程
            import_file(paths['trip.csv']); shot('02-csv-dup')
            expect(page.get_by_text('已经有同名旅程')).to_be_visible()
            expect(page.get_by_role('radio', name='另存为新旅程（原旅程不变）')).to_have_attribute('aria-checked', 'true')
            page.get_by_role('radio', name='更新「北海道，日本」', exact=False).first.click()
            expect(page.get_by_role('radio', name='更新「北海道，日本」', exact=False).first).to_have_attribute('aria-checked', 'true')
            page.get_by_role('radio', name='另存为新旅程（原旅程不变）').click()
            page.get_by_role('button', name='确认导入').click(); page.wait_for_url('**/itinerary/**')
            expect(page.get_by_text('吉隆坡 → 新千岁').first).to_be_visible()
            page.goto(BASE + '/trips'); page.wait_for_timeout(600); shot('02b-trips')
            n = page.evaluate("""() => new Promise(r => { const q = indexedDB.open('travel-rundown'); q.onsuccess = () => { const t = q.result.transaction('trips').objectStore('trips').count(); t.onsuccess = () => r(t.result); }; })""")
            assert n == 2, f'另存为新旅程后应有两份，实际 {n}'
            # 3 不规范 JSON：缺日期被拦下 → 在预览里补日期、选类型、改映射 → 放行
            import_file(paths['messy.json']); shot('03-messy-blocked')
            expect(page.get_by_role('button', name='确认导入')).to_be_disabled()
            page.get_by_placeholder('例如：北海道，日本').fill('首尔，韩国'); page.get_by_placeholder('例如：北海道，日本').blur()
            page.locator('input[type=date]').first.fill('2027-03-01')
            page.get_by_label('自由活动 选择', exact=False).select_option('spot')
            page.get_by_label('weather 放到').select_option('note')
            page.wait_for_timeout(200); shot('04-messy-fixed')
            expect(page.get_by_role('button', name='确认导入')).to_be_enabled()
            page.get_by_role('button', name='确认导入').click(); page.wait_for_url('**/itinerary/**')
            expect(page.get_by_text('景福宫').first).to_be_visible()
            # 4 粘贴丢了标题符号的文字
            page.goto(BASE + '/import/paste'); page.locator('textarea').fill(md); page.get_by_text('解析并预览').click()
            expect(page.get_by_text('文字', exact=True)).to_be_visible(); shot('05-text-preview')
            page.get_by_role('button', name='确认导入').click(); page.wait_for_url('**/itinerary/**')
            expect(page.get_by_text('抵达东京羽田机场').first).to_be_visible()
            assert not errs, errs
            print('ok', w)
            ctx.close()
finally:
    srv.terminate()
