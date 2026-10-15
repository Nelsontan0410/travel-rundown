from pathlib import Path
Path('outputs').mkdir(exist_ok=True)
import json
from playwright.sync_api import sync_playwright,expect
with sync_playwright() as p:
 b=p.chromium.launch();ctx=b.new_context();page=ctx.new_page();page.goto('http://127.0.0.1:4191')
 page.evaluate('''async()=>{await navigator.serviceWorker.ready;await new Promise((resolve,reject)=>{const req=indexedDB.open('travel-rundown');req.onsuccess=()=>{const db=req.result;const tx=db.transaction(['trips','days'],'readwrite');tx.objectStore('trips').put({id:'offline-qa',title:'QA',startDate:'2027-01-10',endDate:'2027-01-19',homeTz:'Asia/Singapore',destination:'日本',theme:'winter',translate:{app:'google-translate',from:'auto',to:'zh-CN'},sourceMd:'',importedAt:'',updatedAt:'',flightCountdown:{origin:'SG',destination:'JP',departureTz:'Asia/Singapore',returnTz:'Asia/Tokyo',departureAt:Date.now()+86400000,returnAt:Date.now()+864000000}});tx.objectStore('days').put({id:'off-day',tripId:'offline-qa',index:1,date:'2027-01-10',tz:'Asia/Tokyo',city:'东京'});tx.oncomplete=()=>{db.close();resolve()};tx.onerror=reject;};req.onerror=reject;});}''')
 page.goto('http://127.0.0.1:4191/trip/offline-qa/story');page.reload();page.wait_for_function('navigator.serviceWorker.controller !== null')
 ctx.set_offline(True);page.reload();expect(page.locator('[data-flight-phase]')).to_have_attribute('data-flight-phase','before')
 assert page.locator('section[aria-label="航班倒计时"] img').evaluate_all('(xs)=>xs.every(x=>x.complete&&x.naturalWidth>0)')
 page.get_by_role('button',name='修改目的地国家').click();page.get_by_role('button',name='印尼 Indonesia').click();expect(page.get_by_role('button',name='修改目的地国家')).to_contain_text('Indonesia');page.reload();expect(page.get_by_role('button',name='修改目的地国家')).to_contain_text('Indonesia')
 assert page.locator('section[aria-label="航班倒计时"] img').evaluate_all('(xs)=>xs.every(x=>x.complete&&x.naturalWidth>0)')
 json.dump({'offline_reload':True,'offline_country_change_and_save':True,'unvisited_country_photos_precached':True},open('outputs/flight-offline-checks.json','w'),indent=2)
 b.close()
