# 2026-10-19 回归：新版 Chrome（Android Chrome 155）的 window.scrollTo 会返回 Promise。
# App 里有 useEffect(() => window.scrollTo(0, 0)) —— 返回值被 React 当成清理函数，换页时调用它就报
# "n is not a function"，整个 App 卸载 → 换页白屏、刷新才好。这里模拟这种浏览器，确认换页正常。
# 运行：npm run build && python3 qa/scroll_promise_flow.py
import os, subprocess, time, urllib.request
from playwright.sync_api import sync_playwright, expect

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
PORT = 4205; BASE = f'http://localhost:{PORT}'
md = open(os.path.join(HERE, 'sample-v2.md'), encoding='utf-8').read()
PROMISE_SCROLL = '''(() => {
  for (const o of [window, Element.prototype]) for (const k of ['scrollTo', 'scroll', 'scrollBy']) {
    const orig = o[k]; if (!orig) continue;
    o[k] = function (...a) { orig.apply(this, a); return Promise.resolve(); };
  }
})();'''

srv = subprocess.Popen(['npx', 'vite', 'preview', '--port', str(PORT), '--strictPort'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(60):
        try: urllib.request.urlopen(BASE, timeout=1); break
        except Exception: time.sleep(.5)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        c = b.new_context(**pw.devices['Pixel 7'], locale='zh-CN', timezone_id='Asia/Singapore')
        c.add_init_script(PROMISE_SCROLL)
        pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(BASE + '/import/paste'); pg.locator('textarea').fill(md); pg.get_by_text('解析并预览').click()
        pg.get_by_role('button', name='确认导入').click(); pg.wait_for_url('**/itinerary/**')
        expect(pg.get_by_text('Day 1').first).to_be_visible()
        for link, text in (('旅程', '我的旅程（'), ('行程', 'Day 1'), ('资料', '预订资料'), ('行程', 'Day 1')):
            pg.get_by_role('link', name=link).first.click()
            expect(pg.get_by_text(text).first).to_be_visible(timeout=4000)
        pg.get_by_role('button', name='旅程设置').click(); expect(pg.get_by_text('同步与同伴')).to_be_visible()
        pg.go_back(); expect(pg.get_by_text('Day 1').first).to_be_visible()
        assert not errs, errs
        print('SCROLL PASS')
finally:
    srv.terminate()
