// Pixel comparison against a clean worktree of the base commit.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert/strict'),path=require('path'),{spawn}=require('child_process');
const baseline=process.env.BASELINE_DIR;if(!baseline)throw Error('Set BASELINE_DIR to a clean base worktree');
const source=fs.readFileSync(path.join(__dirname,'check.cjs'),'utf8');
const fixture=source.slice(source.indexOf("const title="),source.indexOf("const output="));
const {md,title}=new Function(fixture+'return {md,title}')();
const servers=[4173,4174].map(port=>spawn(process.execPath,['--input-type=module','-e',`import {createServer} from './node_modules/vite/dist/node/index.js';const server=await createServer({cacheDir:'/tmp/travel-desktop-qa-${port}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await server.listen();`],{cwd:port===4174?baseline:process.cwd(),stdio:'ignore'}));
process.on('exit',()=>servers.forEach(p=>p.kill()));
(async()=>{
 for(const port of [4173,4174])for(let i=0;i<100;i++){try{await fetch(`http://127.0.0.1:${port}`);break}catch{await new Promise(r=>setTimeout(r,100))}}
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process']});
 for(const width of [769,1280]){
  const images=[];
  for(const port of [4174,4173]){
   const context=await browser.newContext({viewport:{width,height:900},locale:'zh-CN',timezoneId:'Asia/Singapore',hasTouch:true});const page=await context.newPage();page.on('pageerror',e=>console.error(port,e.message));console.log(`Capture ${width}px on ${port}`);
   await page.clock.setFixedTime(new Date('2026-10-21T00:00:00Z'));await page.goto(`http://127.0.0.1:${port}/import/paste`);await page.locator('textarea').fill(md);
   await page.getByRole('button',{name:'解析并预览',exact:true}).click();await page.getByRole('button',{name:'确认导入',exact:true}).click();await page.waitForURL(/\/itinerary\//);await page.getByText(title,{exact:true}).waitFor();
   await page.evaluate(()=>document.fonts.ready);await page.mouse.move(0,0);await page.waitForTimeout(300);
   const name=`docs/shots/mobile-navigation/${width}-${port===4174?'baseline':'changed'}.png`;
   images.push(await page.screenshot({path:name,fullPage:true,animations:'disabled'}));
  }
  assert(images[0].equals(images[1]),`${width}px desktop screenshot differs from base`);console.log(`${width}px: pixel-identical to base`);
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
