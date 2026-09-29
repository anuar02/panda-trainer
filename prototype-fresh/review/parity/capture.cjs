let pw;
try { pw = require('@playwright/test'); } catch (_) { pw = require('playwright'); }
const fs = require('node:fs');
const path = require('node:path');

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4187';
const out = process.env.OUT_DIR || path.join(__dirname, 'reference');
const specOut = process.env.SPEC_DIR || __dirname;
const only = process.env.SCREENS ? process.env.SCREENS.split(',') : null;
const screens = ['t-today', 't-schedule', 't-new', 't-inbox', 't-clients', 't-client', 't-invite', 't-session', 't-library', 't-template', 't-billing', 't-profile', 't-welcome', 'c-home', 'c-program', 'c-history', 'c-progress', 'c-profile', 'c-first']
  .filter(s => !only || only.includes(s));
const scenarios = ['normal', 'empty', 'loading', 'offline'];
const themes = ['auto', 'dark', 'light'];
const props = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'font-variant-numeric', 'text-transform', 'color', 'background-color', 'background-image', 'border-top-width', 'border-top-color', 'border-top-style', 'border-radius', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'gap', 'height', 'min-height', 'box-shadow', 'opacity'];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await pw.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const index = [];
  const specs = {};
  for (const theme of themes) {
    await page.goto(`${baseURL}/?present&theme=${theme}`);
    await page.evaluate(() => document.fonts.ready);
    for (const scenario of scenarios) {
      for (const screen of screens) {
        await page.evaluate(({ screen, scenario }) => {
          Store.set({ role: screen[0] === 't' ? 'trainer' : 'client', screen, scenario, sheet: null, wide: false, stack: [] });
          if (screen === 't-session') Store.logging.open('s1');
        }, { screen, scenario });
        await page.waitForTimeout(250);
        const resolved = await page.evaluate(() => document.documentElement.dataset.theme);
        if (theme !== 'auto' && scenario !== 'normal') continue;
        const file = `${screen}__${scenario}__${theme === 'auto' ? `auto-${resolved}` : theme}.png`;
        const device = await page.$('#device') || page;
        await device.screenshot({ path: path.join(out, file) });
        index.push({ screen, scenario, theme, resolved, file });
        if (scenario !== 'normal') continue;
        const key = resolved;
        specs[key] = specs[key] || { variables: {}, classes: {} };
        const found = await page.evaluate(props => {
          const root = getComputedStyle(document.documentElement);
          const variables = {};
          for (const sheet of document.styleSheets) {
            let rules;
            try { rules = sheet.cssRules; } catch (_) { continue; }
            for (const rule of rules) {
              if (!rule.style) continue;
              for (const name of rule.style) if (name.startsWith('--')) variables[name] = root.getPropertyValue(name).trim();
            }
          }
          const classes = {};
          const scope = document.querySelector('.screen')?.closest('#device') || document.body;
          for (const el of scope.querySelectorAll('[class]')) {
            const rect = el.getBoundingClientRect();
            if (!rect.width || !rect.height) continue;
            for (const cls of el.classList) {
              if (classes[cls]) continue;
              const cs = getComputedStyle(el);
              const entry = { tag: el.tagName.toLowerCase(), width: Math.round(rect.width), measuredHeight: Math.round(rect.height) };
              for (const p of props) {
                const v = cs.getPropertyValue(p);
                if (v && v !== 'none' && v !== 'normal' && v !== '0px' && v !== 'rgba(0, 0, 0, 0)') entry[p] = v;
              }
              classes[cls] = entry;
            }
          }
          return { variables, classes };
        }, props);
        Object.assign(specs[key].variables, found.variables);
        for (const [cls, entry] of Object.entries(found.classes)) {
          if (!specs[key].classes[cls]) specs[key].classes[cls] = { ...entry, firstSeenOn: screen };
        }
      }
    }
  }
  for (const [key, spec] of Object.entries(specs)) {
    fs.writeFileSync(path.join(specOut, `spec-${key}.json`), JSON.stringify(spec, null, 1));
  }
  fs.writeFileSync(path.join(specOut, 'index.json'), JSON.stringify({ baseURL, viewport: '390x844@2x', errors, shots: index }, null, 1));
  await browser.close();
  console.log(`${index.length} screenshots, specs: ${Object.keys(specs).join(', ')}, errors: ${errors.length}`);
})();
