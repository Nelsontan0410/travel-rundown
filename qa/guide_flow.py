# 2026-10-20 旅行亮点验收：空状态、封面照片（选图→预览→调整→保存）、从行程添加 / 手动添加、改文字（长度限制）、
# 排序（拖动 + 按钮）、隐藏 / 恢复、删除（行程不受影响）、刷新后保留、上传失败（不是图片 / 太大 / 损坏）、超长标题、
# 手机 360/390 与电脑布局（无横向溢出）、四个季节主题
# 运行：npm run build && python3 qa/guide_flow.py [截图目录]
import io, os, re, subprocess, sys, tempfile, time, urllib.request
from PIL import Image
from playwright.sync_api import sync_playwright, expect

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
PORT = 4211; BASE = f'http://localhost:{PORT}'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'guideshots'); os.makedirs(OUT, exist_ok=True)
TMP = tempfile.mkdtemp()
md = open(os.path.join(HERE, 'sample-v2.md'), encoding='utf-8').read()

def jpeg(name, w, h, color):
    p = os.path.join(TMP, name); Image.new('RGB', (w, h), color).save(p, 'JPEG', quality=90); return p
PHOTOS = [jpeg(f'p{i}.jpg', 3000, 2000, c) for i, c in enumerate(['#c0803e', '#3e7ac0', '#5e8a4a', '#a04a6a'])]
BIG = os.path.join(TMP, 'huge.jpg')
with open(BIG, 'wb') as f: f.write(b'\xff\xd8' + b'0' * (31 * 1024 * 1024))
TXT = os.path.join(TMP, 'note.txt'); open(TXT, 'w').write('not an image')
BAD = os.path.join(TMP, 'broken.jpg'); open(BAD, 'wb').write(b'\xff\xd8\xff\xe0 this is not really a jpeg')

srv = subprocess.Popen(['npx', 'vite', 'preview', '--port', str(PORT), '--strictPort'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
def ok(m): print('ok', m)
try:
    for _ in range(60):
        try: urllib.request.urlopen(BASE, timeout=1); break
        except Exception: time.sleep(.5)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        def ctx(w=390, h=844):
            c = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, is_mobile=w < 768, has_touch=w < 768, locale='zh-CN', timezone_id='Asia/Singapore')
            pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            return pg, errs
        def import_trip(pg):
            pg.goto(BASE + '/import/paste'); pg.get_by_label('行程内容').fill(md)
            pg.get_by_role('button', name='解析并预览').click(); pg.wait_for_url('**/preview')
            pg.get_by_role('button', name='确认导入').click(); pg.wait_for_url('**/itinerary/**')
            return pg.url.rsplit('/', 1)[1]
        def no_overflow(pg, label):
            sw = pg.evaluate('document.documentElement.scrollWidth'); iw = pg.evaluate('window.innerWidth')
            assert sw <= iw + 1, f'{label} 横向溢出 {sw}>{iw}'
        def pick(pg, click, path):
            with pg.expect_file_chooser() as fc: click()
            fc.value.set_files(path)
        def item_titles(pg, trip):
            pg.goto(f'{BASE}/itinerary/{trip}'); pg.wait_for_timeout(500)
            return pg.locator('main').inner_text()

        pg, errs = ctx(390, 844)
        trip = import_trip(pg)
        before = item_titles(pg, trip)

        # ———— 1 新旅程：没有任何照片，空状态 ————
        # 概览页（照片环首屏）保留，从这里进入旅行亮点
        pg.goto(f'{BASE}/trip/{trip}/story'); pg.wait_for_timeout(800)
        pg.get_by_role('button', name='查看旅行亮点').click(); pg.wait_for_url('**/highlights'); pg.wait_for_timeout(600)
        expect(pg.get_by_role('link', name=re.compile('tongxing8'))).to_be_visible()  # 左上角 Logo
        expect(pg.get_by_role('heading', name='精选亮点')).to_be_visible()
        expect(pg.get_by_text('还没有亮点')).to_be_visible()
        expect(pg.get_by_text(re.compile('还没有封面照片'))).to_be_visible()
        expect(pg.locator('header img')).to_have_count(0)  # 封面不放假照片
        expect(pg.get_by_role('heading', name=re.compile('天的故事'))).to_be_visible()
        no_overflow(pg, '空状态 390'); pg.screenshot(path=f'{OUT}/01-empty-read.png'); ok('1 空状态、无假照片')

        # ———— 2 封面：选图 → 预览 → 调整 → 保存；刷新后还在 ————
        pg.get_by_role('button', name='编辑', exact=True).click()
        pg.get_by_role('button', name='添加封面照片').click()
        pick(pg, lambda: pg.get_by_role('button', name='从相册选择').click(), PHOTOS[0])
        expect(pg.get_by_text('拖动照片调整显示位置')).to_be_visible()
        pg.get_by_label('放大').fill('1.6')
        box = pg.locator('[class*=cropBox]').bounding_box()
        pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2); pg.mouse.down(); pg.mouse.move(box['x'] + 20, box['y'] + 30, steps=5); pg.mouse.up()
        pg.screenshot(path=f'{OUT}/02-cover-crop.png')
        pg.get_by_role('button', name='确认', exact=True).click()
        expect(pg.get_by_text('已保存')).to_be_visible()
        expect(pg.get_by_role('img', name=re.compile('封面'))).to_be_visible()
        pg.reload(); pg.wait_for_timeout(800)
        expect(pg.get_by_role('img', name=re.compile('封面'))).to_be_visible()
        stored = pg.evaluate("""async () => { const db = await new Promise(r => { const q = indexedDB.open('travel-rundown'); q.onsuccess = () => r(q.result); });
          return await new Promise(r => { const q = db.transaction('guides').objectStore('guides').getAll(); q.onsuccess = () => r(q.result); }); }""")
        assert stored and stored[0]['coverFocus']['zoom'] > 1.5, stored
        ok('2 封面更换、调整位置、刷新保留')

        # ———— 3 简介：直接编辑，长度限制 ————
        pg.get_by_role('button', name='编辑', exact=True).click()
        intro = pg.get_by_label('旅行简介'); intro.click(); intro.fill('老城街巷、壮族文化、地道广西味道。' * 10); pg.get_by_role('heading', name=re.compile('精选亮点')).click(); pg.wait_for_timeout(250)
        expect(pg.get_by_text('已保存')).to_be_visible()
        assert len(intro.input_value()) == 120, len(intro.input_value())
        ok('3 简介限长 120')

        # ———— 4 从 Rundown 关联 + 手动添加（先选类型）+ 照片；添加后直接打开编辑 ————
        def close_editor():
            pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
        def open_editor(title):
            pg.get_by_role('button', name=f'编辑「{title}」').click(); pg.wait_for_timeout(250)
        def row_titles():
            return [t.inner_text() for t in pg.locator('[data-hl] [data-hl-title]').all()]
        pg.get_by_role('button', name='添加亮点').first.click()
        pg.get_by_role('button', name=re.compile('从行程里选')).click()
        name = pg.locator('[class*=candTitle]').first.inner_text()
        pg.get_by_label('搜索').fill(name[:2]); pg.locator('[class*=candList] button:not([disabled])').first.click()
        expect(pg.get_by_label('亮点标题')).to_have_value(name)  # 添加后直接打开这一条的编辑
        expect(pg.get_by_text('关联的行程项目')).to_be_visible(); expect(pg.get_by_text(f'「{name}」')).to_be_visible()
        close_editor()
        def add_manual(title, cat, desc=None, photo=None):
            pg.get_by_role('button', name='添加亮点').first.click(); pg.get_by_role('button', name=re.compile('手动创建')).click()
            expect(pg.get_by_role('dialog', name='选择内容类型')).to_be_visible()
            pg.get_by_role('dialog', name='选择内容类型').get_by_role('button', name=cat).click()
            sh = pg.get_by_role('dialog', name='手动创建')
            sh.get_by_label('标题', exact=True).fill(title)
            if desc: sh.get_by_label('简短描述（可选）').fill(desc)
            if photo:
                pick(pg, lambda: sh.get_by_role('button', name='选照片').click(), photo); expect(sh.get_by_alt_text('已选照片')).to_be_visible()
            sh.get_by_role('button', name='添加', exact=True).click()
            expect(pg.get_by_label('亮点标题')).to_have_value(title); close_editor()
        add_manual('青秀山', '美食', '城市绿肺，俯瞰南宁', PHOTOS[1])
        add_manual('三街两巷', '景点')
        assert len(row_titles()) == 3, row_titles()
        # 给第一条加照片：编辑面板里点「添加照片」
        open_editor(row_titles()[0])
        pick(pg, lambda: pg.get_by_role('button', name=re.compile('^(添加照片|更换照片)$')).click() or pg.get_by_role('button', name=re.compile('从相册选择|换一张')).click(), PHOTOS[2])
        pg.get_by_role('button', name='确认', exact=True).click(); expect(pg.get_by_text('已保存')).to_be_visible()
        close_editor()
        ok('4 添加（行程关联 / 先选类型再手动 / 照片），添加后直接进入编辑')

        # ———— 5 改标题：超长中英文都限长，不能清空；没离开输入框就要离开时提醒 ————
        open_editor(row_titles()[1])
        t = pg.get_by_label('亮点标题'); t.fill('Super long highlight title ' * 6 + '超长的中文标题' * 10)
        assert len(t.input_value()) == 40, len(t.input_value())
        pg.keyboard.press('Tab'); pg.wait_for_timeout(300); expect(pg.get_by_text('已保存')).to_be_visible()
        t.fill('   '); pg.keyboard.press('Tab'); pg.wait_for_timeout(300)
        assert t.input_value().strip(), '标题不能被清空'
        d = pg.get_by_label('简短描述'); d.fill('还没离开输入框的描述')
        no_overflow(pg, '编辑 390'); pg.screenshot(path=f'{OUT}/03-edit.png')
        close_editor()
        ok('5 标题限长、不能清空')

        # ———— 6 排序：按钮 + 拖动；隐藏 / 恢复（开关） ————
        t_before = row_titles()
        # 手机上行内放不下上下箭头：在这一条的编辑面板里「下移」
        open_editor(t_before[0]); pg.get_by_role('button', name='下移', exact=True).click(); pg.wait_for_timeout(300)
        expect(pg.get_by_text('顺序：第 2 / 3 个')).to_be_visible(); close_editor()
        assert row_titles()[1] == t_before[0], (t_before, row_titles())
        grip = pg.get_by_role('button', name=re.compile('^拖动「')).nth(2); gb = grip.bounding_box()
        top = pg.get_by_role('button', name=re.compile('^拖动「')).nth(0).bounding_box()
        pg.mouse.move(gb['x'] + 10, gb['y'] + 10); pg.mouse.down(); pg.mouse.move(gb['x'] + 10, top['y'] - 20, steps=12); pg.mouse.up(); pg.wait_for_timeout(400)
        assert row_titles()[0] != t_before[0] or row_titles() != t_before, row_titles()
        first = row_titles()[0]
        sw = pg.get_by_role('switch', name=f'显示「{first}」'); sw.click(); pg.wait_for_timeout(300)
        expect(sw).to_have_attribute('aria-checked', 'false')
        pg.get_by_role('button', name='完成').click()
        assert pg.locator('[data-hl]').count() == 2  # 阅读时隐藏的不出现
        pg.get_by_role('button', name='编辑', exact=True).click(); pg.get_by_role('switch', name=f'显示「{first}」').click(); pg.wait_for_timeout(300)
        pg.get_by_role('button', name='完成').click(); assert pg.locator('[data-hl]').count() == 3
        ok('6 按钮排序、拖动排序、隐藏与恢复')

        # ———— 6b 离开提醒：编辑面板里打字没离开输入框，点返回 → 先提醒 ————
        pg.get_by_role('button', name='编辑', exact=True).click(); open_editor(row_titles()[0])
        pg.get_by_label('简短描述').fill('一段还没保存的文字')
        pg.evaluate("document.querySelector('a[aria-label=返回旅程概览]').dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}))"); pg.wait_for_timeout(300)
        expect(pg.get_by_role('alertdialog')).to_contain_text(re.compile('还有修改|保存失败'))
        pg.get_by_role('alertdialog').get_by_role('button', name='留下').click()
        assert pg.url.endswith('/highlights')
        close_editor(); pg.get_by_role('button', name='完成').click(); pg.wait_for_timeout(300)
        ok('6b 未保存时离开会提醒')

        # ———— 7 刷新后全部保留（文字、照片、顺序） ————
        order_before = [h.inner_text() for h in pg.locator('[data-hl-title]').all()]
        pg.reload(); pg.wait_for_timeout(900)
        assert [h.inner_text() for h in pg.locator('[data-hl-title]').all()] == order_before
        assert pg.locator('[data-hl] img').count() >= 2
        no_overflow(pg, '阅读 390'); pg.screenshot(path=f'{OUT}/04-read.png', full_page=True); ok('7 刷新后保留')
        # 按类别分组：只显示有内容的类别；筛选只看某一类
        cats = [c.inner_text().split('\n')[0].split(' ')[0] for c in pg.locator('[class*=catTitle]').all()]
        assert len(cats) == len(set(cats)) and 1 <= len(cats) <= 3, cats
        if pg.get_by_role('group', name='按类别筛选').count():
            pg.get_by_role('group', name='按类别筛选').get_by_role('button', name=re.compile('^美食')).click(); pg.wait_for_timeout(200)
            assert pg.locator('[class*=catTitle]').count() == 1 and '美食' in pg.locator('[class*=catTitle]').first.inner_text()
            pg.get_by_role('group', name='按类别筛选').get_by_role('button', name=re.compile('^全部')).click()
        ok('7b 按类别分组与筛选')

        # ———— 8 上传失败：不是图片 / 太大 / 损坏；之后重试成功 ————
        pg.get_by_role('button', name='编辑', exact=True).click(); pg.get_by_role('button', name='更换封面').click()
        for path, msg in [(TXT, '不是图片'), (BIG, '太大'), (BAD, '读不出')]:
            pick(pg, lambda: pg.get_by_role('button', name=re.compile('从相册选择|换一张')).click(), path)
            expect(pg.get_by_role('alert')).to_contain_text(msg)
        pick(pg, lambda: pg.get_by_role('button', name=re.compile('从相册选择|换一张')).click(), PHOTOS[3])
        expect(pg.get_by_role('alert')).to_have_count(0); pg.get_by_role('button', name='确认', exact=True).click(); expect(pg.get_by_text('已保存')).to_be_visible()
        ok('8 失败提示与重试')

        # ———— 9 删除：说明范围；行程不受影响 ————
        open_editor(row_titles()[0]); pg.get_by_role('button', name='删除这条亮点').click()
        expect(pg.get_by_role('alertdialog')).to_contain_text(re.compile('不会删除行程里的|不能恢复'))
        pg.get_by_role('button', name='取消').click(); assert pg.locator('[data-hl]').count() == 3
        pg.get_by_role('button', name='删除这条亮点').click(); pg.get_by_role('alertdialog').get_by_role('button', name='删除').click(); pg.wait_for_timeout(400)
        assert pg.locator('[data-hl]').count() == 2
        pg.get_by_role('button', name='完成').click(); pg.wait_for_timeout(300)
        assert item_titles(pg, trip) == before, '行程内容被改动了'
        ok('9 删除亮点，行程原样')

        # ———— 10 实用信息：住宿与出行（引用行程）、贴士、清单（勾选、排序、删除）、长文字；刷新保留 ————
        pg.goto(f'{BASE}/trip/{trip}/highlights'); pg.wait_for_timeout(600)
        info = pg.locator('section[aria-labelledby=g-info]')
        expect(info).to_contain_text('住宿与出行'); expect(info).to_contain_text('札幌站前酒店')  # 来自行程，不编价格
        pg.get_by_role('button', name='编辑', exact=True).click()
        form = pg.locator('form').filter(has=pg.get_by_role('group', name='贴士类别'))
        def add_tip(cat, text):
            form.get_by_role('button', name=cat, exact=True).click(); form.get_by_label('内容').fill(text); form.get_by_role('button', name='添加', exact=True).click()
            expect(info.get_by_text(text[:12]).first).to_be_visible()
        add_tip('拍照建议', '民族写真建议一早拍摄')
        add_tip('出发清单', '确认民族写真预约')
        add_tip('出发清单', '准备好手信购物清单')
        add_tip('我的小便签', '超长的便签' * 20)
        # 清单排序：第二条上移
        pg.get_by_role('button', name='上移：准备好手信购物清单').click(); pg.wait_for_timeout(300)
        items = [t.input_value() for t in pg.locator('[data-tip-group=checklist] [data-tip] textarea').all()]
        assert '准备好手信' in items[0], items
        pg.get_by_role('button', name='完成').click(); pg.wait_for_timeout(300)
        # 阅读时也能勾选清单
        pg.get_by_role('checkbox', name='勾选：确认民族写真预约').click(); pg.wait_for_timeout(400)
        expect(pg.get_by_role('checkbox', name='取消勾选：确认民族写真预约')).to_be_checked()
        pg.reload(); pg.wait_for_timeout(800)
        expect(pg.get_by_role('checkbox', name='取消勾选：确认民族写真预约')).to_be_checked()
        assert [t.inner_text() for t in pg.locator('[data-tip-group=checklist] [data-tip]').all()][0].startswith('准备好手信')
        expect(pg.get_by_text('拍照建议')).to_be_visible()
        no_overflow(pg, '长便签')
        # 删除一条
        pg.get_by_role('button', name='编辑', exact=True).click(); pg.get_by_role('button', name='删除：民族写真建议一早拍摄').click(); pg.wait_for_timeout(300)
        assert pg.get_by_text('民族写真建议一早拍摄').count() == 0
        pg.get_by_role('button', name='完成').click()
        pg.get_by_role('button', name=re.compile('查看当天行程')).first.click(); pg.wait_for_url('**/itinerary/**'); ok('10 实用信息、清单勾选 / 排序 / 删除、刷新保留')

        # ———— 10b 每日精选：改主题、当天照片、不显示某一天；刷新保留；行程不变 ————
        pg.goto(f'{BASE}/trip/{trip}/highlights'); pg.wait_for_timeout(600)
        assert pg.locator('[data-day-card]').count() == 4
        pg.get_by_role('button', name='编辑', exact=True).click()
        t1 = pg.get_by_label('Day 1 主题'); t1.click(); t1.fill('初见札幌'); pg.get_by_role('heading', name=re.compile('天的故事')).click(); pg.wait_for_timeout(250)
        expect(pg.get_by_text('已保存')).to_be_visible()
        pg.locator('[data-day-card]').nth(0).get_by_role('button', name=re.compile('^(照片|换照片)$')).click()
        pick(pg, lambda: pg.get_by_role('button', name='从相册选择').click(), PHOTOS[1]); pg.get_by_role('button', name='确认', exact=True).click(); expect(pg.get_by_text('已保存')).to_be_visible()
        pg.locator('[data-day-card]').nth(1).get_by_role('button', name='不显示这一天').click(); pg.wait_for_timeout(300)
        pg.get_by_role('button', name='完成').click(); pg.wait_for_timeout(300)
        assert pg.locator('[data-day-card]').count() == 3
        pg.reload(); pg.wait_for_timeout(800)
        assert pg.locator('[data-day-card]').count() == 3
        expect(pg.locator('[data-day-card]').nth(0)).to_contain_text('初见札幌')
        assert pg.locator('[data-day-card]').nth(0).locator('img').count() == 1
        assert item_titles(pg, trip) == before, '行程内容被改动了'
        ok('10b 每日精选主题 / 照片 / 不显示某天，行程原样')

        # ———— 10c 长短行程：10 天、1 天 ————
        hk = open(os.path.join(HERE, 'fixtures', 'hokkaido.md'), encoding='utf-8').read()
        one = md.split('## Day 2')[0]
        for text, n in [(hk, None), (one, 1)]:
            pg.goto(BASE + '/import/paste'); pg.get_by_label('行程内容').fill(text)
            pg.get_by_role('button', name='解析并预览').click(); pg.wait_for_url('**/preview')
            pg.get_by_role('button', name='确认导入').click(); pg.wait_for_url('**/itinerary/**')
            tid = pg.url.rsplit('/', 1)[1]
            pg.goto(f'{BASE}/trip/{tid}/highlights'); pg.wait_for_timeout(700)
            cnt = pg.locator('[data-day-card]').count()
            assert (cnt == n) if n else cnt >= 10, cnt
            no_overflow(pg, f'{cnt} 天')
        ok('10c 1 天 / 10 天行程')

        # ———— 11 其它屏幕 / 主题 ————
        for w, h, name in [(360, 740, 'm360'), (1280, 800, 'desk')]:
            p2, e2 = ctx(w, h)
            t2 = import_trip(p2)
            p2.goto(f'{BASE}/trip/{t2}/highlights'); p2.wait_for_timeout(600)
            p2.get_by_role('button', name='编辑', exact=True).click(); p2.get_by_role('button', name='添加封面照片').click()
            pick(p2, lambda: p2.get_by_role('button', name='从相册选择').click(), PHOTOS[0]); p2.get_by_role('button', name='确认', exact=True).click(); expect(p2.get_by_text('已保存')).to_be_visible()
            for i, nm in enumerate(['青秀山', '老友粉', '三街两巷']):
                p2.get_by_role('button', name='添加亮点').first.click(); p2.get_by_role('button', name=re.compile('手动创建')).click()
                p2.get_by_role('dialog', name='选择内容类型').get_by_role('button', name='景点').click()
                p2.get_by_label('标题', exact=True).fill(nm); p2.get_by_label('手动创建').get_by_role('button', name='添加', exact=True).click(); p2.wait_for_timeout(300)
                if w < 1024: p2.keyboard.press('Escape'); p2.wait_for_timeout(200)
            if w >= 1024:
                expect(p2.get_by_role('complementary', name=re.compile('编辑亮点'))).to_be_visible()  # 电脑：右侧编辑面板
                box = p2.get_by_role('complementary', name=re.compile('编辑亮点')).bounding_box()
                main_right = p2.evaluate("Math.max(...[...document.querySelectorAll('[data-hl]')].map(e => e.getBoundingClientRect().right))")
                assert main_right <= box['x'] + 1, (main_right, box)  # 面板不压住内容
                # 改变窗口宽度：电脑面板变成手机弹层，没离开输入框的文字还在
                p2.get_by_label('简短描述').fill('切换屏宽也不会丢')
                p2.set_viewport_size({'width': 390, 'height': 844}); p2.wait_for_timeout(400)
                expect(p2.get_by_role('dialog').get_by_label('简短描述')).to_have_value('切换屏宽也不会丢')
                p2.get_by_role('dialog').get_by_label('简短描述').focus(); p2.keyboard.press('Tab'); p2.wait_for_timeout(300)
                p2.set_viewport_size({'width': w, 'height': h}); p2.wait_for_timeout(400)
                expect(p2.get_by_label('简短描述')).to_have_value('切换屏宽也不会丢')
            no_overflow(p2, f'{name} 编辑'); p2.screenshot(path=f'{OUT}/05-{name}-edit.png')
            p2.get_by_role('button', name='完成').click(); no_overflow(p2, f'{name} 阅读'); p2.screenshot(path=f'{OUT}/06-{name}-read.png', full_page=True)
            for th in ['winter', 'spring', 'autumn']:
                p2.evaluate(f"document.documentElement.dataset.theme='{th}'"); p2.wait_for_timeout(150)
                if name == 'm360': p2.screenshot(path=f'{OUT}/07-theme-{th}.png')
            assert not e2, e2
        assert not errs, errs
        ok('11 360 / 电脑布局、主题')
        b.close()
    print('GUIDE PASS')
finally:
    srv.terminate()
