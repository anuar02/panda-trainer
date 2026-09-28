const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = __dirname;
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4187';
const screens = ['t-today','t-schedule','t-new','t-inbox','t-clients','t-client','t-invite','t-session','t-library','t-template','t-billing','t-profile','c-home','c-program','c-history','c-progress','c-profile','c-first'];
(async()=>{
 const b=await chromium.launch({headless:true});
 const p=await b.newPage({viewport:{width:390,height:844}});
 p.setDefaultTimeout(7000);
 const errors=[], report={screens:[], flows:[], issues:[]};
 p.on('pageerror',e=>errors.push(e.message));
 p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('Failed to load resource'))errors.push(m.text());});
 await p.goto(`${baseURL}/?visual=instrument`);
 await p.evaluate(()=>document.fonts.ready);
 for(const width of [320,390,1440]){
  await p.setViewportSize({width,height:width===1440?1000:844});
  for(const scenario of ['normal','empty','loading','offline']){
   for(const screen of screens){
    await p.evaluate(({screen,scenario})=>{Store.set({role:screen[0]==='t'?'trainer':'client',screen,scenario,sheet:null,wide:false});if(screen==='t-session')Store.logging.open('s1');},{screen,scenario});
    const metrics=await p.evaluate(()=>{
     const target=document.querySelector('#screen');
     const overflow=[...target.querySelectorAll('.screen, .screen__body, .wide, .tabbar')].filter(e=>e.clientWidth&&e.scrollWidth>e.clientWidth+1).map(e=>({class:e.className,width:e.clientWidth,scroll:e.scrollWidth}));
     const small=[...target.querySelectorAll('.icon-button,.topbar__back,.topbar__close,.topbar__btn,.chip[role="button"],.client-tabs [role="tab"],.buddy__req,.lib-favorite,.lib-groups button,.lib-filters > button,.lib-equipment select,.theme-choice button')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.width<43.9||r.height<43.9);}).map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim(),w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}));
     return {overflow,small,theme:document.documentElement.dataset.theme,text:target.innerText.includes('Ошибка экрана')};
    });
    report.screens.push({width,scenario,screen,...metrics});
    if(metrics.overflow.length||metrics.small.length||metrics.text)report.issues.push({width,scenario,screen,...metrics});
    if(width===390&&scenario==='normal')await p.locator('#device').screenshot({path:path.join(out,screen+'.png')});
   }
  }
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 console.log('Matrix complete', report.issues.length, 'issues');
 // Real pointer actions through the persistent workout flow.
 await p.setViewportSize({width:390,height:844});
 await p.evaluate(()=>{Store.set({role:'trainer',screen:'t-today',scenario:'normal'});Store.logging.open('s1');});
 const ex=await p.locator('.wfocus__name').innerText();
 await p.locator('.wcomposer__save').click();
 await p.waitForTimeout(80);
 assert.equal(await p.locator('.rest-ring').count(),1);
 const ring=await p.locator('[data-rest-ring]').getAttribute('style');
 await p.waitForTimeout(1100);
 assert.notEqual(await p.locator('[data-rest-ring]').getAttribute('style'),ring);
 assert.equal(await p.evaluate(()=>Store.logging.progress('c5').done),1);
 await p.locator('#device').screenshot({path:path.join(out,'rest.png')});
 await p.getByRole('button',{name:'Свернуть тренировку'}).click();
 await p.locator('.workout-dock .segments').waitFor();
 assert.equal(await p.locator('.workout-dock .segments').count(),1);
 await p.locator('.workout-dock__button').click();
 assert.equal(await p.locator('.wfocus__name').innerText(),ex);
 await p.reload();
 await p.evaluate(()=>Store.logging.open('s1'));
 assert.equal(await p.evaluate(()=>Store.logging.progress('c5').done),1);
 report.flows.push('save, ticking rest ring, minimize, resume, reload persistence');
 await p.evaluate(()=>Store.set({screen:'t-today'}));
 assert.match(await p.locator('.past-sessions summary').innerText(),/журнал не закрыт/);
 await p.locator('.past-sessions summary').click();
 await p.locator('[data-session="s1"] .today-entry__cta').click();
 await p.locator('.session-journal').waitFor();
 assert.equal(await p.evaluate(()=>Store.get().screen),'t-session');
 report.flows.push('past unfinished journal remains reachable');
 await p.evaluate(()=>Store.set({screen:'t-profile'}));
 await p.locator('button[data-theme-choice="light"]').click();
 assert.equal(await p.locator('html').getAttribute('data-theme'),'light');
 await p.evaluate(()=>Store.logging.open('s1'));
 assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');
 await p.evaluate(()=>Store.set({screen:'t-profile'}));
 await p.locator('button[data-theme-choice="auto"]').click();
 await p.getByRole('switch',{name:'Спокойный интерфейс'}).click();
 assert.equal(await p.locator('html').getAttribute('data-calm'),'true');
 await p.getByRole('switch',{name:'Спокойный интерфейс'}).click();
 report.flows.push('theme choice, always-dark journal, calm switch');
 await p.setViewportSize({width:1440,height:1000});
 await p.evaluate(()=>Store.set({screen:'t-today',wide:true}));
 assert.equal(await p.locator('.workspace-client').count(),1);
 await p.locator('[data-workspace-client]').selectOption('c5');
 assert.equal(await p.evaluate(()=>Store.get().activeClient),'c5');
 await p.locator('#device').screenshot({path:path.join(out,'wide.png')});
 report.flows.push('desktop shared Today/client components, client selection');
 await p.goto(`${baseURL}/?visual=instrument&present`);
 assert.equal(await p.locator('#toolbar').isVisible(),false);
 assert.equal(await p.locator('#rail').isVisible(),false);
 await p.screenshot({path:path.join(out,'presentation.png')});
 report.flows.push('presentation hides demo controls');
 // The original appearances still render with the shared usability corrections.
 await p.setViewportSize({width:320,height:844});
 for (const appearance of ['current','firm']) {
  await p.goto(`${baseURL}/?visual=${appearance}`);
  for (const screen of screens) {
   await p.evaluate(screen=>{Store.set({role:screen[0]==='t'?'trainer':'client',screen,scenario:'normal',sheet:null,wide:false});if(screen==='t-session')Store.logging.open('s1');},screen);
   assert.equal(await p.locator('#screen').innerText().then(t=>t.includes('Ошибка экрана')),false,`${appearance}/${screen}`);
   assert.equal(await p.evaluate(()=>[...document.querySelectorAll('.screen,.screen__body')].every(e=>e.scrollWidth<=e.clientWidth+1)),true,`${appearance}/${screen} overflow`);
  }
 }
 report.flows.push('36 original-appearance route checks at 320px');
 await p.goto(`${baseURL}/?visual=instrument`);
 await p.evaluate(()=>Store.set({screen:'t-new'}));
 await p.locator('[data-act="ns.next"]').click();
 assert.equal(await p.evaluate(()=>Store.get().newSession.step),0);
 await p.locator('[data-act="ns.toggle"][data-id="c1"]').click();
 await p.locator('[data-act="ns.next"]').click();
 assert.equal(await p.evaluate(()=>Store.get().newSession.step),1);
 await p.evaluate(()=>Store.set({screen:'t-billing'}));
 await p.locator('.payment-table button').first().click();
 assert.equal(await p.locator('.sheet-layer.is-open').count(),1);
 await p.locator('#device').screenshot({path:path.join(out,'payment-sheet.png')});
 await p.keyboard.press('Escape');
 await p.evaluate(()=>Store.set({screen:'t-inbox'}));
 await p.locator('.transfer-card summary').first().click();
 assert.equal(await p.locator('.transfer-card[open]').count(),1);
 await p.locator('.transfer-card[open]').getByRole('button',{name:'Другое время'}).click();
 assert.equal(await p.locator('.sheet-layer.is-open').count(),1);
 await p.locator('#device').screenshot({path:path.join(out,'transfer-sheet.png')});
 await p.keyboard.press('Escape');
 report.flows.push('booking validation, payment sheet, transfer proposal sheet');
 // 20px text + reduced motion on the narrowest supported viewport.
 await p.setViewportSize({width:320,height:844});
 await p.emulateMedia({reducedMotion:'reduce'});
 await p.evaluate(()=>{document.documentElement.style.fontSize='20px';Store.logging.open('s1');});
 assert.equal(await p.evaluate(()=>{const e=document.querySelector('.screen__body');return e.scrollWidth<=e.clientWidth+1;}),true);
 await p.locator('#device').screenshot({path:path.join(out,'large-text.png')});
 await p.locator('.log-finish').scrollIntoViewIfNeeded();
 await p.locator('#device').screenshot({path:path.join(out,'large-text-footer.png')});
 report.flows.push('320px, 20px text and reduced motion');
 await p.evaluate(()=>document.documentElement.style.removeProperty('font-size'));
 await p.setViewportSize({width:390,height:844});
 await p.emulateMedia({reducedMotion:'no-preference'});
 await p.locator('.log-finish').click();
 await p.locator('[data-act="log.confirmPartial"]').click();
 await p.waitForTimeout(2400);
 assert.equal(await p.evaluate(()=>Store.get().logging.finished),true);
 assert.equal((await p.locator('.session-journal').innerText()).includes('undefined'),false);
 assert.equal(await p.locator('.wbody .excard').count(),1);
 assert.equal(await p.locator('[data-result-count="500"]').innerText(),'500');
 await p.locator('#device').screenshot({path:path.join(out,'results.png')});
 report.flows.push('partial completion, result count-up and recorded training volume');
 report.errors=errors;
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({screens:report.screens.length,flows:report.flows,issues:report.issues,errors},null,2));
 await b.close();
 assert.equal(errors.length,0);
 assert.equal(report.issues.length,0);
})().catch(e=>{console.error(e);process.exit(1);});
