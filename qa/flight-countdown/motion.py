import os
from pathlib import Path
import json
from playwright.sync_api import sync_playwright, expect
out=Path('outputs');out.mkdir(exist_ok=True)
base=os.environ.get('FLIGHT_QA_URL', 'http://127.0.0.1:4190')
results={}
with sync_playwright() as pw:
 for name in ['chromium','webkit']:
  browser=getattr(pw,name).launch()
  ctx=browser.new_context(viewport={'width':1280,'height':900},record_video_dir=str(out/'motion-video'),reduced_motion='no-preference')
  page=ctx.new_page();page.goto(base)
  page.evaluate('''async()=>{const {db}=await import('/src/db/schema.ts');await db.trips.put({id:'motion-qa',title:'东京 · 富士山 · 北海道',startDate:'2027-01-10',endDate:'2027-01-19',homeTz:'Asia/Singapore',destination:'日本',theme:'winter',translate:{app:'google-translate',from:'auto',to:'zh-CN'},sourceMd:'',importedAt:'',updatedAt:'',flightCountdown:{origin:'SG',destination:'JP',departureTz:'Asia/Singapore',returnTz:'Asia/Tokyo',departureAt:Date.now()-100000,returnAt:Date.now()-10000}});await db.days.put({id:'motion-day',tripId:'motion-qa',index:1,date:'2027-01-10',tz:'Asia/Tokyo',city:'东京'});}''')
  page.goto(base+'/itinerary/motion-qa');card=page.locator('section[aria-label="航班倒计时"]');expect(card).to_have_count(1);card.scroll_into_view_if_needed()
  saved=page.evaluate('''async()=>{const {db}=await import('/src/db/schema.ts');return (await db.trips.get('motion-qa')).flightCountdown}''')
  page.get_by_role('button',name='设置航班时间',exact=True).first.click()
  page.get_by_role('button',name='预览起飞动画').click()
  page.wait_for_selector('[data-flight-phase="flying"]')
  plane=page.locator('[data-flight-route] svg')
  xs=[]
  for delay in [200,1800,1800]:
   page.wait_for_timeout(delay);xs.append(plane.bounding_box()['x'])
  assert xs[0]+100<xs[1]<xs[2]-100,(name,xs)
  page.screenshot(path=str(out/f'{name}-flight-moving.png'))
  expect(page.locator('[data-flight-phase]')).to_have_attribute('data-flight-phase','vacation',timeout=2500)
  expect(page.locator('[data-flight-phase]')).to_have_attribute('data-flight-phase','ended',timeout=4000)
  actual=page.evaluate('''async()=>{const {db}=await import('/src/db/schema.ts');return (await db.trips.get('motion-qa')).flightCountdown}''');assert actual==saved
  # Real clock crossing, without the demo button.
  page.evaluate('''async()=>{const {db}=await import('/src/db/schema.ts');const t=await db.trips.get('motion-qa');await db.trips.update(t.id,{flightCountdown:{...t.flightCountdown,departureAt:Date.now()+1600,returnAt:Date.now()+86400000}});}''')
  page.wait_for_selector('[data-flight-phase="flying"]');x0=plane.bounding_box()['x'];page.wait_for_timeout(2200);x1=plane.bounding_box()['x'];assert x1>x0+100
  expect(page.locator('[data-flight-phase]')).to_have_attribute('data-flight-phase','vacation',timeout=4000)
  for width in [1280,768,390,320]:
   page.set_viewport_size({'width':width,'height':900});card.scroll_into_view_if_needed();page.wait_for_timeout(200)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(name,width)
   page.screenshot(path=str(out/f'{name}-itinerary-{width}.png'))
  page.goto(base+'/trip/motion-qa/story');expect(page.locator('section[aria-label="航班倒计时"]')).to_have_count(0)
  results[name]={'demo_plane_x':xs,'live_plane_x':[x0,x1],'preview_preserves_saved_time':True,'widths':[1280,768,390,320],'story_card_removed':True}
  ctx.close();browser.close()
json.dump(results,open(out/'motion-checks.json','w'),indent=2)
print(json.dumps(results))
