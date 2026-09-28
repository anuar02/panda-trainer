const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const out = path.join(__dirname, 'screens');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1160 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/design-exploration/home-styles-2026-09-27/');
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode())); });
  await page.screenshot({ path: path.join(out, 'comparison.png'), fullPage: true });
  for (const name of ['companion', 'sport', 'planner']) await page.locator(`[data-direction="${name}"] .phone`).screenshot({ path: path.join(out, name + '.png') });
  await page.locator('[data-direction="companion"] [data-action="program"]').first().click();
  const program = await page.locator('#detail-body').innerText();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  const results = [];
  for (const width of [320, 390, 760, 900]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ['companion', 'sport', 'planner']) {
      if (width <= 1040) await page.locator(`[data-select="${name}"]`).click();
      const check = await page.locator(`[data-direction="${name}"] .phone`).evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth, bodyOverflow: document.documentElement.scrollWidth > innerWidth, brokenImages: [...el.querySelectorAll('img')].some(i => !i.naturalWidth) }));
      results.push({ viewport: width, name, ...check });
    }
  }
  await page.setViewportSize({ width: 390, height: 950 });
  await page.locator('[data-select="companion"]').click();
  await page.screenshot({ path: path.join(out, 'mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Движение', exact: true }).click();
  const motionEnabled = await page.locator('#motion').getAttribute('aria-pressed');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedMotion = await page.locator('.panda').first().evaluate(el => getComputedStyle(el).animationName);
  const report = { errors, program, motionEnabled, reducedMotion, results };
  fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})();
