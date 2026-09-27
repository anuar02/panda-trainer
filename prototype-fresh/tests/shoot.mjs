import { chromium } from 'playwright';
import { mkdir, copyFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const base = process.env.PROTOTYPE_URL || 'http://127.0.0.1:8777/prototype-fresh/';
const task = process.argv[2] || '01-ink';
const journal = "Store.logging.open('s4');";
const voice = `${journal} Voice.open();`;
const recognized = `${voice} Voice.state.items = VoiceParse.parse('Приседания 80 на 8. Заметка: следить за техникой', {active:'c1', participants:[{clientId:'c1', short:'Айгерим'}], exercises:cid=>Store.logging.exercises(cid), values:()=>[], library:Store.logging.library()}); Store.commit();`;
const replaced = `${journal} Store.logging.replaceExercise('c1','e2',{name:'Жим гантелей лёжа'});`;
const added = `${replaced} Store.logging.addExercise('c1',{name:'Сгибания на бицепс с гантелями'});`;
const results = `${added} Store.logging.setValue('c1','e1',0,{kg:80,reps:8}); Store.logging.finish(); Store.logging.confirmPartial();`;
let screens = [
  {path:'trainer-today',role:'trainer',screen:'t-today'},
  {path:'client-home',role:'client',screen:'c-home'},
  {path:'onboarding',role:'client',screen:'c-first'},
  {path:'celebrate',role:'client',screen:'c-home',actions:"Fx.celebrate('jump');"},
  {path:'hold/0-button',role:'trainer',screen:'t-session',actions:journal},
  {path:'hold/1-listening',role:'trainer',screen:'t-session',actions:`${journal} Voice.holdStart();`},
  {path:'hold/2-heard',role:'trainer',screen:'t-session',actions:`${journal} Voice.holdStart(); window.__recognition.onresult({resultIndex:0,results:[Object.assign([{transcript:'Приседания 80 на 8'}],{isFinal:true})]});`},
  {path:'hold/4-done',role:'trainer',screen:'t-session',actions:`${journal} Voice.holdStart(); window.__recognition.onresult({resultIndex:0,results:[Object.assign([{transcript:'Приседания 80 на 8'}],{isFinal:true})]}); Voice.holdEnd();`,wait:200},
  {path:'hold/5-sheet',role:'trainer',screen:'t-session',actions:recognized},
  {path:'voice/dictation',role:'trainer',screen:'t-session',actions:voice},
  {path:'voice/recognized',role:'trainer',screen:'t-session',actions:recognized},
  {path:'voice/journal',role:'trainer',screen:'t-session',actions:`${recognized} Voice.commit();`},
  {path:'flex/1-menu',role:'trainer',screen:'t-session',actions:`${journal} Store.ui.openSheet('exMenu',{cid:'c1',ex:'e2'});`},
  {path:'flex/2-picker',role:'trainer',screen:'t-session',actions:`${journal} Store.ui.openSheet('exPick',{cid:'c1',ex:'e2',mode:'replace'});`},
  {path:'flex/3-replaced',role:'trainer',screen:'t-session',actions:replaced},
  {path:'flex/4-voice',role:'trainer',screen:'t-session',actions:recognized},
  {path:'flex/5-journal-bottom',role:'trainer',screen:'t-session',actions:added,scroll:true},
  {path:'flex/7-results',role:'trainer',screen:'t-session',actions:results},
];
if (task === '02-calm') {
  screens = screens.filter(s => ['trainer-today', 'client-home', 'hold/0-button', 'hold/1-listening', 'onboarding'].includes(s.path)).flatMap(s => [s, {...s, path:`calm/${s.path}`, calm:true}]);
}
let executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) {
  try { await access(chromium.executablePath()); }
  catch { executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'; }
}
const browser = await chromium.launch({executablePath});
try {
  for (const viewport of [{width:390,height:844},{width:1440,height:960}]) {
    for (const spec of screens) {
      const context = await browser.newContext({viewport, locale:'ru-RU', timezoneId:'Asia/Almaty'});
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => {
        window.SpeechRecognition = class {
          constructor() { window.__recognition = this; }
          start() { this.onstart?.(); }
          stop() { this.onend?.(); }
          abort() {}
        };
      });
      await page.goto(`${base}?now=18:45${spec.calm ? "&calm=1" : ""}`);
      await page.evaluate(({role,screen,scenario}) => Store.set({role,screen,scenario:scenario || 'normal'}),spec);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(350);
      if (spec.actions) await page.evaluate(spec.actions);
      await page.waitForTimeout(spec.wait ?? 120);
      if (spec.scroll) await page.locator('.screen__body').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await page.addStyleTag({content:'*,*::before,*::after { animation-play-state:paused !important; caret-color:transparent !important; }'});
      if (await page.locator('html').getAttribute('data-palette') !== 'ink') throw new Error('Expected default ink palette');
      if (errors.length) throw new Error(`${spec.path}: ${errors.join('; ')}`);
      const out = resolve(root,'review',task,`${spec.path}-${viewport.width}.png`);
      await mkdir(dirname(out),{recursive:true});
      await page.screenshot({path:out});
      if (task === '01-ink' && viewport.width === 390) {
        const legacy = resolve(root,'review',`${spec.path}.png`);
        await mkdir(dirname(legacy),{recursive:true});
        await copyFile(out,legacy);
      }
      await context.close();
    }
  }
} finally { await browser.close(); }
console.log(`Screenshots: review/${task}`);
