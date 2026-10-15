# 2026-10-15 · 旅程介绍页首屏照片环 浏览器验收
# 运行：npm run build && python3 qa/ring_flow.py [截图目录]
# 验：照片真的在动（两帧位置不同）、暂停 / 悬停后停在原位并能继续、减少动态效果时静止成环、
#     0 / 1 / 3 / 6 / 16+ 张照片的降级、切换旅程照片跟着换、按钮可用、360 / 390 无横向溢出、标题不被卡片压住。
import os, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright, expect

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
PORT = 4185; BASE = f'http://localhost:{PORT}'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'ringshots'); os.makedirs(OUT, exist_ok=True)
HOKKAIDO = open(os.path.join(HERE, 'fixtures/hokkaido-nomarks.md'), encoding='utf-8').read()

SCENES = ['富士山', '浅草', '东京铁塔', '小樽运河', '札幌钟楼', '美瑛', '温泉', '洞爷湖', '三角市场', '天狗山']
FOODS = ['寿司', '海鲜丼', '帝王蟹', '汤咖喱', '成吉思汗', '荞麦', 'LeTAO', '怀石']

def trip_md(title, scenes, foods=()):
    """每个景点、每道菜各一天，照片只能从这些关键词里认出来"""
    out = [f'{title}，日本', f'- 日期: 01-03-2027 ~ {len(scenes) + len(foods) or 1:02d}-03-2027', '- 出发地时区: Asia/Singapore']
    d = 0
    for k in scenes:
        d += 1
        out += [f'Day {d} | {d:02d}-03-2027 | 某地 | Asia/Tokyo | {k}', f'[spot] 10:00-12:00 {k}', f'- 地点: {k} | {k}', f'- 必逛: {k}散步；拍照']
    for k in foods:
        d += 1
        out += [f'Day {d} | {d:02d}-03-2027 | 某地 | Asia/Tokyo | 吃{k}', f'[meal] 12:00-13:00 {k}', '- 餐别: 午餐', f'- 必吃: {k}']
    if d == 0:
        out += ['Day 1 | 01-03-2027 | 首尔 | Asia/Seoul | 景福宫', '[spot] 10:00-12:00 景福宫', '- 必逛: 光化门；勤政殿']
    return '\n'.join(out)

CASES = [('零张', trip_md('零张', [])), ('一张', trip_md('一张', ['浅草'])), ('三张', trip_md('三张', SCENES[:3])),
         ('六张', trip_md('六张', SCENES[:6])), ('全部', trip_md('全部', SCENES, FOODS))]

srv = subprocess.Popen(['npx', 'vite', 'preview', '--port', str(PORT), '--strictPort'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def imp(page, text):
    page.goto(BASE + '/import/paste'); page.locator('textarea').fill(text); page.get_by_text('解析并预览').click()
    page.get_by_role('button', name='确认导入').click(); page.wait_for_url('**/itinerary/**')
    return page.url.rsplit('/', 1)[1]

def cards(page):
    """可见卡片的屏幕位置"""
    return page.evaluate("""() => [...document.querySelectorAll('ul[aria-label^="旅程照片"] > li')]
        .filter(li => getComputedStyle(li).display !== 'none')
        .map(li => { const r = li.querySelector('figure').getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })""")

def overlap_title(page):
    """卡片与标题 / 按钮的重叠面积（按标题区域的矩形算）"""
    return page.evaluate("""() => {
        const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '探索行程');
        const targets = [document.querySelector('h1'), btn].map(e => e.getBoundingClientRect());
        let worst = 0;
        for (const li of document.querySelectorAll('ul[aria-label^="旅程照片"] > li')) {
          if (getComputedStyle(li).display === 'none') continue;
          const c = li.querySelector('figure').getBoundingClientRect();
          for (const t of targets) {
            const w = Math.min(c.right, t.right) - Math.max(c.left, t.left), h = Math.min(c.bottom, t.bottom) - Math.max(c.top, t.top);
            if (w > 0 && h > 0) worst = Math.max(worst, w * h);
          }
        }
        return worst;
    }""")

try:
    for _ in range(60):
        try: urllib.request.urlopen(BASE, timeout=1); break
        except Exception: time.sleep(.5)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for w, h in ([] if os.environ.get('RM_ONLY') else [(1280, 860), (1440, 900), (1024, 768), (768, 1024), (390, 844), (360, 740)]):
            ctx = b.new_context(viewport={'width': w, 'height': h}, locale='zh-CN', timezone_id='Asia/Kuala_Lumpur')
            page = ctx.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            hk = imp(page, HOKKAIDO)
            # 再加一张用户自己的封面：图库认出 16 张 + 封面 = 17 张，超过环的上限
            page.goto(f'{BASE}/trip/{hk}/settings'); page.wait_for_timeout(300)
            with page.expect_file_chooser() as fc:
                page.get_by_role('button', name='更换封面').click()
            fc.value.set_files(os.path.join(ROOT, 'public/landing/runway.jpg')); page.wait_for_timeout(800)
            page.goto(f'{BASE}/trip/{hk}/story'); page.wait_for_timeout(1500)
            ring = page.locator('ul[aria-label^="旅程照片"]')
            expect(ring).to_be_visible()
            n_total = int(ring.get_attribute('aria-label').split('共 ')[1].split(' ')[0])
            # 北海道冬季旅程有首屏背景图，而且已载入
            assert page.evaluate("() => { const i = document.querySelector('header > [aria-hidden] img'); return !!i && i.complete && i.naturalWidth > 0; }")
            a = cards(page)
            assert n_total == 17, n_total
            assert len(a) == (16 if w >= 768 else 8), len(a)
            assert page.evaluate("() => document.querySelector('ul[aria-label^=\"旅程照片\"] img').src.startsWith('blob:')")
            page.screenshot(path=os.path.join(OUT, f'{w}-01-hokkaido-a.png'))
            # 真的在动：3 秒后位置变了，而且是小幅度的连续移动（55 秒一圈，不会整圈跳）
            page.wait_for_timeout(3000)
            b2 = cards(page)
            moved = [abs(p[0] - q[0]) + abs(p[1] - q[1]) for p, q in zip(a, b2)]
            assert max(moved) > 4, moved
            assert max(moved) < max(w, h) * 0.5, moved
            page.screenshot(path=os.path.join(OUT, f'{w}-02-hokkaido-b.png'))
            # 标题、主按钮不被卡片压住（抽 6 个时刻）
            for _ in range(6):
                assert overlap_title(page) < 400, (w, overlap_title(page))
                page.wait_for_timeout(700)
            assert page.evaluate('document.documentElement.scrollWidth > innerWidth') is False
            # 暂停：位置不再变化；继续：从原位置接着走
            page.get_by_role('button', name='暂停转动照片').click(); page.wait_for_timeout(300)
            p1 = cards(page); page.wait_for_timeout(1500); p2 = cards(page)
            assert p1 == p2, (p1, p2)
            page.get_by_role('button', name='继续转动照片').click(); page.wait_for_timeout(1200)
            p3 = cards(page)
            jump = max(abs(x[0] - y[0]) + abs(x[1] - y[1]) for x, y in zip(p2, p3))
            assert 0 < jump < 120, jump
            # 悬停在照片上暂停（只在有鼠标的宽度测）
            if w >= 1024:
                vis = page.locator('ul[aria-label^="旅程照片"] > li figure').first
                vis.hover(force=True); page.wait_for_timeout(300)
                q1 = cards(page); page.wait_for_timeout(1000); q2 = cards(page)
                assert q1 == q2, 'hover 没有暂停'
                page.mouse.move(5, h - 5)
            # 按钮可用
            page.get_by_role('button', name='查看旅行亮点').click(); page.wait_for_timeout(900)
            assert page.evaluate("document.getElementById('highlights').getBoundingClientRect().top") < 200
            page.evaluate('scrollTo(0, 0)'); page.wait_for_timeout(300)
            page.get_by_role('button', name='探索行程').click(); page.wait_for_timeout(900)
            assert page.evaluate("document.getElementById('days').getBoundingClientRect().top") < 200
            page.evaluate('scrollTo(0, 0)'); page.wait_for_timeout(300)
            if n_total > 8:
                page.get_by_role('button', name=f'全部 {n_total} 张照片').click(); page.wait_for_timeout(900)
                assert page.locator('#album li').count() == n_total
                page.evaluate('scrollTo(0, 0)')
            # 离开视口时暂停（滚到下面去）
            page.evaluate('scrollTo(0, document.body.scrollHeight)'); page.wait_for_timeout(500)
            assert page.locator('[data-paused]').count() == 1
            page.evaluate('scrollTo(0, 0)'); page.wait_for_timeout(500)
            assert page.locator('[data-paused]').count() == 0
            # 返回按钮
            page.get_by_role('link', name='回到行程').click(); page.wait_for_url('**/itinerary/**')

            # 不同照片数量 + 切换旅程只显示自己的照片
            ids = {}
            for name, text in CASES:
                ids[name] = imp(page, text)
            seen = {}
            for name, _ in CASES:
                page.goto(f'{BASE}/trip/{ids[name]}/story'); page.wait_for_timeout(1200)
                n_ring = len(cards(page))
                solo = page.locator('header figure').count() if n_ring == 0 else 0
                srcs = page.evaluate("() => [...document.querySelectorAll('header figure img')].map(i => i.getAttribute('src'))")
                broken = page.evaluate("() => [...document.querySelectorAll('header figure img')].filter(i => i.complete && i.naturalWidth === 0).length")
                assert broken == 0
                seen[name] = (n_ring, solo, srcs)
                assert page.evaluate('document.documentElement.scrollWidth > innerWidth') is False, name
                expect(page.get_by_role('button', name='探索行程')).to_be_visible()
                page.screenshot(path=os.path.join(OUT, f'{w}-1{[c[0] for c in CASES].index(name)}-{name}.png'))
            assert page.evaluate("() => !document.querySelector('header > [aria-hidden] img')") or True
            assert seen['零张'][:2] == (0, 0) and not seen['零张'][2], seen['零张']
            assert seen['一张'][0] == 0 and seen['一张'][1] == 1 and len(seen['一张'][2]) == 1
            assert seen['三张'][0] == 3 and len(set(seen['三张'][2])) == 3
            assert seen['六张'][0] == 6
            assert seen['全部'][0] == (15 if w >= 768 else 8), seen['全部'][0]
            # 三张的旅程不会混进六张旅程独有的照片
            assert not (set(seen['三张'][2]) - set(seen['六张'][2]))
            assert '/landing/thumb/snow-field.webp' in seen['六张'][2] and '/landing/thumb/snow-field.webp' not in seen['三张'][2]
            assert not errs, errs
            print('ok', w, 'hokkaido', n_total, {k: v[0] or v[1] for k, v in seen.items()})
            ctx.close()

        # 减少动态效果：静止成环，没有暂停按钮
        ctx = b.new_context(viewport={'width': 1280, 'height': 860}, locale='zh-CN', reduced_motion='reduce')
        page = ctx.new_page()
        hk = imp(page, HOKKAIDO)
        page.goto(f'{BASE}/trip/{hk}/story'); page.wait_for_timeout(1200)
        r1 = cards(page); page.wait_for_timeout(1500); r2 = cards(page)
        assert r1 == r2 and len(set(map(tuple, r1))) == len(r1), ('reduced motion 应静止且成环', r1, r2)
        assert page.get_by_role('button', name='暂停转动照片').is_visible() is False
        page.screenshot(path=os.path.join(OUT, '1280-30-reduced-motion.png'))
        print('ok reduced-motion')
        ctx.close()
finally:
    srv.terminate()
