"""UI-only fixture verification in isolated profiles. Never connects to Supabase or real user data.
QA_URL=http://127.0.0.1:4228 python check.py before
QA_URL=http://127.0.0.1:4227 python check.py after
"""
import datetime, json, os, pathlib, re, sys
from playwright.sync_api import sync_playwright, expect
ROOT=pathlib.Path(__file__).resolve().parents[2]
BASE=os.environ.get('QA_URL','http://127.0.0.1:4227')
STAGE=sys.argv[1] if len(sys.argv)>1 else 'after'
OUT=ROOT/'docs/mobile-tools'/STAGE; OUT.mkdir(parents=True,exist_ok=True)
MD=(ROOT/'qa/sample-v2.md').read_text()
NOW=datetime.datetime(2026,12,20,2,tzinfo=datetime.timezone.utc)

def measure(p):
    return p.evaluate('''() => {
      const box=e=>{const b=e.getBoundingClientRect();return {top:b.top+scrollY,height:b.height,bottom:b.bottom+scrollY}};
      return {countdown:box(document.querySelector('[aria-label="航班倒计时"]')),dates:box(document.querySelector('[role=tablist]')),
       day:box([...document.querySelectorAll('h2')].find(e=>e.textContent.startsWith('Day '))),
       first:box(document.querySelector('[role=checkbox]').closest('[class*="row_"]')),
       overflow:document.documentElement.scrollWidth>innerWidth};
    }''')

def setup(p):
    p.goto(BASE+'/import/paste'); p.get_by_label('行程内容',exact=True).fill(MD)
    p.get_by_role('button',name='解析并预览').click()
    p.get_by_role('button',name='确认导入',exact=True).click(); p.wait_for_url('**/itinerary/**')
    expect(p.get_by_role('tab')).to_have_count(4);p.wait_for_timeout(400);p.evaluate('scrollTo(0,0)')
    return p.url

def flight(p):
    p.get_by_role('button',name='设置航班时间',exact=True).first.click()
    d=p.get_by_role('dialog',name='航班时间设置')
    d.locator('select').nth(0).select_option('MY');d.locator('select').nth(1).select_option('JP')
    d.get_by_label('去程起飞（当地时间）',exact=True).fill('2027-01-13T08:30')
    d.get_by_label('回程起飞（当地时间）',exact=True).fill('2027-01-16T19:00')
    d.get_by_role('button',name='保存航班时间').click();expect(d).to_have_count(0)
    expect(p.get_by_role('timer')).to_be_visible();p.evaluate('scrollTo(0,0)')

def mobile_checks(p,url,w):
    trigger=p.get_by_role('button',name='打开旅程工具',exact=True)
    expect(trigger).to_be_visible()
    for button in [trigger,p.get_by_role('button',name='分享 / 邀请',exact=True),p.get_by_role('button',name='编辑航班时间',exact=True)]:
        box=button.bounding_box();assert box['width']>=44 and box['height']>=44
    expect(p.get_by_role('navigation',name='旅程工具')).to_have_count(0)
    assert all(not e.is_visible() for e in p.get_by_text('出发准备',exact=True).all())
    expect(p.get_by_role('button',name='设置航班时间',exact=True)).to_have_count(0)
    p.get_by_role('tab').nth(1).click();p.wait_for_timeout(300)
    selected=p.get_by_role('tab',selected=True).inner_text()
    p.evaluate('scrollTo(0,160)');scroll=p.evaluate('scrollY')
    trigger.click();d=p.get_by_role('dialog',name='旅程工具',exact=True);expect(d).to_be_visible()
    close=d.get_by_role('button',name='关闭旅程工具')
    expect(close).to_be_focused()
    assert p.evaluate('document.getElementById("root").inert')
    p.keyboard.press('Shift+Tab');expect(d.get_by_role('button',name=re.compile('^出发准备'))).to_be_focused()
    p.keyboard.press('Tab');expect(close).to_be_focused()
    p.mouse.move(5,100);p.mouse.wheel(0,500);p.wait_for_timeout(100)
    assert p.evaluate('scrollY')==scroll
    p.keyboard.press('Escape');expect(d).to_have_count(0);expect(trigger).to_be_focused()
    assert p.evaluate('scrollY')==scroll and p.get_by_role('tab',selected=True).inner_text()==selected
    trigger.click();close.click();assert p.evaluate('scrollY')==scroll
    trigger.click();p.mouse.click(5,5);expect(d).to_have_count(0);assert p.evaluate('scrollY')==scroll
    p.get_by_role('tab').first.click();p.wait_for_timeout(200);p.evaluate('scrollTo(0,0)')
    trigger.click();p.screenshot(path=str(OUT/f'{w}-tools.png'))
    for name,route in [('今日行程','today'),('旅程概览','story'),('穿搭与行李','outfits')]:
        if not d.count():trigger.click()
        d.get_by_role('button',name=re.compile('^'+name)).click();p.wait_for_url('**/'+route)
        expect(p.get_by_role('dialog',name='旅程工具',exact=True)).to_have_count(0)
        p.goto(url);expect(trigger).to_be_visible()
    trigger.click();d.get_by_role('button',name=re.compile('^出发准备')).click()
    prep=p.get_by_role('dialog',name='出发准备',exact=True);expect(prep).to_be_visible()
    expect(prep.get_by_text(re.compile('航班和住宿已关联证明'))).to_be_visible()
    prep.get_by_role('button',name='查看准备事项').click();p.wait_for_url('**/settings');p.goto(url)
    p.get_by_role('button',name='分享 / 邀请',exact=True).click();p.wait_for_url('**/settings#sync');p.goto(url)
    p.get_by_role('tab').nth(1).click();p.get_by_role('button',name='编辑航班时间').click()
    fd=p.get_by_role('dialog',name='航班时间设置')
    fd.get_by_label('去程起飞（当地时间）',exact=True).fill('2027-01-13T09:45')
    fd.get_by_role('button',name='保存航班时间').click();expect(fd).to_have_count(0)
    expect(p.get_by_role('tab',selected=True)).to_contain_text('14')
    p.reload();expect(p.get_by_role('region',name='航班倒计时')).to_contain_text('09:45')
    p.add_style_tag(content=':root {--safe-bottom:34px;--fs-title:40px;--fs-section:32px;--fs-small:28px;--fs-body:32px}')
    p.evaluate("document.querySelector('header button span').textContent='很长的旅程名称 · 家庭与朋友跨城市旅行'.repeat(4)")
    assert not p.evaluate('document.documentElement.scrollWidth>innerWidth')
    trigger.click()
    assert not d.evaluate('(e)=>e.scrollWidth>e.clientWidth')
    assert d.evaluate('(e)=>e.scrollHeight>e.clientHeight')
    d.get_by_role('button',name=re.compile('^出发准备')).scroll_into_view_if_needed()
    p.screenshot(path=str(OUT/f'{w}-large-text.png'));p.keyboard.press('Escape')
    return 'four entries, share, focus trap/restore, inert background, scroll lock/restore, Escape/backdrop/close, dates, edit/reload, 200% text + long title + 34px safe area passed'

with sync_playwright() as pw:
    browser=pw.chromium.launch();results={}
    for w in [360,390,430,768,1280]:
        ctx=browser.new_context(viewport={'width':w,'height':844},locale='zh-CN',timezone_id='Asia/Singapore',reduced_motion='reduce',service_workers='block')
        ctx.route('**/*.supabase.co/**',lambda route:route.abort())
        # Hosting review toolbar is not part of the app and intercepts mobile pointer input.
        ctx.route('**/.netlify/scripts/cdp*',lambda route:route.abort())
        p=ctx.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
        p.clock.install(time=NOW)
        url=setup(p)
        p.screenshot(path=str(OUT/f'{w}-home.png'));results[str(w)]={'unset':measure(p)}
        if STAGE=='before' and w==390:
            p.get_by_role('navigation',name='旅程工具').last.scroll_into_view_if_needed()
            p.screenshot(path=str(OUT/'390-tools.png'));p.evaluate('scrollTo(0,0)')
        flight(p);p.screenshot(path=str(OUT/f'{w}-flight.png'));results[str(w)]['set']=measure(p)
        if STAGE!='before' and w<768:results[str(w)]['interactions']=mobile_checks(p,url,w)
        if STAGE!='before' and w==390:
            p.goto(url);expect(p.get_by_role('button',name='编辑航班时间')).to_be_visible()
            for theme in ['summer','spring','autumn','winter']:
                p.evaluate("t=>t==='summer'?document.documentElement.removeAttribute('data-theme'):document.documentElement.setAttribute('data-theme',t)",theme)
                p.get_by_role('button',name='打开旅程工具').click()
                d=p.get_by_role('dialog',name='旅程工具',exact=True)
                expect(d).to_be_visible()
                assert not p.evaluate('document.documentElement.scrollWidth>innerWidth')
                p.screenshot(path=str(OUT/f'390-theme-{theme}.png'));p.keyboard.press('Escape')
            for at,phase in [(datetime.datetime(2027,1,14,2,tzinfo=datetime.timezone.utc),'vacation'),(datetime.datetime(2027,1,20,2,tzinfo=datetime.timezone.utc),'ended')]:
                p.clock.set_system_time(at);p.clock.run_for(61000)
                expect(p.locator('[data-flight-phase]')).to_have_attribute('data-flight-phase',phase)
                p.evaluate('scrollTo(0,0)')
                metrics=measure(p)
                assert metrics['countdown']['top']<metrics['dates']['top']
                p.screenshot(path=str(OUT/f'390-{phase}.png'))
            results[str(w)]['extra']='four seasons, departed/ended phases and countdown-before-dates passed'
        assert not results[str(w)]['set']['overflow'];assert not errors,errors
        ctx.close()
    browser.close()
(OUT/'measurements.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps(results,ensure_ascii=False,indent=2))
