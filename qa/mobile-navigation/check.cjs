// Local browser regression. PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE may point to an external QA runtime.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'); const assert=require('assert/strict');
const title='南宁城市漫步与博物馆文化体验完整长标题测试不应该出现省略号';
const note='上午先逛博物馆，再走到附近的小巷吃本地早餐。这段备注需要完整换行展示，不能隐藏最后一句：记得带上雨伞。';
const md=`# 南宁，中国\n- 日期: 26-11-2026 ~ 29-11-2026\n- 出发地时区: Asia/Singapore\n## Day 1 | 26-11-2026 | 南宁 | Asia/Shanghai\n### [spot] 09:00 ${title}\n- 备注: ${note}\n### [meal] 12:00 午餐\n- 地点: 本地餐厅\n## Day 2 | 27-11-2026 | 南宁 | Asia/Shanghai\n### [spot] 10:00 青秀山\n## Day 3 | 28-11-2026 | 南宁 | Asia/Shanghai\n### [spot] 10:00 民族博物馆\n## Day 4 | 29-11-2026 | 南宁 | Asia/Shanghai\n### [spot] 10:00 三街两巷\n`;
const output='docs/shots/mobile-navigation';fs.mkdirSync(output,{recursive:true});
const baseUrl=process.env.BASE_URL || 'http://127.0.0.1:4173';
const server=process.env.BASE_URL ? null : require('child_process').spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4173'],{stdio:'ignore'});
process.on('exit',()=>server?.kill());
(async()=>{
 for(let i=0;i<100;i++){try{await fetch(baseUrl);break}catch{await new Promise(r=>setTimeout(r,100))}}
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process']});
 const results=[];
 for(const width of [390,768,769,1280]){
  // A separate browser per context is unnecessary for this single-process QA build.
  const context=await browser.newContext({viewport:{width,height:900},locale:'zh-CN',timezoneId:'Asia/Singapore',hasTouch:true});
  const page=await context.newPage(); const touch=await context.newCDPSession(page); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-21T00:00:00Z'));
  await page.addInitScript(()=>{window.__vibrations=[];navigator.vibrate=ms=>{window.__vibrations.push(ms);return true}});
  await page.goto(baseUrl+'/import/paste');await page.locator('textarea').fill(md);
  await page.getByRole('button',{name:'解析并预览',exact:true}).click();await page.getByRole('button',{name:'确认导入',exact:true}).click();
  await page.waitForURL(/\/itinerary\//);await page.getByText(title,{exact:true}).waitFor();
  const row=page.locator('[data-hold-card]').filter({hasText:title});
  const mobile=width<=768;console.log(`Checking ${width}px`);
  assert.equal(await page.getByRole('navigation',{name:'手机版主导航'}).count(),mobile?1:0);
  assert.equal(await row.getByRole('checkbox').isVisible(),!mobile);
  assert.equal(await row.getByRole('button',{name:'导航',exact:true}).innerText(),mobile?'':'导航');
  assert.equal(await page.getByLabel(/当前旅程：/).isVisible(),width>768 && width<1024);
  if(mobile){
   const rect=await row.boundingBox();
   assert(rect.height>100);assert.equal(await row.locator('p').first().evaluate(e=>getComputedStyle(e).webkitLineClamp),'none');
   const hold=async(mode)=>{
    await row.scrollIntoViewIfNeeded();const text=await row.locator('p').first().boundingBox();const x=text.x+15,y=text.y+15;
    if(mode==='complete')await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});else {await page.mouse.move(x,y);await page.mouse.down();}await page.waitForTimeout(1000);
    assert(await row.locator('[class*=holdProgress]').evaluate(e=>{const progress=new DOMMatrix(getComputedStyle(e).transform).a;return progress>0 && progress<1}));
    if(mode==='move')await page.mouse.move(x+12,y);
    if(mode==='scroll')await page.evaluate(()=>window.dispatchEvent(new Event('scroll')));
    if(mode==='cancel')await row.dispatchEvent('touchcancel');
    await page.waitForTimeout(1200);if(mode==='complete')await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();await page.waitForTimeout(550);
   };
   for(const mode of ['move','scroll','cancel']){await hold(mode);assert.equal(await row.getAttribute('data-completed'),'false');assert(page.url().includes('/itinerary/'));}
   await hold('complete');assert.deepEqual(await page.evaluate(()=>window.__vibrations),[30]);assert.equal(await row.getAttribute('data-completed'),'true');await page.screenshot({path:`${output}/${width}-completed.png`});assert(page.url().includes('/itinerary/'));
   await page.reload();await page.getByText(title,{exact:true}).waitFor();assert.equal(await row.getAttribute('data-completed'),'true');
   await hold('complete');assert.equal(await row.getAttribute('data-completed'),'false');
   // The arrow and navigation icon cannot start the hold timer.
   for(const el of [row.locator('[data-no-hold]'),row.getByRole('button',{name:'导航',exact:true})]){
     await el.dispatchEvent('pointerdown',{pointerId:1,isPrimary:true,button:0,clientX:10,clientY:10});await page.waitForTimeout(2100);
     assert.equal(await row.getAttribute('data-completed'),'false');await el.dispatchEvent('pointercancel');
   }
   const nav=page.getByRole('navigation',{name:'手机版主导航'});
   for(const label of ['导入','筹备','概览','设置']){
    await nav.getByRole('button',{name:label,exact:true}).click();assert.equal(await nav.getByRole('group').getByRole('button').count(),2);
   }
   await nav.getByRole('button',{name:'设置',exact:true}).click();assert.equal(await nav.getByRole('group').count(),0);
   await nav.getByRole('button',{name:'导入',exact:true}).click();await page.locator('[data-mobile-nav-dismiss]').click({position:{x:10,y:10}});assert.equal(await nav.getByRole('group').count(),0);
   await nav.getByRole('button',{name:'筹备',exact:true}).click();await nav.getByRole('button',{name:'行李·准备'}).click();assert(await page.getByRole('dialog').isVisible());assert(await page.getByRole('button',{name:'穿搭与行李',exact:true}).isVisible());await page.keyboard.press('Escape');
   await nav.getByRole('button',{name:'概览',exact:true}).click();await page.waitForTimeout(350);await page.screenshot({path:`${output}/${width}-menu.png`});
   await nav.getByRole('button',{name:'旅游概览',exact:true}).click();await page.getByRole('region',{name:'旅程倒计时'}).waitFor({state:'visible'});assert.equal(await nav.getByRole('button',{name:'概览',exact:true}).getAttribute('aria-current'),'page');
   await nav.getByRole('button',{name:'日程',exact:true}).click();assert(page.url().includes('/itinerary/'));assert.equal(await nav.getByRole('group').count(),0);
   await page.getByRole('tab',{name:/27/}).click();assert(await page.getByText('青秀山',{exact:true}).isVisible());await page.getByRole('tab',{name:/26/}).click();
   await page.evaluate(()=>{document.documentElement.style.setProperty('--safe-bottom','34px')});assert.equal(await nav.evaluate(e=>getComputedStyle(e).paddingBottom),'34px');
   await page.evaluate(()=>document.documentElement.style.removeProperty('--safe-bottom'));
  }else{
   await row.scrollIntoViewIfNeeded();const box=await row.boundingBox();await page.mouse.move(box.x+90,box.y+20);await page.mouse.down();await page.waitForTimeout(2200);assert.equal(await row.getAttribute('data-completed'),'false');await page.mouse.move(1,1);await page.mouse.up();
   await row.getByRole('checkbox').click();await page.locator('[data-hold-card][data-completed=true]').filter({hasText:title}).waitFor();assert.equal(await row.getAttribute('data-completed'),'true');await row.getByRole('checkbox').click();await page.locator('[data-hold-card][data-completed=false]').filter({hasText:title}).waitFor();
  }
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${output}/${width}-itinerary.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  results.push({width,passed:true});
  // Keep contexts until browser.close: serverless single-process Chromium cannot reopen after closing its last context.
 }
 console.log(JSON.stringify(results));fs.writeFileSync(`${output}/checks.json`,JSON.stringify(results,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
