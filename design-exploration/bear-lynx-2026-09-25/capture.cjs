const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname,url='http://127.0.0.1:4188/prototype/?now=08:00';
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
(async()=>{
 const browser=await chromium.launch();
 const report={url,browser:browser.version(),viewport:{width:375,height:844},deviceScaleFactor:1,captured_at:new Date().toISOString(),screens:[],errors:[]};
 const context=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'ru-RU',timezoneId:'Asia/Almaty',reducedMotion:'reduce'});
 const p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));
 async function shot(name,clear=false){
  await p.waitForFunction(()=>!document.querySelector('.toast.is-on'));
  await p.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));await new Promise(requestAnimationFrame)});
  const data=await p.locator('#screen').evaluate(e=>({text:e.innerText,nodes:[...e.querySelectorAll('h1,h2,h3,p,button,.client-package,.client-empty,.client-empty__art,.client-empty > .lead,.empty__art')].map(n=>{const r=n.getBoundingClientRect();return {tag:n.tagName,cls:n.className,text:n.innerText,rect:{x:r.x,y:r.y,width:r.width,height:r.height},background:getComputedStyle(n).backgroundColor}})}));
  const file=`screens/base/${name}.png`;await p.screenshot({path:path.join(root,file),animations:'disabled'});
  report.screens.push({name,file,sha256:sha(path.join(root,file)),...data});
  if(clear){
   const art=p.locator('.client-empty__art, .client-empty > .lead');
   if(await art.count()){
    await art.evaluateAll(a=>a.forEach(n=>n.style.visibility='hidden'));
    const blank=`screens/base/${name}-cleared.png`;await p.screenshot({path:path.join(root,blank),animations:'disabled'});
    report.screens.push({name:name+'-cleared',file:blank,sha256:sha(path.join(root,blank)),source:file,change:'Only empty-state artwork/icon visibility hidden in browser memory; layout retained'});
    await art.evaluateAll(a=>a.forEach(n=>n.style.removeProperty('visibility')));
   }
  }
 }
 try{
  await p.goto(url);await p.getByRole('group',{name:'Роль',exact:true}).getByRole('button',{name:'Клиент',exact:true}).click();
  await shot('home-default');
  await p.setViewportSize({width:1440,height:1000});await p.locator('[data-act="scenario"][data-s="empty"]').click();await p.setViewportSize(report.viewport);
  await shot('home',true);
  await p.locator('.tabbar').getByRole('button',{name:'Программа',exact:true}).click();await shot('empty-program',true);
  fs.writeFileSync(path.join(root,'evidence/capture.json'),JSON.stringify(report,null,2));
  if(report.errors.length)throw Error(report.errors.join('\n'));
  console.log(JSON.stringify(report.screens.map(s=>({name:s.name,art:s.nodes?.filter(n=>n.cls.includes('art')),text:s.text})),null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
