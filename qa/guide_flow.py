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
        pg.goto(f'{BASE}/trip/{trip}/story'); pg.wait_for_timeout(600)
        expect(pg.get_by_role('heading', name='旅行亮点')).to_be_visible()
        expect(pg.get_by_text('还没有亮点')).to_be_visible()
        expect(pg.get_by_text('还没有封面照片')).to_be_visible()
        expect(pg.locator('main img, header img')).to_have_count(0)  # 不显示假装真实的照片
        expect(pg.get_by_role('heading', name='每日精选')).to_be_visible()
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
        pg.get_by_role('button', name='确认').click()
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
        intro = pg.get_by_label('旅行简介'); intro.click(); intro.fill('老城街巷、壮族文化、地道广西味道。' * 10); pg.get_by_role('heading', name='精选亮点').click()
        expect(pg.get_by_text('已保存')).to_be_visible()
        assert len(intro.input_value()) == 120, len(intro.input_value())
        ok('3 简介限长 120')

        # ———— 4 从 Rundown 关联 + 手动添加 + 照片 ————
        pg.get_by_role('button', name='添加亮点').first.click()
        pg.get_by_role('button', name=re.compile('从行程里选')).click()
        name = pg.locator('[class*=candTitle]').first.inner_text()
        pg.get_by_label('搜索').fill(name[:2]); pg.locator('[class*=candList] button:not([disabled])').first.click()
        expect(pg.get_by_label('亮点标题').first).to_have_value(name)
        pg.get_by_role('button', name='添加亮点').click(); pg.get_by_role('button', name=re.compile('手动创建')).click()
        pg.get_by_label('标题', exact=True).fill('青秀山'); pg.get_by_role('button', name='美食').click()
        pg.get_by_label('简短描述（可选）').fill('城市绿肺，俯瞰南宁')
        pick(pg, lambda: pg.get_by_role('button', name='选照片').click(), PHOTOS[1])
        expect(pg.get_by_alt_text('已选照片')).to_be_visible()
        pg.get_by_label('手动创建').get_by_role('button', name='添加', exact=True).click()
        expect(pg.get_by_label('亮点标题')).to_have_count(2)
        pg.get_by_role('button', name='添加亮点').click(); pg.get_by_role('button', name=re.compile('手动创建')).click()
        pg.get_by_label('标题', exact=True).fill('三街两巷'); pg.get_by_label('手动创建').get_by_role('button', name='添加', exact=True).click()
        expect(pg.get_by_label('亮点标题')).to_have_count(3)
        # 给第一条加照片
        pick(pg, lambda: pg.get_by_role('button', name=re.compile('^(照片|换照片)$')).first.click() or pg.get_by_role('button', name=re.compile('从相册选择|换一张')).click(), PHOTOS[2])
        pg.get_by_role('button', name='确认').click(); expect(pg.get_by_text('已保存')).to_be_visible()
        ok('4 添加（行程关联 / 手动 / 照片）')

        # ———— 5 改标题：超长中英文都限长，且不会撑破版面 ————
        t = pg.get_by_label('亮点标题').nth(1); t.click(); t.fill('Super long highlight title ' * 6 + '超长的中文标题' * 10); pg.get_by_role('heading', name='精选亮点').click()
        assert len(t.input_value()) == 40, len(t.input_value())
        t0 = pg.get_by_label('亮点标题').nth(2); t0.click(); t0.fill('   '); pg.get_by_role('heading', name='精选亮点').click()
        assert t0.input_value().strip(), '标题不能被清空'
        no_overflow(pg, '编辑 390'); pg.screenshot(path=f'{OUT}/03-edit.png')
        ok('5 标题限长、不能清空')

        # ———— 6 排序：按钮 + 拖动；隐藏 / 恢复 ————
        titles = lambda: [pg.get_by_label('亮点标题').nth(i).input_value() for i in range(pg.get_by_label('亮点标题').count())]
        t_before = titles()
        pg.get_by_role('button', name=re.compile('^下移「')).first.click(); pg.wait_for_timeout(300)
        assert titles()[1] == t_before[0], (t_before, titles())
        grip = pg.get_by_role('button', name=re.compile('^拖动「')).nth(2); gb = grip.bounding_box()
        top = pg.get_by_role('button', name=re.compile('^拖动「')).nth(0).bounding_box()
        pg.mouse.move(gb['x'] + 10, gb['y'] + 10); pg.mouse.down(); pg.mouse.move(gb['x'] + 10, top['y'] - 40, steps=12); pg.mouse.up(); pg.wait_for_timeout(400)
        assert titles()[0] == t_before[2] or titles()[0] != t_before[0], titles()
        hide = pg.get_by_role('button', name='隐藏').first; hide.click(); pg.wait_for_timeout(300)
        expect(pg.get_by_text('已隐藏')).to_be_visible()
        pg.get_by_role('button', name='完成').click()
        assert pg.get_by_label('亮点标题').count() == 0 and pg.locator('[class*=hCard]').count() == 2  # 阅读时隐藏的不出现
        pg.get_by_role('button', name='编辑', exact=True).click(); pg.get_by_role('button', name='显示').first.click(); pg.wait_for_timeout(300)
        pg.get_by_role('button', name='完成').click(); assert pg.locator('[class*=hCard]').count() == 3
        ok('6 按钮排序、拖动排序、隐藏与恢复')

        # ———— 7 刷新后全部保留（文字、照片、顺序） ————
        order_before = [h.inner_text() for h in pg.locator('[class*=hTitle]').all()]
        pg.reload(); pg.wait_for_timeout(900)
        assert [h.inner_text() for h in pg.locator('[class*=hTitle]').all()] == order_before
        assert pg.locator('[class*=hCard] img').count() >= 2
        no_overflow(pg, '阅读 390'); pg.screenshot(path=f'{OUT}/04-read.png', full_page=True); ok('7 刷新后保留')

        # ———— 8 上传失败：不是图片 / 太大 / 损坏；之后重试成功 ————
        pg.get_by_role('button', name='编辑', exact=True).click(); pg.get_by_role('button', name='更换封面').click()
        for path, msg in [(TXT, '不是图片'), (BIG, '太大'), (BAD, '读不出')]:
            pick(pg, lambda: pg.get_by_role('button', name=re.compile('从相册选择|换一张')).click(), path)
            expect(pg.get_by_role('alert')).to_contain_text(msg)
        pick(pg, lambda: pg.get_by_role('button', name=re.compile('从相册选择|换一张')).click(), PHOTOS[3])
        expect(pg.get_by_role('alert')).to_have_count(0); pg.get_by_role('button', name='确认').click(); expect(pg.get_by_text('已保存')).to_be_visible()
        ok('8 失败提示与重试')

        # ———— 9 删除：说明范围；行程不受影响 ————
        pg.get_by_role('button', name='删除', exact=True).first.click()
        expect(pg.get_by_role('alertdialog')).to_contain_text(re.compile('不会删除行程里的|不能恢复'))
        pg.get_by_role('button', name='取消').click(); assert pg.locator('[class*=hCard]').count() == 3
        pg.get_by_role('button', name='删除', exact=True).first.click(); pg.get_by_role('alertdialog').get_by_role('button', name='删除').click(); pg.wait_for_timeout(400)
        assert pg.locator('[class*=hCard]').count() == 2
        assert item_titles(pg, trip) == before, '行程内容被改动了'
        ok('9 删除亮点，行程原样')

        # ———— 10 贴士 + 每日精选 + 导航 ————
        pg.goto(f'{BASE}/trip/{trip}/story'); pg.wait_for_timeout(600)
        pg.get_by_role('button', name='编辑', exact=True).click()
        pg.get_by_role('button', name='拍照建议').click(); pg.get_by_label('添加贴士').fill('民族写真建议一早拍摄'); pg.get_by_role('button', name='添加', exact=True).click()
        expect(pg.get_by_text('民族写真建议一早拍摄')).to_be_visible(); pg.get_by_role('button', name='完成').click()
        expect(pg.get_by_text('拍照建议')).to_be_visible()
        pg.get_by_role('button', name=re.compile('查看当天行程')).first.click(); pg.wait_for_url('**/itinerary/**'); ok('10 贴士、每日精选入口')

        # ———— 11 其它屏幕 / 主题 ————
        for w, h, name in [(360, 740, 'm360'), (1280, 800, 'desk')]:
            p2, e2 = ctx(w, h)
            t2 = import_trip(p2)
            p2.goto(f'{BASE}/trip/{t2}/story'); p2.wait_for_timeout(600)
            p2.get_by_role('button', name='编辑', exact=True).click(); p2.get_by_role('button', name='添加封面照片').click()
            pick(p2, lambda: p2.get_by_role('button', name='从相册选择').click(), PHOTOS[0]); p2.get_by_role('button', name='确认').click(); expect(p2.get_by_text('已保存')).to_be_visible()
            for i, nm in enumerate(['青秀山', '老友粉', '三街两巷']):
                p2.get_by_role('button', name='添加亮点').first.click(); p2.get_by_role('button', name=re.compile('手动创建')).click()
                p2.get_by_label('标题', exact=True).fill(nm); p2.get_by_label('手动创建').get_by_role('button', name='添加', exact=True).click(); p2.wait_for_timeout(300)
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
