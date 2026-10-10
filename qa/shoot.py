# 视觉验收：390×844 视口逐页截图（运行前先 npm run build && npx vite preview --port 4173）
import sys, datetime, os
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:4173'
OUT = sys.argv[1]
COVER = sys.argv[2]
HERE = os.path.dirname(__file__)
os.makedirs(OUT, exist_ok=True)
md = open(os.path.join(HERE, 'sample.md'), encoding='utf-8').read()

with sync_playwright() as p:
    b = p.chromium.launch()
    # 证明 PDF
    pg = b.new_page()
    pg.set_content('<html><body style="font-family:sans-serif;padding:40px"><h1>酒店预订确认</h1><h2>温泉酒店</h2><p>预订编号 DEMO-001</p></body></html>')
    pdf_path = os.path.join(OUT, '酒店预订证明.pdf')
    pg.pdf(path=pdf_path, format='A5')
    pg.close()

    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='zh-CN', timezone_id='Asia/Singapore')
    page = ctx.new_page()
    page.clock.install(time=datetime.datetime(2027, 1, 13, 6, 30, tzinfo=datetime.timezone.utc))  # 15:30 JST
    page.goto(BASE + '/trips'); page.wait_for_timeout(800)
    page.screenshot(path=f'{OUT}/04-empty.png')
    page.get_by_text('粘贴行程文字').click()
    page.locator('textarea').fill(md)
    page.screenshot(path=f'{OUT}/paste.png')
    page.get_by_text('解析并预览').click(); page.wait_for_timeout(300)
    page.screenshot(path=f'{OUT}/preview.png')
    page.get_by_text('确认导入').click(); page.wait_for_timeout(800)
    page.screenshot(path=f'{OUT}/01-nocover.png')
    # 封面
    page.get_by_label('旅程设置').click(); page.wait_for_timeout(300)
    with page.expect_file_chooser() as fc:
        page.get_by_label('更换封面').click()
    fc.value.set_files(COVER); page.wait_for_timeout(800)
    # 添加证明（03）
    page.get_by_text('资料', exact=True).click(); page.wait_for_timeout(400)
    for target in ['温泉酒店入住', '抵达新千岁机场']:
        page.get_by_text('添加', exact=True).click()
        with page.expect_file_chooser() as fc:
            page.get_by_text('从文件选择').click()
        fc.value.set_files(pdf_path); page.wait_for_timeout(500)
        page.get_by_text('关联行程项').click(); page.wait_for_timeout(200)
        page.locator('[role=dialog]').last.get_by_text(target, exact=True).click()
        page.get_by_text('完成', exact=True).click(); page.wait_for_timeout(200)
        page.get_by_text('保存', exact=True).click(); page.wait_for_timeout(500)
    page.screenshot(path=f'{OUT}/03.png', full_page=True)
    # 航班标记完成
    page.get_by_text('行程', exact=True).click(); page.wait_for_timeout(400)
    page.get_by_text('抵达新千岁机场').click(); page.wait_for_timeout(300)
    page.get_by_text('标记完成').click(); page.wait_for_timeout(300)
    page.go_back(); page.wait_for_timeout(500)
    page.screenshot(path=f'{OUT}/01.png')
    page.get_by_text('温泉酒店入住').click(); page.wait_for_timeout(500)
    page.screenshot(path=f'{OUT}/02.png')
    page.screenshot(path=f'{OUT}/02-full.png', full_page=True)
    page.get_by_text('查看证明').click(); page.wait_for_timeout(2500)
    page.screenshot(path=f'{OUT}/06.png')
    page.get_by_label('返回').click(); page.wait_for_timeout(300)
    page.get_by_label('返回').click(); page.wait_for_timeout(300)
    page.get_by_label('旅程设置').click(); page.wait_for_timeout(1500)
    page.screenshot(path=f'{OUT}/05.png', full_page=True)
    page.get_by_text('旅程', exact=True).click(); page.wait_for_timeout(500)
    page.screenshot(path=f'{OUT}/04.png', full_page=True)
    page.get_by_text('获取导入模板').first.click(); page.wait_for_timeout(300)
    page.screenshot(path=f'{OUT}/template.png')
    b.close()
