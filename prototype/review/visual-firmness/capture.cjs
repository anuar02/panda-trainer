// Reproducible visual evidence via real UI actions; never mutates Store or fixtures.
// Start the public prototype server on 4187, then: node capture.cjs baseline|tokenized|current|firm
const { chromium } = require('playwright');
const { mkdirSync, readFileSync, writeFileSync, readdirSync } = require('node:fs');
const { resolve, relative, join } = require('node:path');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');

const ROOT = resolve(__dirname, '../../..');
const phase = process.argv[2] || 'current';
assert(['baseline', 'tokenized', 'current', 'firm'].includes(phase));
const output = join(ROOT, 'output/playwright/visual-firmness', phase);
const origin = 'http://127.0.0.1:4187';
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const sourceHashes = {};
function sources(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path);
    else sourceHashes[relative(ROOT, path)] = sha(path);
  }
}
sources(join(ROOT, 'prototype/js'));
sources(join(ROOT, 'prototype/css'));
sourceHashes['prototype/index.html'] = sha(join(ROOT, 'prototype/index.html'));
sourceHashes[relative(ROOT, __filename)] = sha(__filename);
const report = { phase, captured_at: new Date().toISOString(), browser: '', viewport_height: 844,
  source_sha256: sourceHashes, captures: [], errors: [] };

(async () => {
  const browser = await chromium.launch();
  report.browser = browser.version();
  try {
    for (const width of [320, 375]) {
      const newPage = async (now = '08:00') => {
        const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1,
          isMobile: true, hasTouch: true, locale: 'ru-RU', timezoneId: 'Asia/Almaty', reducedMotion: 'reduce' });
        const page = await ctx.newPage();
        page.on('pageerror', e => report.errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
        await page.goto(`${origin}/?now=${now}${phase === 'firm' ? '&visual=firm' : ''}`);
        await page.getByRole('heading', { name: 'Сегодня', exact: true, level: 1 }).waitFor();
        await page.evaluate(() => document.fonts.ready);
        return page;
      };
      const capture = async (page, name) => {
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
        });
        const evidence = await page.evaluate(() => ({
          no_overflow: document.documentElement.scrollWidth <= innerWidth,
          fonts: Array.from(document.fonts).map(f => ({ family: f.family, status: f.status })),
          visual: document.documentElement.dataset.visual || 'current',
          text: document.querySelector('#screen').innerText,
          pills: Array.from(document.querySelectorAll('.pill')).map(el => ({
            text: el.textContent.trim(), background: getComputedStyle(el).backgroundColor,
            color: getComputedStyle(el).color, width: el.getBoundingClientRect().width,
            dot: el.querySelector('.pill__dot') ? getComputedStyle(el.querySelector('.pill__dot')).backgroundColor : getComputedStyle(el, '::before').backgroundColor,
          })),
          canvas: getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim(),
        }));
        assert(evidence.no_overflow, `${phase}/${width}/${name} horizontal overflow`);
        for (const family of ['Inter', 'Montserrat']) assert(evidence.fonts.some(f => f.family === family && f.status === 'loaded'), family);
        if (phase === 'firm') assert.equal(evidence.visual, 'firm');
        const path = join(output, String(width), name + '.png');
        mkdirSync(resolve(path, '..'), { recursive: true });
        await page.screenshot({ path, animations: 'disabled' });
        report.captures.push({ name, width, source: relative(ROOT, path), sha256: sha(path), url: page.url(), ...evidence });
        console.log(`${phase}: ${width}/${name}`);
      };

      const p = await newPage();
      await capture(p, 'today');
      await p.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
      for (const [index, kg, reps] of [[0, '20', '12'], [1, '22,5', '10']]) {
        await p.locator(`.session-journal [data-id="setlog"][data-ex="e1"][data-si="${index}"]`).click();
        await p.getByLabel('Вес, кг', { exact: true }).fill(kg);
        await p.getByLabel('Повторы', { exact: true }).fill(reps);
        await p.getByRole('button', { name: 'Записать подход', exact: true }).click();
      }
      assert.match(await p.locator('.log-context').innerText(), /2\/12/);
      await p.locator('.session-journal .screen__body').evaluate(el => { el.scrollTop = 0; });
      await capture(p, 'journal');
      await p.locator('.session-journal [data-id="setlog"][data-ex="e1"][data-si="2"]').click();
      await p.getByRole('dialog').waitFor();
      await capture(p, 'set-sheet');
      await p.getByRole('button', { name: 'Закрыть', exact: true }).click();
      await p.getByRole('button', { name: 'Свернуть тренировку' }).click();
      await p.getByRole('button', { name: /^Вернуться к тренировке:/ }).waitFor();
      await capture(p, 'workout-dock');
      await p.context().close();

      const client = await newPage();
      await client.locator('.tabbar').getByRole('button', { name: 'Клиенты', exact: true }).click();
      await client.locator('[data-act="client.open"]').first().click();
      await capture(client, 'client-card');
      await client.context().close();

      const group = await newPage('20:30');
      await group.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
      await group.locator('.pstrip').waitFor();
      await capture(group, 'group-journal');
      await group.context().close();
    }
    assert.deepEqual(report.errors, []);
    assert.equal(report.captures.length, 12);
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, 'capture.json'), JSON.stringify(report, null, 2) + '\n');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
