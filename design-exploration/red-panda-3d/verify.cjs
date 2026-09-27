const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({headless:true});
 const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
 const errors=[];p.on('pageerror',e=>errors.push(String(e)));
 const responses=[];p.on('response',r=>{if(r.status()>=400)responses.push([r.status(),r.url()]);});
 await p.goto('http://127.0.0.1:8766/design-exploration/red-panda-3d/');
 await p.waitForFunction(()=>window.panda?.ready);
 assert.equal(await p.locator('[data-action]').count(),6);
 await p.getByRole('button',{name:'Приостановить движение'}).click();
 const t=await p.evaluate(()=>panda.mixer.time);
 await p.waitForTimeout(150);
 assert.equal(await p.evaluate(()=>panda.mixer.time),t,'Pause must stop the mixer');
 await p.getByRole('button',{name:'Продолжить движение'}).click();
 await p.waitForFunction(t=>panda.mixer.time>t,t);
 await p.locator('#speed').fill('0.7');
 assert.equal(await p.locator('#speed-value').textContent(),'0.7×');
 const results=[];
 for(const id of ['wave','cheer','jump','walk','run','idle']){
   await p.locator(`[data-action="${id}"]`).click();
   await p.waitForFunction(id=>panda.active===id,id);
   await p.waitForTimeout(350);
   results.push(await p.evaluate(id=>({id,weight:panda.actions.get(id).getEffectiveWeight(),time:panda.actions.get(id).time}),id));
 }
 for(const id of ['wave','cheer','jump']){
   await p.evaluate(id=>panda.select(id),id);
   await p.evaluate(id=>{const a=panda.actions.get(id);a.time=a.getClip().duration-.01;panda.mixer.update(.1);},id);
   await p.waitForFunction(()=>panda.active==='idle');
 }
 await p.getByRole('button',{name:'Вращать',exact:true}).click();
 assert.equal(await p.evaluate(()=>panda.controls.autoRotate),true);
 await p.getByRole('button',{name:'Вращать',exact:true}).click();
 await p.getByRole('button',{name:'Вернуть вид спереди'}).click();
 await p.evaluate(()=>{panda.setPause(true);panda.controls.target.set(0,1.03,0);panda.camera.position.set(3,1.27,-3);panda.controls.update();});
 await p.screenshot({path:path.join(__dirname,'evidence/final-back.png')});
 await p.evaluate(()=>{panda.camera.position.set(4.85,1.27,0);panda.controls.update();});
 await p.screenshot({path:path.join(__dirname,'evidence/final-side.png')});
 await p.emulateMedia({reducedMotion:'reduce'});await p.reload();await p.waitForFunction(()=>panda.ready);
 assert.equal(await p.locator('#pause').getAttribute('aria-pressed'),'true');
 const reducedTime=await p.evaluate(()=>panda.mixer.time);await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>panda.mixer.time),reducedTime);
 await p.setViewportSize({width:320,height:568});
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await p.screenshot({path:path.join(__dirname,'evidence/final-320.png'),fullPage:true});
 const report={passed:true,errors,responses,pause:true,play:true,speed:true,transitions:results,oneShotReturnsToIdle:true,rotation:true,reducedMotion:true,noHorizontalOverflow320:true,rigCorrection:await p.evaluate(()=>panda.rigCorrection)};
 fs.writeFileSync(path.join(__dirname,'evidence/verification.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
 await b.close();assert.equal(errors.length,0);assert.equal(responses.length,0);
})().catch(e=>{console.error(e);process.exit(1)});
