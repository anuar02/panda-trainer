const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const base = __dirname;
(async () => {
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1200,height:900},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const suffix=process.argv[2]||'current';
  await page.goto('http://127.0.0.1:8766/design-exploration/red-panda-3d/'+(process.argv[3]||''));
  await page.waitForFunction(()=>window.panda?.ready||window.panda?.error,null,{timeout:60000});
  await page.evaluate(()=>panda.setPause(true));
  await page.screenshot({path:path.join(base,`evidence/${suffix}-desktop.png`)});
  const info=await page.evaluate(()=>({ready:panda.ready,error:panda.error,size:panda.sourceSize,bones:panda.bones}));
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(base,`evidence/${suffix}-mobile.png`)});
  const clips=await page.evaluate(()=>panda.config?.animations||[]);
  for(const clip of clips){
    await page.getByRole('button',{name:clip.label,exact:true}).click();
    await page.waitForFunction(id=>panda.active===id,clip.id);
    await page.evaluate(()=>panda.setPause(true));
    const duration=await page.evaluate(id=>panda.actions.get(id).getClip().duration,clip.id);
    for(const fraction of [.2,.5,.8]){
      await page.evaluate(({id,fraction})=>{panda.actions.forEach((a,key)=>{a.stopFading();a.setEffectiveWeight(key===id?1:0);});const a=panda.actions.get(id);a.time=a.getClip().duration*fraction;panda.mixer.update(0);}, {id:clip.id,fraction});
      await page.screenshot({path:path.join(base,`evidence/${suffix}-${clip.id}-${fraction}.png`)});
    }
    clip.duration=duration;
  }
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  const report={...info,clips,errors,overflow};
  fs.writeFileSync(path.join(base,`evidence/${suffix}-report.json`),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  await browser.close();
  if(errors.length||!info.ready||overflow)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1);});
