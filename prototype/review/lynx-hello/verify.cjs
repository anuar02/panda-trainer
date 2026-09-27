// Run from the repository root: node prototype/review/lynx-hello/verify.cjs
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

(async () => {
  const browser = await chromium.launch({headless:true});
  const output = path.resolve(__dirname, '../../../output/lynx-hello');
  fs.mkdirSync(output, {recursive:true});
  const url = pathToFileURL(path.join(__dirname, 'index.html')).href;
  const errors = [];
  const page = await browser.newPage({viewport:{width:1280,height:1000}});
  page.on('pageerror', e => errors.push(e.message));
  const running = () => page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length);
  try {
    await page.goto(url);
    await page.waitForFunction(() => document.getAnimations().length === 12);
    await page.waitForFunction(() => document.getAnimations().every(a => a.playState === 'finished'));
    assert.equal(await running(), 0, 'One finite cycle');
    assert.equal(await page.locator('#seek').inputValue(), '2600');
    const stillLayout = await page.locator('.phone h3').boundingBox();
    await page.locator('#play').click();
    await page.waitForFunction(() => document.getAnimations().some(a => a.playState === 'running'));
    assert.deepEqual(await page.locator('.phone h3').boundingBox(), stillLayout, 'No text layout movement');
    await page.locator('#pause').click();
    assert.equal(await running(), 0, 'Pause stops all parts');
    await page.locator('#pause').click();
    await page.waitForFunction(() => document.getAnimations().some(a => a.playState === 'running'));
    await page.keyboard.press('Tab');
    assert.equal(await running(), 0, 'Keyboard stops movement');
    await page.locator('#play').focus();
    await page.keyboard.press('Enter');
    assert.equal(await running(), 0, 'Keyboard replay selects still frame');
    assert.equal(await page.locator('#seek').inputValue(), '880');
    await page.locator('#slow').click();
    await page.waitForFunction(() => document.getAnimations().every(a => a.playbackRate === .5 && a.playState === 'running'));
    await page.locator('#pause').click();
    for (const ms of [0,260,700,880,1300,1900,2300,2600]) {
      await page.locator('#seek').fill(String(ms));
      await page.locator('#seek').dispatchEvent('input');
      assert.equal(await running(), 0, 'Scrubbing stays paused');
      await page.locator('.stage').first().screenshot({path:path.join(output, `frame-${ms}.png`)});
    }
    for (const width of [320,375,390,430,1280]) {
      await page.setViewportSize({width,height:width===1280?1000:800});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `No overflow at ${width}`);
      await page.screenshot({path:path.join(output,`review-${width}.png`),fullPage:true});
    }
    await page.locator('#play').click();
    await page.waitForFunction(() => document.getAnimations().some(a => a.playState === 'running'));
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running' && a.currentTime === 0));
    await page.locator('#play').click();
    assert.equal(await running(), 0, 'Reduced motion prevents replay');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Уменьшение'));
    assert.equal(await running(), 0, 'Reduced motion respected at load');
    assert.deepEqual(errors, []);
    console.log('PASS: finite cycle, replay, pause/resume, slow playback, keyboard, scrub, stable text, reduced motion at load/change, 5 viewport widths, no JS errors.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
