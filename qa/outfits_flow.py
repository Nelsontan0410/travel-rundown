# 2026-10 第一批 ④ 穿搭 + 衣橱 + 打包清单 浏览器验收
# 运行：npm run build && python3 qa/outfits_flow.py [截图目录]
import os, re, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright, expect
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
PORT = 4192; BASE = f'http://localhost:{PORT}'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'outfitshots'); os.makedirs(OUT, exist_ok=True)
md = open(os.path.join(HERE, 'sample-v2.md'), encoding='utf-8').read()
tmp = tempfile.mkdtemp()
coat_jpg = os.path.join(tmp, 'coat.jpg'); Image.new('RGB', (400, 500), (40, 44, 60)).save(coat_jpg)

srv = subprocess.Popen(['npx', 'vite', 'preview', '--port', str(PORT), '--strictPort'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def add_garment(page, name, cat, photo=None):
    dlg = page.get_by_role('dialog', name='新增单品')
    if photo:
        with page.expect_file_chooser() as fc:
            dlg.get_by_role('button', name='添加照片').click()
        fc.value.set_files(photo)
        expect(dlg.get_by_role('button', name='更换照片')).to_be_visible()
    dlg.get_by_placeholder('例如：黑色羽绒外套').fill(name)
    dlg.get_by_role('tab', name=cat).click()
    dlg.get_by_role('button', name='保存').click()
    expect(page.get_by_role('dialog', name='新增单品')).to_have_count(0)

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
            page.get_by_role('button', name='穿搭与打包').click(); page.wait_for_url('**/outfits')
            expect(page.get_by_text('先把要带的衣服加进衣橱')).to_be_visible()

            # Day 1：在穿搭弹层里当场新增 3 件，自动选上
            page.get_by_role('button', name='编辑 Day 1 的穿搭').click()
            for name, cat, photo in [('黑色羽绒外套', '外套', coat_jpg), ('白色毛衣', '上衣', None), ('牛仔裤', '裤 / 裙', None)]:
                page.get_by_role('button', name='新增单品').last.click()
                add_garment(page, name, cat, photo)
            page.get_by_role('button', name='保存（3 件）').click()
            # Day 2：沿用 Day 1，再换掉毛衣
            page.get_by_role('button', name='编辑 Day 2 的穿搭').click()
            page.get_by_role('button', name='沿用 Day 1 的单品').click()
            page.get_by_role('button', name='白色毛衣').click()
            page.get_by_role('button', name='新增单品').last.click()
            add_garment(page, '灰色卫衣', '上衣')
            page.get_by_role('button', name='保存（3 件）').click()
            expect(page.get_by_text('还有 2 天没安排：Day 3、4')).to_be_visible()
            page.screenshot(path=os.path.join(OUT, f'{w}-01-days.png'), full_page=True)

            # 打包清单：外套只出现一次，标明 Day 1、2
            page.get_by_role('tab', name='打包清单').click()
            coat = page.get_by_role('checkbox', name='未装：黑色羽绒外套')
            expect(coat).to_have_count(1)
            expect(page.get_by_text('外套 · Day 1、2')).to_be_visible()
            expect(page.get_by_text('已装 0 / 4')).to_be_visible()
            coat.click()
            expect(page.get_by_role('checkbox', name='已装：黑色羽绒外套')).to_be_visible()
            page.get_by_role('button', name='+ 常用物品').click()
            expect(page.get_by_text('护照')).to_be_visible()
            expect(page.get_by_text('已装 1 / 13')).to_be_visible()
            page.get_by_role('button', name='+ 常用物品').click()
            expect(page.get_by_text('这些都已经在清单里了')).to_be_visible()
            page.get_by_role('button', name='删除：充电宝').click()
            expect(page.get_by_text('已装 1 / 12')).to_be_visible()
            page.get_by_role('button', name='加物品').click()
            page.get_by_placeholder('例如：自拍杆').fill('自拍杆')
            page.get_by_role('button', name='加入').click()
            page.get_by_role('button', name='完成').click()
            expect(page.get_by_text('已装 1 / 13')).to_be_visible()
            page.screenshot(path=os.path.join(OUT, f'{w}-02-pack.png'), full_page=True)

            # 衣橱：改名后每天的穿搭跟着变
            page.get_by_role('tab', name='衣橱').click()
            expect(page.get_by_text('这次穿 2 天')).to_have_count(2)
            page.get_by_role('button', name=re.compile('^灰色卫衣')).click()
            page.get_by_role('dialog', name='编辑单品').get_by_placeholder('例如：黑色羽绒外套').fill('灰色连帽卫衣')
            page.get_by_role('dialog', name='编辑单品').get_by_role('button', name='保存').click()
            page.screenshot(path=os.path.join(OUT, f'{w}-03-wardrobe.png'), full_page=True)
            page.get_by_role('tab', name='每日穿搭').click()
            expect(page.get_by_text('灰色连帽卫衣')).to_be_visible()
            # 刷新后都还在
            page.reload(); page.wait_for_timeout(500)
            expect(page.get_by_text('灰色连帽卫衣')).to_be_visible()
            assert page.evaluate('document.documentElement.scrollWidth > innerWidth') is False
            assert not errs, errs
            print('ok', w)
            ctx.close()
finally:
    srv.terminate()
