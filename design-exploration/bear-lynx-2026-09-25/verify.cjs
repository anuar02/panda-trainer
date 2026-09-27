const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});const url='http://127.0.0.1:4188/design-exploration/bear-lynx-2026-09-25/';const report={checks:[],errors:[]};p.on('pageerror',e=>report.errors.push(e.message));p.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`)});
try{
 await p.goto(url);await p.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()))});
 assert.equal(await p.locator('.pose-card').count(),8);assert.equal(await p.locator('.overlay').count(),4);assert.equal(await p.locator('.native img').count(),40);
 assert(await p.locator('.native img').evaluateAll(a=>a.every(i=>i.naturalWidth===i.width&&i.naturalHeight===i.height)));
 assert(await p.locator('.stage').evaluateAll(a=>a.every(s=>{const b=s.getBoundingClientRect(),i=s.querySelector('img').getBoundingClientRect();return i.top>=b.top&&i.bottom<=b.bottom&&i.left>=b.left&&i.right<=b.right})), 'Image overflows its pose frame');
 report.checks.push({pose_cards:8,screen_replacements:4,native_size_pngs:40,images_decoded:await p.locator('img').count()});
 await p.screenshot({path:path.join(__dirname,'evidence/page-desktop.png')});
 await p.locator('#poses .pose').first().screenshot({path:path.join(__dirname,'evidence/pose-comparison.png')});
 await p.locator('#sizes').screenshot({path:path.join(__dirname,'evidence/size-comparison.png')});
 await p.locator('#marks').screenshot({path:path.join(__dirname,'evidence/mark-comparison.png')});
 await p.locator('#toggle').click();assert(await p.locator('.overlay').evaluateAll(a=>a.every(i=>i.getAttribute('src')===i.dataset.base)));
 await p.locator('#toggle').click();assert(await p.locator('.overlay').evaluateAll(a=>a.every(i=>i.getAttribute('src')===i.dataset.overlay)));report.checks.push('All four images switch to originals and back');
 for(const width of [375,320]){
  await p.setViewportSize({width,height:844});await p.goto(url);await p.evaluate(()=>document.fonts.ready);
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Horizontal overflow ${width}`);report.checks.push(`No horizontal overflow at ${width}`);
  if(width===375)await p.screenshot({path:path.join(__dirname,'evidence/page-mobile.png')});
 }
 assert.deepEqual(report.errors,[]);fs.writeFileSync(path.join(__dirname,'evidence/page-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
