import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
out=Path('outputs');out.mkdir(exist_ok=True)
base='http://127.0.0.1:4190'
with sync_playwright() as pw:
 b=pw.chromium.launch()
 ctx=b.new_context(viewport={'width':1280,'height':900},timezone_id='America/Los_Angeles')
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base)
 page.evaluate('''async()=>{ const {db}=await import('/src/db/schema.ts'); await db.trips.put({id:'flight-qa',title:'航班模块测试',startDate:'2027-01-10',endDate:'2027-01-19',homeTz:'Asia/Singapore',destination:'日本',theme:'winter',translate:{app:'google-translate',from:'auto',to:'zh-CN'},sourceMd:'',importedAt:'',updatedAt:'',flightCountdown:{origin:'SG',destination:'JP',departureTz:'Asia/Singapore',returnTz:'Asia/Tokyo',departureAt:Date.now()+86400000*8,returnAt:Date.now()+86400000*18}});await db.days.put({id:'qa-day',tripId:'flight-qa',index:1,date:'2027-01-10',tz:'Asia/Tokyo',city:'东京'}); }''')
 page.goto(base+'/trip/flight-qa/story');page.locator('[data-flight-phase]').wait_for()
 for width in [1280,768,390,320]:
  page.set_viewport_size({'width':width,'height':900});page.wait_for_timeout(300)
  page.screenshot(path=str(out/f'flight-{width}-before.png'))
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),width
 page.set_viewport_size({'width':1280,'height':900})
 page.get_by_role('button',name='修改目的地国家').click();page.get_by_role('button',name='韩国 South Korea').click();expect(page.get_by_role('button',name='修改目的地国家')).to_contain_text('South Korea')
 page.get_by_role('button',name='设置航班时间',exact=True).click();expect(page.get_by_role('dialog')).to_be_visible();page.screenshot(path=str(out/'flight-settings.png'));page.keyboard.press('Escape')
 # Force a real live time crossing, isolated synthetic data only.
 page.evaluate('''async()=>{const {db}=await import('/src/db/schema.ts');const t=await db.trips.get('flight-qa');await db.trips.update(t.id,{flightCountdown:{...t.flightCountdown,destination:'JP',returnTz:'Asia/Tokyo',departureAt:Date.now()+1800,returnAt:Date.now()+86400000}});}''')
 page.wait_for_selector('[data-flight-phase="flying"]');page.wait_for_timeout(1600);page.screenshot(path=str(out/'flight-1280-flying.png'))
 expect(page.locator('[data-flight-phase]')).to_have_attribute('data-flight-phase','vacation',timeout=6000)
 page.screenshot(path=str(out/'flight-1280-vacation.png'));page.reload();expect(page.locator('[data-flight-phase]')).to_have_attribute('data-flight-phase','vacation')
 page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(out/'flight-390-vacation.png'))
 for theme in ['spring','summer','autumn','winter']:
  page.evaluate('''async(theme)=>{const {db}=await import('/src/db/schema.ts');await db.trips.update('flight-qa',{theme});}''',theme);page.wait_for_timeout(100);page.locator('section[aria-label="航班倒计时"]').screenshot(path=str(out/f'flight-theme-{theme}.png'))
 assert not errors,errors
 json.dump({'widths':[320,390,768,1280],'timezone':'America/Los_Angeles','errors':errors,'checks':['no horizontal overflow','country picker','settings sheet and Escape','live 4.6s flight','vacation after reload','four themes']},open(out/'flight-browser-checks.json','w'),indent=2)
 b.close()
