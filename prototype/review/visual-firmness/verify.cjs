// Integration checks for the appearance switch, independent of workout logic.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const output = resolve(__dirname, '../../../output/playwright/visual-firmness');
const checks = [];
const check = (name, condition) => { assert(condition, name); checks.push(name); };

(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:4187/?now=08:00&probe=keep#review');
    await page.getByRole('heading', { name: 'Сегодня', exact: true, level: 1 }).waitFor();
    const rootMode = () => page.locator('html').getAttribute('data-visual');
    const firm = page.getByRole('button', { name: 'Строгий', exact: true });
    const current = page.getByRole('button', { name: 'Текущий', exact: true });
    check('No parameter means current appearance', await rootMode() === null);
    await firm.press('Enter');
    let url = new URL(page.url());
    check('Keyboard switch applies firm and preserves time, unrelated query and hash',
      await rootMode() === 'firm' && url.searchParams.get('visual') === 'firm' &&
      url.searchParams.get('now') === '08:00' && url.searchParams.get('probe') === 'keep' && url.hash === '#review');
    check('Switch exposes pressed state', await firm.getAttribute('aria-pressed') === 'true' && await current.getAttribute('aria-pressed') === 'false');
    await page.locator('#rail [data-id="t-clients"]').click();
    await page.locator('[data-act="client.open"]').first().click();
    check('Client-card navigation retains firm query', await rootMode() === 'firm' && page.url().includes('visual=firm'));
    await page.getByRole('group', { name: 'Роль', exact: true }).getByRole('button', { name: 'Клиент', exact: true }).click();
    await page.getByRole('group', { name: 'Роль', exact: true }).getByRole('button', { name: 'Тренер', exact: true }).click();
    await page.getByRole('button', { name: 'Пустой день', exact: true }).click();
    await page.getByRole('button', { name: 'Обычный день', exact: true }).click();
    check('Role and scenario rerenders keep firm switch state', await firm.getAttribute('aria-pressed') === 'true');
    await page.getByRole('button', { name: 'Широкий', exact: true }).click();
    await page.locator('.wide').waitFor();
    await page.evaluate(() => document.fonts.ready);
    mkdirSync(output, { recursive: true });
    await page.screenshot({ path: join(output, 'desktop-firm.png'), animations: 'disabled' });
    await page.reload();
    await page.getByRole('heading', { name: 'Сегодня', exact: true, level: 1 }).waitFor();
    check('Reload retains firm appearance', await rootMode() === 'firm');
    await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
    await page.locator('[data-act="setlog.quick"]').first().click();
    const journal = await page.locator('.session-journal').innerText();
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    await current.press('Enter');
    check('Switch back preserves in-progress journal and all demo storage',
      await page.locator('.session-journal').innerText() === journal &&
      await page.evaluate(() => JSON.stringify({ ...localStorage })) === stored);
    check('Current switch removes only visual parameter', await rootMode() === null && !new URL(page.url()).searchParams.has('visual') && new URL(page.url()).searchParams.get('now') === '08:00');
    await page.goto('http://127.0.0.1:4187/?now=20:30&visual=unknown');
    await page.locator('#screen .screen').waitFor();
    check('Unknown appearance safely uses current', await rootMode() === null);
    await page.goto('http://127.0.0.1:4187/?now=20:30&visual=firm');
    await page.locator('#screen .screen').waitFor();
    check('Direct firm URL retains evening time', await rootMode() === 'firm' && await page.locator('#screen').innerText().then(t => t.includes('20:30')));
    check('No browser runtime errors', errors.length === 0);
    await context.close();

    const captures = JSON.parse(readFileSync(join(output, 'firm/capture.json'))).captures;
    const currentCaptures = JSON.parse(readFileSync(join(output, 'current/capture.json'))).captures;
    for (const c of captures) {
      const before = currentCaptures.find(b => b.width === c.width && b.name === c.name);
      check(`${c.width}/${c.name}: content unchanged`, c.text === before.text);
      for (let i = 0; i < c.pills.length; i++) {
        check(`${c.width}/${c.name}/${c.pills[i].text}: no fill, visible dot, same width`,
          c.pills[i].background === 'rgba(0, 0, 0, 0)' && c.pills[i].dot !== 'rgba(0, 0, 0, 0)' &&
          c.pills[i].width === before.pills[i].width);
      }
    }
    for (const width of [320, 375]) {
      const byName = name => captures.find(c => c.name === name && c.width === width);
      check(`${width}: confirmed and journal-in-progress labels remain`,
        byName('workout-dock').pills.some(p => p.text === 'Подтверждено') && byName('workout-dock').pills.some(p => p.text === 'Журнал в работе'));
      check(`${width}: due amount and awaiting-answer label remain`, /К ОПЛАТЕ/.test(byName('client-card').text) && byName('client-card').pills.some(p => /Ждёт/.test(p.text)));
      check(`${width}: non-participating member remains explicit`, byName('group-journal').text.includes('Не участвует'));
    }
    writeFileSync(join(output, 'interaction-verification.json'), JSON.stringify({ browser: browser.version(), checks }, null, 2) + '\n');
    console.log(`${checks.length} appearance integration checks passed`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
