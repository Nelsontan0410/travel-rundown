# 视觉验收：逐页截图；--width 390/768/1280（先构建并启动 4173 预览服务）
import argparse, datetime, json, os, tempfile
from playwright.sync_api import sync_playwright, expect
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

def check_cleanup(page):
    assert page.evaluate('!document.getElementById("root").inert')
    assert page.evaluate('document.body.style.overflow === window.__baseBodyOverflow')
    assert page.evaluate('JSON.stringify(window.__overlayListeners()) === JSON.stringify(window.__baseOverlayListeners)')

def check_overlay(page, role, kind, reopen, trigger):
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
    assert overlay.evaluate('(el) => el.contains(document.activeElement)')
    assert page.evaluate('document.getElementById("root").inert && document.body.style.overflow === "hidden"')
    overlay.locator('button').last.focus()
    page.keyboard.press('Tab')
    trapped = overlay.evaluate('(el) => el.contains(document.activeElement)')
    assert trapped
    expect(overlay.locator('button').first).to_be_focused()
    page.keyboard.press('Shift+Tab')
    expect(overlay.locator('button').last).to_be_focused()
    page.evaluate('document.getElementById("root").querySelector("button").focus()')
    assert overlay.evaluate('(el) => el.contains(document.activeElement)')
    if role == 'alertdialog':
        overlay.locator('h2').click()
        expect(page.get_by_role(role)).to_have_count(1)
    page.evaluate('window.__overlayPanel = document.querySelector(\'[role="' + role + '"]\')')
    for resized in [767, 768, 1023, 1024, 1280, 390, args.width]:
        page.set_viewport_size({'width': resized, 'height': HEIGHT})
        assert overlay.evaluate('(el) => el === window.__overlayPanel && el.contains(document.activeElement)')
    page.keyboard.press('Escape')
    expect(page.get_by_role(role)).to_have_count(0)
    expect(trigger).to_be_focused()
    check_cleanup(page)
    reopen()
    expect(page.get_by_role(role)).to_have_count(1)
    page.mouse.click(2, 2)
    expect(page.get_by_role(role)).to_have_count(0)
    expect(trigger).to_be_focused()
    check_cleanup(page)
    shell_checks.append({'kind': kind, 'geometry': 'passed', 'box': box,
                         'focusTrap': trapped, 'escapeDismiss': True, 'backdropDismiss': True,
                         'focusRestore': True, 'backgroundInert': True, 'liveResizePreserved': True,
                         'listenerCleanup': True})

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
    if args.shell_checks:
        ctx.add_init_script('''(() => {
            const listeners = {keydown: new Set(), focusin: new Set()};
            const add = document.addEventListener, remove = document.removeEventListener;
            const capture = options => options === true || !!options?.capture;
            document.addEventListener = function(type, listener, options) {
                if (listeners[type] && capture(options)) listeners[type].add(listener);
                return add.call(this, type, listener, options);
            };
            document.removeEventListener = function(type, listener, options) {
                if (listeners[type] && capture(options)) listeners[type].delete(listener);
                return remove.call(this, type, listener, options);
            };
            window.__overlayListeners = () => ({keydown: listeners.keydown.size, focusin: listeners.focusin.size});
        })()''')
    page = ctx.new_page()
    page.clock.install(time=datetime.datetime(2027, 1, 13, 6, 30, tzinfo=datetime.timezone.utc))  # 15:30 JST
    page.goto(BASE + '/trips'); page.wait_for_timeout(800)
    capture(page, '04-empty')
    if args.shell_checks:
        page.evaluate('''() => {
            window.__baseBodyOverflow = document.body.style.overflow;
            window.__baseOverlayListeners = window.__overlayListeners();
        }''')
        def open_menu():
            page.get_by_label('更多').click(); page.wait_for_timeout(300)
        def open_about():
            open_menu()
            page.get_by_role('menuitem', name='关于').click(); page.wait_for_timeout(300)
        open_menu()
        capture(page, 'menu')
        check_overlay(page, 'menu', 'Menu', open_menu, page.get_by_label('更多'))
        open_about()
        capture(page, 'dialog')
        check_overlay(page, 'alertdialog', 'Dialog', open_about, page.get_by_label('更多'))
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
        if args.shell_checks and target == '温泉酒店入住':
            picker = page.get_by_role('dialog', name='关联行程项')
            selected = picker.get_by_text(target, exact=True).evaluate('(el) => el.closest("button").innerHTML')
            page.evaluate('window.__nestedPanel = [...document.querySelectorAll("[role=dialog]")].at(-1)')
            for resized in [767, 768, 1023, 1024, 1280, 390, args.width]:
                page.set_viewport_size({'width': resized, 'height': HEIGHT})
                assert picker.evaluate('(el) => el === window.__nestedPanel && el.contains(document.activeElement)')
                assert picker.get_by_text(target, exact=True).evaluate('(el) => el.closest("button").innerHTML') == selected
            page.keyboard.press('Escape')
            expect(page.get_by_role('dialog', name='关联行程项')).to_have_count(0)
            parent = page.get_by_role('dialog', name='添加预订证明')
            expect(parent).to_be_visible()
            expect(parent.get_by_text(os.path.basename(pdf_path), exact=True)).to_be_visible()
            assert parent.get_by_text('关联行程项', exact=True).evaluate('(el) => el.closest("button") === document.activeElement')
            assert page.evaluate('document.body.style.overflow === "hidden" && document.getElementById("root").inert')
            assert page.evaluate('''() => {
                const current = window.__overlayListeners(), base = window.__baseOverlayListeners;
                return current.keydown === base.keydown + 1 && current.focusin === base.focusin + 1;
            }''')
            shell_checks.append({'kind': 'nested-Sheet', 'topOnlyEscape': True, 'filePreserved': True,
                                 'selectionPreservedOnResize': True, 'parentFocusRestore': True,
                                 'parentScrollLockPreserved': True, 'singleListenerSet': True})
            page.get_by_text('关联行程项', exact=True).click()
            page.get_by_role('dialog', name='关联行程项').get_by_text(target, exact=True).click()
        page.get_by_text('完成', exact=True).click(); page.wait_for_timeout(200)
        page.get_by_text('保存', exact=True).click(); page.wait_for_timeout(500)
        if args.shell_checks:
            check_cleanup(page)
    capture(page, '03', full_page=True)
    if args.shell_checks:
        def open_sheet():
            page.get_by_text('添加', exact=True).click(); page.wait_for_timeout(300)
        open_sheet()
        capture(page, 'sheet')
        check_overlay(page, 'dialog', 'Sheet', open_sheet, page.get_by_role('button', name='添加', exact=True))
    # 航班标记完成
    page.get_by_text('行程', exact=True).click(); page.wait_for_timeout(400)
    page.get_by_text('抵达新千岁机场').click(); page.wait_for_timeout(300)
    page.get_by_text('标记完成').click(); page.wait_for_timeout(300)
    page.go_back(); page.wait_for_timeout(500)
    capture(page, '01')
    page.get_by_text('温泉酒店入住').click(); page.wait_for_timeout(500)
    capture(page, '02')
    capture(page, '02-full', full_page=True)
    if args.shell_checks:
        page.get_by_label('更多').click()
        page.get_by_role('menuitem', name='查看原文').click(); page.wait_for_timeout(300)
        source = page.get_by_role('dialog', name='原文')
        capture(page, 'source-sheet')
        assert source.locator('button').count() == 0
        for key in ['Tab', 'Shift+Tab']:
            page.keyboard.press(key)
            expect(source).to_be_focused()
        page.keyboard.press('Escape')
        expect(source).to_have_count(0)
        expect(page.get_by_label('更多')).to_be_focused()
        check_cleanup(page)
        shell_checks.append({'kind': 'readonly-Sheet', 'panelFocusFallback': True,
                             'focusTrap': True, 'escapeDismiss': True, 'focusRestore': True})
    page.get_by_text('查看证明').click(); page.wait_for_timeout(2500)
    capture(page, '06')
    page.get_by_label('返回').click(); page.wait_for_timeout(300)
    page.get_by_label('返回').click(); page.wait_for_timeout(300)
    page.get_by_label('旅程设置').click(); page.wait_for_timeout(1500)
    capture(page, '05', full_page=True)
    if args.shell_checks:
        for dismiss in ['Escape', 'backdrop']:
            page.get_by_text('删除这个旅程', exact=True).click()
            expect(page.get_by_role('alertdialog', name='删除这个旅程？')).to_be_visible()
            if dismiss == 'Escape':
                page.keyboard.press('Escape')
            else:
                page.mouse.click(2, 2)
            expect(page.get_by_role('alertdialog')).to_have_count(0)
            expect(page.get_by_role('heading', name='旅程设置', exact=True)).to_be_visible()
            check_cleanup(page)
        shell_checks.append({'kind': 'delete-Dialog', 'escapeDismiss': True,
                             'backdropDismiss': True, 'settingsPreserved': True})
    page.get_by_text('旅程', exact=True).click(); page.wait_for_timeout(500)
    capture(page, '04', full_page=True)
    if args.shell_checks:
        unexpected_choosers = []
        def record_chooser(chooser):
            unexpected_choosers.append(chooser)
        page.on('filechooser', record_chooser)
        for dismiss in ['Escape', 'backdrop']:
            page.get_by_text('恢复备份', exact=True).first.click()
            expect(page.get_by_role('alertdialog', name='恢复备份？')).to_be_visible()
            if dismiss == 'Escape':
                page.keyboard.press('Escape')
            else:
                page.mouse.click(2, 2)
            expect(page.get_by_role('alertdialog')).to_have_count(0)
            check_cleanup(page)
        page.remove_listener('filechooser', record_chooser)
        assert not unexpected_choosers
        shell_checks.append({'kind': 'restore-Dialog', 'escapeDismiss': True,
                             'backdropDismiss': True, 'fileChooserNotOpened': True})
    page.get_by_text('获取导入模板').first.click(); page.wait_for_timeout(300)
    capture(page, 'template')
    b.close()
with open(os.path.join(OUT, 'layout-checks.json'), 'w', encoding='utf-8') as f:
    json.dump(checks, f, ensure_ascii=False, indent=2)
if args.shell_checks:
    with open(os.path.join(OUT, 'shell-checks.json'), 'w', encoding='utf-8') as f:
        json.dump(shell_checks, f, ensure_ascii=False, indent=2)
print(f'{args.width}×{HEIGHT}: {len(checks)} 页截图与横向溢出检查通过')
