const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(process.env.SMOKE_DIST || 'dist');
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
    const file = path.join(
      root,
      pathname === '/'
        ? 'index.html'
        : pathname + (path.extname(pathname) ? '' : '.html'),
    );
    res.setHeader(
      'Content-Type',
      mime[path.extname(file)] || 'application/octet-stream',
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const errors = [];
  try {
    for (const theme of ['dark', 'light']) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: 'reduce',
      });
      await context.addInitScript(
        (theme) => localStorage.setItem('panda-trainer.appearance', theme),
        theme,
      );
      for (const route of [
        'today',
        'schedule',
        'clients',
        'library',
        'trainer-profile',
        'client-profile',
      ]) {
        const page = await context.newPage();
        page.on('pageerror', (e) => {
          errors.push(`${route}/${theme}: ${e.message}`);
          console.error(e.message);
        });
        page.on('console', (m) => {
          if (m.type() === 'error') console.error(m.text());
        });
        await page.goto(`${base}/${route}?scenario=normal`, {
          waitUntil: 'networkidle',
        });
        try {
          await page
            .getByTestId('floating-tab-bar')
            .waitFor({ timeout: 10000 });
        } catch (e) {
          console.log((await page.locator('body').innerText()).slice(0, 2500));
          throw e;
        }
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(150);
        const metrics = await page.evaluate(() => {
          const panel = document.querySelector(
            '[data-testid="floating-tab-bar"]',
          );
          const rect = panel.getBoundingClientRect();
          const fallback = document.querySelector(
            '[data-testid="tab-bar-fallback"]',
          );
          const scrollers = Array.from(document.querySelectorAll('div')).filter(
            (el) =>
              getComputedStyle(el).overflowY === 'auto' ||
              getComputedStyle(el).overflowY === 'scroll',
          );
          const content = scrollers.map((el) => ({
            viewportBottom: el.getBoundingClientRect().bottom,
            paddingBottom: parseFloat(
              getComputedStyle(el.firstElementChild || el).paddingBottom,
            ),
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
          }));
          return {
            panel: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              bottom: rect.bottom,
            },
            tabs: document.querySelectorAll('[role="tab"]').length,
            background: getComputedStyle(fallback).backgroundColor,
            border: getComputedStyle(fallback).borderWidth,
            radius: getComputedStyle(fallback).borderRadius,
            content,
          };
        });
        assert.equal(metrics.tabs, 5);
        assert.equal(metrics.panel.x, 12);
        assert.equal(metrics.panel.width, 366);
        assert.equal(metrics.panel.bottom, 834);
        assert.match(metrics.background, /rgba\(/);
        assert.equal(metrics.border, '1px');
        assert.equal(metrics.radius, '32px');
        assert(
          metrics.content.some(
            (c) =>
              c.viewportBottom >= metrics.panel.bottom &&
              c.paddingBottom >= metrics.panel.height + 10 + 16,
          ),
          `missing inset ${JSON.stringify(metrics)}`,
        );
        results.push({ route, theme, ...metrics });
        await page.close();
      }
      await context.close();
    }
    assert.equal(errors.length, 0, JSON.stringify(errors));
    await require('node:fs/promises').writeFile(
      process.env.SMOKE_OUTPUT || '/tmp/som39-web-smoke.json',
      JSON.stringify({ results, errors }, null, 2),
    );
    console.log(
      `PASS ${results.length} route/theme cases: 5 accessible tabs; absolute capsule x12 width366 bottom834; translucent themed surface, border1 radius32; full-height scrolling and measured content inset. No page errors.`,
    );
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
