import os,json,tempfile,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('FLIGHT_QA_URL','http://127.0.0.1:4190')
out=Path('outputs');out.mkdir(exist_ok=True)
results={}
production=os.environ.get('FLIGHT_QA_PRODUCTION')=='1'
with sync_playwright() as pw:
 for name in os.environ.get('FLIGHT_QA_BROWSERS','chromium,webkit').split(','):
  profile=None
  if name=='webkit':
   # WebKit private contexts cannot store Blob records; use an isolated normal profile.
   profile=tempfile.mkdtemp(prefix='flight-webkit-')
   ctx=pw.webkit.launch_persistent_context(profile,viewport={'width':1280,'height':900},timezone_id='America/Los_Angeles')
   browser=None
  else:
   browser=getattr(pw,name).launch();ctx=browser.new_context(viewport={'width':1280,'height':900},timezone_id='America/Los_Angeles')
  page=ctx.new_page();page.goto(base)
  if production:
   page.evaluate('''async()=>{await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Service worker was not ready within 20 seconds')),20000))]);await new Promise((resolve,reject)=>{const req=indexedDB.open('travel-rundown');req.onsuccess=()=>{const db=req.result;const tx=db.transaction(['trips','days'],'readwrite');tx.objectStore('trips').put({id:'photo-qa',title:'东京 · 富士山 · 北海道',startDate:'2027-01-10',endDate:'2027-01-19',homeTz:'Asia/Singapore',destination:'日本',theme:'summer',translate:{app:'google-translate',from:'auto',to:'zh-CN'},sourceMd:'',importedAt:'',updatedAt:'',flightCountdown:{origin:'SG',destination:'JP',departureTz:'Asia/Singapore',returnTz:'Asia/Tokyo',departureAt:Date.now()+86400000,returnAt:Date.now()+864000000}});tx.objectStore('days').put({id:'photo-day',tripId:'photo-qa',index:1,date:'2027-01-10',tz:'Asia/Tokyo',city:'东京'});tx.oncomplete=()=>{db.close();resolve()};tx.onerror=reject;};req.onerror=reject;});}''')
  else:
   page.evaluate('''async()=>{const {db}=await import('/src/db/schema.ts');await db.trips.put({id:'photo-qa',title:'东京 · 富士山 · 北海道',startDate:'2027-01-10',endDate:'2027-01-19',homeTz:'Asia/Singapore',destination:'日本',theme:'summer',translate:{app:'google-translate',from:'auto',to:'zh-CN'},sourceMd:'',importedAt:'',updatedAt:'',flightCountdown:{origin:'SG',destination:'JP',departureTz:'Asia/Singapore',returnTz:'Asia/Tokyo',departureAt:Date.now()+86400000,returnAt:Date.now()+864000000}});await db.days.put({id:'photo-day',tripId:'photo-qa',index:1,date:'2027-01-10',tz:'Asia/Tokyo',city:'东京'});}''')
  page.goto(base+'/itinerary/photo-qa');card=page.locator('section[aria-label="航班倒计时"]');expect(card).to_be_visible();scenery=card.locator('div[aria-hidden="true"]').first
  expect(card.get_by_role('heading',level=1)).to_contain_text('东京')
  expect(card.get_by_role('heading',level=2)).to_have_text('启程倒计时')
  expect(card.locator('h3 time')).to_have_count(2)
  assert 'UTC+8' in card.locator('h3').inner_text() and 'UTC+9' in card.locator('h3').inner_text()
  assert page.locator('nav[aria-label="主导航"]').get_by_role('button',name='旅程设置').is_visible()
  assert card.locator(':scope > div').first.bounding_box()['height']<=176
  expect(scenery.locator('img')).to_have_count(2);assert scenery.locator('img').evaluate_all('(xs)=>xs.every(x=>x.src.endsWith("-flag.svg"))')
  assert card.locator(':scope > *').count()==1
  page.screenshot(path=str(out/f'{name}-flag-default.png'))
  plane=page.locator('[data-flight-route] svg');r=plane.bounding_box();page.screenshot(path=str(out/f'{name}-plane-before.png'),clip={'x':r['x']-6,'y':r['y']-6,'width':r['width']+12,'height':r['height']+12})
  page.get_by_role('button',name='设置航班时间',exact=True).first.click()
  page.get_by_label('左侧背景照片').set_input_files('public/landing/flight-countdown/SG-landmark.png')
  expect(page.get_by_role('status')).to_contain_text('照片已保存')
  page.get_by_label('右侧背景照片').set_input_files('public/landing/flight-countdown/JP-landmark.png')
  expect(page.get_by_role('button',name='右侧恢复国旗')).to_be_enabled()
  page.wait_for_timeout(250);page.screenshot(path=str(out/f'{name}-photo-settings.png'))
  page.get_by_label('左侧背景照片').set_input_files({'name':'bad.png','mimeType':'image/png','buffer':b'not a photo'})
  expect(page.get_by_role('alert')).to_contain_text('无法读取')
  page.keyboard.press('Escape');page.reload();expect(scenery.locator('img[src^="blob:"]')).to_have_count(2)
  assert scenery.evaluate('(e)=>getComputedStyle(e).filter')=='grayscale(1) contrast(1.2)'
  assert scenery.evaluate('(e)=>getComputedStyle(e).mixBlendMode')=='overlay'
  assert scenery.locator('img').evaluate_all('(xs)=>xs.every(x=>x.complete&&x.naturalWidth>0)')
  for width in [1280,768,390,320]:
   page.set_viewport_size({'width':width,'height':900});card.scroll_into_view_if_needed();page.wait_for_timeout(150);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   h1=card.get_by_role('heading',level=1).bounding_box();h2=card.get_by_role('heading',level=2).bounding_box();h3=card.get_by_role('heading',level=3).bounding_box()
   assert h1['y']+h1['height']<=h2['y'] and h2['y']+h2['height']<=h3['y']
   assert card.locator(':scope > div').first.bounding_box()['height']<=235 if width<768 else card.locator(':scope > div').first.bounding_box()['height']<=205
   page.screenshot(path=str(out/f'{name}-custom-{width}.png'))
  page.get_by_role('button',name='修改目的地国家').click();page.get_by_role('button',name='泰国 Thailand').click();expect(page.get_by_role('dialog')).to_have_count(0)
  expect(scenery.locator('img[src^="blob:"]')).to_have_count(2)
  page.get_by_role('button',name='设置航班时间',exact=True).first.click()
  page.get_by_role('button',name='左侧恢复国旗').click();expect(page.get_by_role('status')).to_contain_text('已恢复该侧');expect(page.get_by_role('button',name='左侧恢复国旗')).to_be_disabled()
  page.keyboard.press('Escape');page.reload();expect(scenery.locator('img[src^="blob:"]')).to_have_count(1)
  assert scenery.locator('img').first.get_attribute('src').endswith('SG-flag.svg')
  if production:
   page.wait_for_function('navigator.serviceWorker.controller!==null')
   ctx.set_offline(True);page.reload();expect(scenery.locator('img[src^="blob:"]')).to_have_count(1)
   assert scenery.locator('img').nth(1).evaluate('(x)=>x.complete&&x.naturalWidth>0')
   page.get_by_role('button',name='设置航班时间',exact=True).first.click()
   page.get_by_label('左侧背景照片').set_input_files('public/landing/flight-countdown/CN-landmark.png')
   expect(page.get_by_role('status')).to_contain_text('照片已保存');page.keyboard.press('Escape');page.reload()
   expect(scenery.locator('img[src^="blob:"]')).to_have_count(2)
   assert scenery.locator('img').evaluate_all('(xs)=>xs.every(x=>x.complete&&x.naturalWidth>0)')
  ctx.set_offline(False);page.goto(base+'/trips');expect(page.get_by_role('heading',name='我的旅程',exact=True)).to_be_visible()
  assert page.locator('nav[aria-label="主导航"]').get_by_role('button',name='旅程设置').count()==0
  results[name]={'title_hierarchy':True,'both_flight_timezones':True,'sidebar_trip_settings':True,'reduced_height':True,'other_page_header_preserved':True,'offline_reload_and_upload':production,'defaults':'flags','uploads':'two sides survive reload','style':'fixed grayscale overlay','reset':'one side only','invalid_photo':'rejected','country_change':'custom photo retained','widths':[1280,768,390,320]}
  print(name,results[name],flush=True)
  ctx.close()
  if browser:browser.close()
  if profile:shutil.rmtree(profile)
json.dump(results,open(out/'photo-checks.json','w'),indent=2);print(json.dumps(results))
