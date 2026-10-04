const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(
  path.dirname(require.resolve('./web-smoke.cjs')),
  '../../dist',
);
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(
    new URL(request.url, 'http://localhost').pathname,
  );
  const file = path.join(
    root,
    pathname === '/'
      ? 'index.html'
      : path.extname(pathname)
        ? pathname
        : `${pathname}.html`,
  );
  const types = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.ttf': 'font/ttf',
  };
  try {
    response.setHeader(
      'Content-Type',
      types[path.extname(file)] || 'application/octet-stream',
    );
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});
(async () => {
  await new Promise((resolve) => server.listen(4198, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    for (const mode of ['normal', 'reduced', 'calm', 'decode-error']) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference',
      });
      if (mode === 'calm')
        await context.addInitScript(() =>
          localStorage.setItem('panda-trainer.calm.trainer', 'true'),
        );
      const page = await context.newPage();
      const errors = [];
      const requested = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        if (/clips.*\.webp/.test(request.url())) requested.push(request.url());
      });
      if (mode === 'decode-error')
        await page.route('**/*sleep*.webp', (route) => route.abort());
      await page.goto('http://127.0.0.1:4198/schedule?scenario=empty', {
        waitUntil: 'networkidle',
      });
      const clips = page.locator('img[src*="clips"][src$=".webp"]');
      if (mode === 'normal') {
        await clips.waitFor();
        const image = clips.first();
        assert(
          await image.evaluate((img) => img.complete && img.naturalWidth > 0),
        );
        const sample = async () =>
          require('node:crypto')
            .createHash('sha256')
            .update(await image.screenshot())
            .digest('hex');
        const first = await sample();
        await page.waitForTimeout(700);
        assert.notEqual(await sample(), first);
        await page.getByRole('tab', { name: /Библиотека/ }).click();
        await page.waitForTimeout(300);
        assert.equal(await clips.count(), 0);
      } else if (mode === 'decode-error') {
        await page.locator('img[src*="clips"][src*="sleep-poster"]').waitFor();
        assert.equal(await clips.count(), 0);
      } else {
        assert.equal(await clips.count(), 0);
        assert.equal(requested.length, 0);
      }
      assert.deepEqual(errors, []);
      console.log(
        `${mode}: PASS; WebP requests=${requested.length}; runtime errors=0`,
      );
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
