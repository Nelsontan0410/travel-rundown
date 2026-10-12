# 视觉验收：逐页截图；--width 390/768/1280（先构建并启动 4173 预览服务）
import argparse, datetime, json, os, tempfile
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:4173'
parser = argparse.ArgumentParser()
parser.add_argument('out')
parser.add_argument('cover')
parser.add_argument('--width', type=int, choices=[390, 768, 1280], default=390)
parser.add_argument('--shell-checks', action='store_true')
args = parser.parse_args()
OUT = args.out
COVER = args.cover
HEIGHT = {390: 844, 768: 1024, 1280: 800}[args.width]
HERE = os.path.dirname(__file__)
os.makedirs(OUT, exist_ok=True)
md = open(os.path.join(HERE, 'sample.md'), encoding='utf-8').read()
checks = []
shell_checks = []

def check_shell(page):
    result = page.evaluate('''() => {
        const nav = document.querySelector('nav[aria-label="主导航"]');
        if (!nav) return null;
        const box = nav.getBoundingClientRect();
        const mainEl = document.querySelector('main');
        const main = mainEl.getBoundingClientRect();
        const bottom = mainEl.nextElementSibling?.getBoundingClientRect();
        const side = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w'));
        const max = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--content-max'));
        const links = [...nav.querySelectorAll('a')];
        return {width: innerWidth, height: innerHeight, nav: {x: box.x, y: box.y, width: box.width, height: box.height},
            main: {x: main.x, width: main.width}, sidebar: side, contentMax: max,
            bottom: bottom ? {x: bottom.x, y: bottom.y, width: bottom.width, height: bottom.height} : null,
            entries: links.length, active: links.filter(a => a.getAttribute('aria-current') === 'page').length};
    }''')
    if not result:
        return
    nav, main = result['nav'], result['main']
    assert result['entries'] == 3 and result['active'] == 1, result
    if result['width'] >= 1024:
        assert abs(nav['x']) <= 1 and abs(nav['width'] - result['sidebar']) <= 1, result
        assert abs(nav['height'] - result['height']) <= 1, result
        available = result['width'] - result['sidebar']
        assert main['width'] <= result['contentMax'], result
        assert abs(main['x'] + main['width'] / 2 - (result['sidebar'] + available / 2)) <= 1, result
    else:
        assert abs(nav['y'] + nav['height'] - result['height']) <= 1, result
        assert abs(nav['width'] - main['width']) <= 1, result
        assert abs(main['x'] + main['width'] / 2 - result['width'] / 2) <= 1, result
    if result['bottom']:
        bottom = result['bottom']
        assert abs(bottom['x'] - main['x']) <= 1 and abs(bottom['width'] - main['width']) <= 1, result
        target = result['height'] if result['width'] >= 1024 else nav['y']
        assert abs(bottom['y'] + bottom['height'] - target) <= 1, result
    shell_checks.append({'kind': 'shell', **result})

def check_overlay(page, role, kind):
    overlay = page.get_by_role(role).last
    box = overlay.bounding_box()
    width, height = page.viewport_size['width'], page.viewport_size['height']
    assert box and box['width'] <= (480 if width >= 768 else width), box
    assert abs(box['x'] + box['width'] / 2 - width / 2) <= 1, box
    if width >= 768:
        assert abs(box['y'] + box['height'] / 2 - height / 2) <= 1, box
    else:
        assert abs(box['width'] - width) <= 1, box
        assert abs(box['y'] + box['height'] - height) <= 1, box
    # 只记录当前交互结果；Esc/焦点陷阱需范围例外确认，不伪报为通过。
    overlay.locator('button').last.focus()
    page.keyboard.press('Tab')
    trapped = overlay.evaluate('(el) => el.contains(document.activeElement)')
    page.keyboard.press('Escape')
    dismissed = page.get_by_role(role).count() == 0
    shell_checks.append({'kind': kind, 'geometry': 'passed', 'box': box,
                         'focusTrap': trapped, 'escapeDismiss': dismissed})

def capture(page, name, full_page=False):
    metrics = page.evaluate('''() => {
        const root = document.documentElement;
        const overflow = [...document.querySelectorAll('body *')].filter(el => {
            const style = getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || !el.getClientRects().length) return false;
            // 日期条和缩放后的证明允许在自己的滚动容器内滚动。
            for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
                if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(p).overflowX)) return false;
            }
            const box = el.getBoundingClientRect();
            return box.width > 0 && (box.left < -1 || box.right > root.clientWidth + 1);
        }).map(el => ({tag: el.tagName, className: String(el.className)}));
        return {viewport: root.clientWidth, document: root.scrollWidth, overflow};
    }''')
    checks.append({'page': name, **metrics})
    assert metrics['document'] <= metrics['viewport'], f'{name}: 页面横向溢出 {metrics}'
    assert not metrics['overflow'], f'{name}: 元素横向溢出 {metrics}'
    page.screenshot(path=os.path.join(OUT, name + '.png'), full_page=full_page)
    if args.shell_checks:
        check_shell(page)

with tempfile.TemporaryDirectory() as temp, sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'))
    # 证明 PDF
    pg = b.new_page()
    pg.set_content('<html><body style="font-family:sans-serif;padding:40px"><h1>酒店预订确认</h1><h2>温泉酒店</h2><p>预订编号 DEMO-001</p></body></html>')
    pdf_path = os.path.join(temp, '酒店预订证明.pdf')
    pg.pdf(path=pdf_path, format='A5')
    pg.close()

    ctx = b.new_context(viewport={'width': args.width, 'height': HEIGHT}, device_scale_factor=2, locale='zh-CN', timezone_id='Asia/Singapore')
    page = ctx.new_page()
    page.clock.install(time=datetime.datetime(2027, 1, 13, 6, 30, tzinfo=datetime.timezone.utc))  # 15:30 JST
    page.goto(BASE + '/trips'); page.wait_for_timeout(800)
    capture(page, '04-empty')
    if args.shell_checks:
        page.get_by_label('更多').click(); page.wait_for_timeout(300)
        capture(page, 'menu')
        check_overlay(page, 'menu', 'Menu')
        if page.get_by_role('menu').count():
            page.mouse.click(2, 2)
        shell_checks.append({'kind': 'Menu-backdrop', 'dismissed': page.get_by_role('menu').count() == 0})
        page.get_by_label('更多').click()
        page.get_by_role('menuitem', name='关于').click(); page.wait_for_timeout(300)
        capture(page, 'dialog')
        check_overlay(page, 'alertdialog', 'Dialog')
        page.mouse.click(2, 2)
        shell_checks.append({'kind': 'Dialog-backdrop', 'dismissed': page.get_by_role('alertdialog').count() == 0})
        if page.get_by_role('alertdialog').count():
            page.get_by_text('知道了', exact=True).click()
    page.get_by_text('粘贴行程文字').click()
    page.locator('textarea').fill(md)
    if args.shell_checks:
        page.evaluate('window.__shellTextarea = document.querySelector("textarea")')
        for width in [767, 768, 1023, 1024, 1280, 390, args.width]:
            page.set_viewport_size({'width': width, 'height': HEIGHT})
            assert page.locator('textarea').input_value() == md
            assert page.evaluate('window.__shellTextarea === document.querySelector("textarea")')
            check_shell(page)
        shell_checks.append({'kind': 'live-resize', 'draftPreserved': True, 'sameTextarea': True})
    capture(page, 'paste')
    page.get_by_text('解析并预览').click(); page.wait_for_timeout(300)
    capture(page, 'preview')
    page.get_by_text('确认导入').click(); page.wait_for_timeout(800)
    capture(page, '01-nocover')
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
    capture(page, '03', full_page=True)
    if args.shell_checks:
        page.get_by_text('添加', exact=True).click(); page.wait_for_timeout(300)
        capture(page, 'sheet')
        check_overlay(page, 'dialog', 'Sheet')
        if page.get_by_role('dialog').count():
            page.mouse.click(2, 2)
        shell_checks.append({'kind': 'Sheet-backdrop', 'dismissed': page.get_by_role('dialog').count() == 0})
    # 航班标记完成
    page.get_by_text('行程', exact=True).click(); page.wait_for_timeout(400)
    page.get_by_text('抵达新千岁机场').click(); page.wait_for_timeout(300)
    page.get_by_text('标记完成').click(); page.wait_for_timeout(300)
    page.go_back(); page.wait_for_timeout(500)
    capture(page, '01')
    page.get_by_text('温泉酒店入住').click(); page.wait_for_timeout(500)
    capture(page, '02')
    capture(page, '02-full', full_page=True)
    page.get_by_text('查看证明').click(); page.wait_for_timeout(2500)
    capture(page, '06')
    page.get_by_label('返回').click(); page.wait_for_timeout(300)
    page.get_by_label('返回').click(); page.wait_for_timeout(300)
    page.get_by_label('旅程设置').click(); page.wait_for_timeout(1500)
    capture(page, '05', full_page=True)
    page.get_by_text('旅程', exact=True).click(); page.wait_for_timeout(500)
    capture(page, '04', full_page=True)
    page.get_by_text('获取导入模板').first.click(); page.wait_for_timeout(300)
    capture(page, 'template')
    b.close()
with open(os.path.join(OUT, 'layout-checks.json'), 'w', encoding='utf-8') as f:
    json.dump(checks, f, ensure_ascii=False, indent=2)
if args.shell_checks:
    with open(os.path.join(OUT, 'shell-checks.json'), 'w', encoding='utf-8') as f:
        json.dump(shell_checks, f, ensure_ascii=False, indent=2)
print(f'{args.width}×{HEIGHT}: {len(checks)} 页截图与横向溢出检查通过')
