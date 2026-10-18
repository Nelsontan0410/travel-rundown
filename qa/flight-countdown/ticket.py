import os,json,tempfile,shutil,re
from pathlib import Path
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('FLIGHT_QA_URL','http://127.0.0.1:4190');prod=os.environ.get('FLIGHT_QA_PRODUCTION')=='1'
out=Path('outputs');out.mkdir(exist_ok=True);result={}
with sync_playwright() as pw:
 for name in os.environ.get('FLIGHT_QA_BROWSERS','chromium').split(','):
  profile=None
  if name=='webkit':
   profile=tempfile.mkdtemp(prefix='ticket-webkit-');ctx=pw.webkit.launch_persistent_context(profile,viewport={'width':1280,'height':900},timezone_id='America/Los_Angeles');browser=None
  else:browser=getattr(pw,name).launch();ctx=browser.new_context(viewport={'width':1280,'height':900},timezone_id='America/Los_Angeles')
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base)
  if prod:
   page.evaluate("async()=>await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Service worker not ready')),20000))])");page.reload();page.wait_for_function('navigator.serviceWorker.controller!==null')
  page.evaluate('''async()=>{await new Promise((resolve,reject)=>{const r=indexedDB.open('travel-rundown');r.onsuccess=()=>{const d=r.result,t=d.transaction(['trips','days'],'readwrite');t.objectStore('trips').put({id:'ticket-qa',title:'东京 · 富士山 · 北海道',startDate:'2027-01-10',endDate:'2027-01-19',homeTz:'Asia/Singapore',destination:'日本',theme:'winter',translate:{app:'google-translate',from:'auto',to:'zh-CN'},sourceMd:'',importedAt:'',updatedAt:'',flightCountdown:{origin:'SG',destination:'JP',departureTz:'Asia/Singapore',returnTz:'Asia/Tokyo',departureAt:1799530000000,returnAt:1800350000000}});t.objectStore('days').put({id:'ticket-day',tripId:'ticket-qa',index:1,date:'2027-01-10',tz:'Asia/Tokyo',city:'东京'});t.oncomplete=()=>{d.close();resolve()};t.onerror=reject};r.onerror=reject})}''')
  page.goto(base+'/itinerary/ticket-qa');card=page.locator('section[aria-label="航班倒计时"]');expect(card).to_be_visible()
  def saved():return page.evaluate('''async()=>await new Promise((resolve,reject)=>{const r=indexedDB.open('travel-rundown');r.onsuccess=()=>{const d=r.result,t=d.transaction('trips'),q=t.objectStore('trips').get('ticket-qa');q.onsuccess=()=>{resolve(q.result.flightCountdown);d.close()};q.onerror=reject};r.onerror=reject})''')
  before=saved();page.get_by_role('button',name='设置航班时间',exact=True).first.click();page.get_by_text('从 PDF 机票填写时间',exact=True).click()
  upload=page.get_by_label('选择 PDF 机票（可选去程和回程两份）')
  upload.set_input_files('qa/flight-countdown/tickets/round-trip.pdf')
  expect(page.get_by_label('选择去程起飞航段')).to_be_visible(timeout=15000)
  opts=page.get_by_label('选择去程起飞航段').locator('option');assert opts.count()==3,opts.all_text_contents()
  assert '14:20' not in '\n'.join(opts.all_text_contents()) and '05:30' not in '\n'.join(opts.all_text_contents())
  assert saved()==before
  choices=opts.evaluate_all('(xs)=>xs.map(x=>x.value)');page.get_by_label('选择去程起飞航段').select_option(choices[1]);page.get_by_label('选择回程起飞航段').select_option(choices[1]);expect(page.get_by_role('alert')).to_contain_text('同一个航段')
  page.get_by_label('选择回程起飞航段').select_option(choices[2]);expect(page.get_by_label('去程起飞（当地时间）')).to_have_value('2027-01-10T06:10');expect(page.get_by_label('回程起飞（当地时间）')).to_have_value('2027-01-19T20:30');assert saved()==before
  page.get_by_role('combobox',name=re.compile('^出发国家')).select_option('JP');expect(page.get_by_label('去程起飞（当地时间）')).to_have_value('2027-01-10T06:10');page.get_by_role('combobox',name=re.compile('^出发国家')).select_option('SG')
  page.get_by_role('combobox',name=re.compile('^目的地国家')).select_option('SG');expect(page.get_by_label('回程起飞（当地时间）')).to_have_value('2027-01-19T20:30');page.get_by_role('combobox',name=re.compile('^目的地国家')).select_option('JP')
  page.get_by_role('button',name='保存航班时间').click();expect(page.get_by_role('dialog')).to_have_count(0)
  after=saved();assert after['departureAt']==int(datetime(2027,1,9,22,10,tzinfo=timezone.utc).timestamp()*1000),after
  assert after['returnAt']==int(datetime(2027,1,19,11,30,tzinfo=timezone.utc).timestamp()*1000),after
  page.reload();expect(card.locator('h3')).to_contain_text('2027-01-10 06:10')
  page.get_by_role('button',name='设置航班时间',exact=True).first.click();page.get_by_text('从 PDF 机票填写时间',exact=True).click();upload.set_input_files('qa/flight-countdown/tickets/columns.pdf')
  expect(page.get_by_label('选择去程起飞航段')).to_be_visible(timeout=15000);opts=page.get_by_label('选择去程起飞航段').locator('option');assert opts.count()==3,opts.all_text_contents();assert '14:20' not in '\n'.join(opts.all_text_contents())
  for f,text in [('no-text.pdf','没有可读取的文字'),('protected.pdf','有密码')]:
   upload.set_input_files('qa/flight-countdown/tickets/'+f);expect(page.get_by_role('alert')).to_contain_text(text,timeout=15000);assert saved()==after
  upload.set_input_files('qa/flight-countdown/tickets/ambiguous.pdf');expect(page.get_by_label('选择去程起飞航段').locator('option')).to_have_count(5,timeout=15000)
  assert '日/月顺序待核对' in page.get_by_label('选择去程起飞航段').inner_text();assert saved()==after
  for width in [1280,768,390]:
   page.set_viewport_size({'width':width,'height':900});page.get_by_text('从 PDF 机票填写时间',exact=True).scroll_into_view_if_needed();page.wait_for_timeout(200);page.screenshot(path=str(out/f'ticket-{name}-{width}.png'));assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.keyboard.press('Escape')
  pdfbytes=list(Path('qa/flight-countdown/tickets/columns.pdf').read_bytes())
  page.evaluate('''async bytes=>{await new Promise((resolve,reject)=>{const r=indexedDB.open('travel-rundown');r.onsuccess=()=>{const d=r.result,t=d.transaction(['docs','blobs'],'readwrite');t.objectStore('blobs').put({key:'doc:ticket-existing',blob:new Blob([new Uint8Array(bytes)],{type:'application/pdf'})});t.objectStore('docs').put({id:'ticket-existing',tripId:'ticket-qa',title:'Existing PDF ticket',kind:'flight',mime:'application/pdf',blobKey:'doc:ticket-existing',itemKeys:[],addedAt:'',updatedAt:''});t.oncomplete=()=>{d.close();resolve()};t.onerror=reject};r.onerror=reject})}''',pdfbytes)
  page.reload();page.get_by_role('button',name='设置航班时间',exact=True).first.click();page.get_by_text('从 PDF 机票填写时间',exact=True).click();page.get_by_label('已保存的 PDF 机票').select_option('ticket-existing');page.get_by_role('button',name='识别已保存机票').click();expect(page.get_by_label('选择去程起飞航段').locator('option')).to_have_count(3,timeout=15000);assert saved()==after
  page.keyboard.press('Escape')
  if prod:
   page.wait_for_function('navigator.serviceWorker.controller!==null');ctx.set_offline(True);page.reload();page.get_by_role('button',name='设置航班时间',exact=True).first.click();page.get_by_text('从 PDF 机票填写时间',exact=True).click();upload.set_input_files('qa/flight-countdown/tickets/columns.pdf');expect(page.get_by_label('选择去程起飞航段').locator('option')).to_have_count(3,timeout=15000);assert saved()==after
  assert not errors,errors
  result[name]={'literal_pdf':True,'two_columns':True,'arrival_boarding_excluded':True,'no_write_before_save':True,'same_segment_blocked':True,'imported_wall_time_preserved_when_changing_country':True,'utc_saved_on_us_device':True,'saved_ticket_readonly':True,'scan_password_feedback':True,'ambiguous_date_review':True,'offline_pdf':prod,'widths':[1280,768,390]};print(name,result[name],flush=True)
  ctx.close()
  if browser:browser.close()
  if profile:shutil.rmtree(profile)
json.dump(result,open(out/'ticket-checks.json','w'),indent=2)
