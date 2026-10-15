from pathlib import Path
Path('outputs').mkdir(exist_ok=True)
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
import json
base='http://127.0.0.1:4190'
with sync_playwright() as p:
 b=p.chromium.launch();ctx=b.new_context(viewport={'width':390,'height':844},timezone_id='America/Los_Angeles');page=ctx.new_page();page.goto(base)
 page.evaluate('''async()=>{const {db}=await import('/src/db/schema.ts');await db.trips.put({id:'form-qa',title:'QA',startDate:'2027-01-10',endDate:'2027-01-19',homeTz:'Asia/Singapore',destination:'日本',translate:{app:'google-translate',from:'auto',to:'zh-CN'},sourceMd:'',importedAt:'',updatedAt:''});await db.days.put({id:'form-day',tripId:'form-qa',index:1,date:'2027-01-10',tz:'Asia/Tokyo',city:'东京'});}''')
 page.goto(base+'/trip/form-qa/story');page.get_by_role('button',name='设置航班时间',exact=True).first.click()
 page.get_by_label('去程起飞（当地时间）').fill('2027-01-10T06:10');page.get_by_label('回程起飞（当地时间）').fill('2027-01-09T20:30');page.get_by_role('button',name='保存航班时间').click();expect(page.get_by_role('alert')).to_be_visible()
 page.get_by_label('回程起飞（当地时间）').fill('2027-01-19T20:30');page.get_by_role('button',name='保存航班时间').click();expect(page.get_by_role('dialog')).to_have_count(0)
 saved=page.evaluate('''async()=>{const {db}=await import('/src/db/schema.ts');return (await db.trips.get('form-qa')).flightCountdown}''');assert saved['departureAt']==1799532600000,saved
 page.reload();expect(page.locator('[data-flight-phase]')).to_have_attribute('data-flight-phase','before')
 # Changing country preserves UTC instant and survives reload.
 page.get_by_role('button',name='修改目的地国家').click();page.get_by_role('button',name='泰国 Thailand').click();page.reload();expect(page.get_by_role('button',name='修改目的地国家')).to_contain_text('Thailand')
 updated=page.evaluate('''async()=>{const {db}=await import('/src/db/schema.ts');return (await db.trips.get('form-qa')).flightCountdown}''');assert updated['returnAt']==saved['returnAt'];assert updated['returnTz']=='Asia/Bangkok'
 page.emulate_media(reduced_motion='reduce')
 page.evaluate('''async()=>{const {db}=await import('/src/db/schema.ts');const t=await db.trips.get('form-qa');await db.trips.update(t.id,{flightCountdown:{...t.flightCountdown,departureAt:Date.now()+500,returnAt:Date.now()+10000}});}''')
 page.wait_for_timeout(900);expect(page.locator('[data-flight-phase]')).to_have_attribute('data-flight-phase','vacation')
 page.evaluate('''async()=>{const {db}=await import('/src/db/schema.ts');const t=await db.trips.get('form-qa');await db.trips.update(t.id,{flightCountdown:{...t.flightCountdown,departureAt:Date.now()-10000,returnAt:Date.now()-100}});}''')
 expect(page.locator('[data-flight-phase]')).to_have_attribute('data-flight-phase','ended')
 json.dump({'checks':['invalid return blocked','settings form saves in country timezones on US device','reload persists','country change preserves instant','reduced motion skips transition','ended at return takeoff']},open('outputs/flight-extra-checks.json','w'),indent=2)
 b.close()
