import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(root, 'package.json'));
const { chromium } = require('playwright');
const output = path.resolve(
  root,
  process.env.PARITY_OUTPUT ?? 'app/review/foundation-parity/parity/generated',
);
const routes = {
  't-today': 'today',
  't-schedule': 'schedule',
  't-new': 'new',
  't-inbox': 'inbox',
  't-clients': 'clients',
  't-client': 'client/c1',
  't-invite': null,
  't-session': 'session/s1',
  't-library': 'library',
  't-template': 'template/t1',
  't-template-editor': 'template-editor',
  't-billing': null,
  't-profile': 'trainer-profile',
  't-welcome': null,
  'c-home': 'home',
  'c-program': 'program',
  'c-history': 'history',
  'c-progress': 'progress',
  'c-profile': 'client-profile',
  'c-first': null,
};
const selected = process.env.SCREENS?.split(',') ?? Object.keys(routes);
const scenarioScreens = {
  't-template-editor': 'template-editor',
  't-template': 'trainer-template',
  't-inbox': 'trainer-inbox',
  't-client': 'client-details',
  't-session': 'workout',
  't-today': 'trainer-today',
  'c-home': 'client-home',
  't-schedule': 'trainer-schedule',
  'c-program': 'client-program',
  'c-history': 'client-history',
  'c-progress': 'client-progress',
  't-clients': 'trainer-clients',
  't-library': 'trainer-library',
  't-profile': 'trainer-profile',
  'c-profile': 'client-profile',
};
for (const screen of selected) {
  if (!(screen in routes))
    throw new Error(`Unknown reference screen: ${screen}`);
}
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ],
  );
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};
async function serve(directory) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, 'http://localhost').pathname,
      );
      let file = path.resolve(directory, `.${pathname}`);
      if (!file.startsWith(`${directory}${path.sep}`) && file !== directory) {
        response.writeHead(403).end();
        return;
      }
      if (!path.extname(file))
        file =
          pathname === '/' ? path.join(file, 'index.html') : `${file}.html`;
      response.setHeader(
        'Content-Type',
        mime[path.extname(file)] ?? 'application/octet-stream',
      );
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing server address');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
await mkdir(path.join(output, 'reference'), { recursive: true });
await mkdir(path.join(output, 'app'), { recursive: true });
const prototype = await serve(path.join(root, 'prototype-fresh'));
const app = await serve(path.join(root, 'app/dist'));
let browser;
try {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [path.join(root, 'prototype-fresh/review/parity/capture.cjs')],
    {
      env: {
        ...process.env,
        BASE_URL: prototype.url,
        OUT_DIR: path.join(output, 'reference'),
        SPEC_DIR: path.join(output, 'reference'),
        SCREENS: selected.join(','),
      },
      timeout: 240000,
    },
  );
  process.stdout.write(stdout);
  const reference = JSON.parse(
    await readFile(path.join(output, 'reference/index.json'), 'utf8'),
  );
  if (reference.errors.length)
    throw new Error(`Prototype capture errors: ${reference.errors.join('; ')}`);
  browser = await chromium.launch({ headless: true });
  const captures = [];
  const errors = [];
  for (const screen of selected) {
    const route = routes[screen];
    const exists =
      route &&
      (await stat(path.join(root, `app/dist/${route}.html`))
        .then(() => true)
        .catch(() => false));
    for (const theme of ['auto', 'dark', 'light']) {
      for (const scenario of theme === 'auto'
        ? ['normal', 'empty', 'loading', 'offline']
        : ['normal']) {
        const target = reference.shots.find(
          (shot) =>
            shot.screen === screen &&
            shot.theme === theme &&
            shot.scenario === scenario,
        );
        const capture = {
          screen,
          route,
          theme,
          scenario,
          reference: target ? `reference/${target.file}` : null,
          app: null,
          status: !exists
            ? 'route-missing'
            : scenario !== 'normal' && !scenarioScreens[screen]
              ? 'state-not-implemented'
              : 'captured-not-approved',
        };
        if (exists && (scenario === 'normal' || scenarioScreens[screen])) {
          const context = await browser.newContext({
            viewport: { width: 390, height: 844 },
            deviceScaleFactor: 2,
            colorScheme: 'light',
            reducedMotion: 'reduce',
          });
          await context.addInitScript((value) => {
            localStorage.setItem('panda-trainer.appearance', value);
          }, theme);
          const page = await context.newPage();
          page.on('pageerror', (error) =>
            errors.push(`${screen}/${theme}: ${error.message}`),
          );
          page.on('console', (message) => {
            if (message.type() === 'error')
              errors.push(`${screen}/${theme}: ${message.text()}`);
          });
          await page.goto(
            `${app.url}/${screen === 't-template-editor' && process.env.BUILDER_TEMPLATE ? `template/${process.env.BUILDER_TEMPLATE}` : route}?scenario=${scenario}`,
            {
              waitUntil: 'networkidle',
            },
          );
          if (screen === 't-template-editor' && process.env.BUILDER_TEMPLATE)
            await page
              .getByRole('button', { name: 'Изменить', exact: true })
              .click();
          if (scenarioScreens[screen])
            await page
              .getByTestId(
                screen === 't-template-editor'
                  ? 'template-editor'
                  : `${scenarioScreens[screen]}-${scenario}`,
              )
              .waitFor();
          else await page.getByRole('heading').first().waitFor();
          if (
            screen === 't-template-editor' &&
            process.env.BUILDER_PICKER === '1'
          ) {
            await page
              .getByRole('button', { name: 'Добавить упражнения', exact: true })
              .click();
            await page.getByRole('button', { name: /^Готово ·/ }).waitFor();
            await page.waitForTimeout(350);
          }
          await page.evaluate(() => document.fonts.ready);
          await page.screenshot({
            path: path.join(output, `app/${screen}__${scenario}__${theme}.png`),
            animations: 'disabled',
          });
          capture.app = `app/${screen}__${scenario}__${theme}.png`;
          capture.headings = await page.getByRole('heading').allTextContents();
          capture.headingMetrics = await page
            .getByRole('heading')
            .evaluateAll((elements) =>
              elements.map((element) => {
                const style = getComputedStyle(element);
                const bounds = element.getBoundingClientRect();
                return {
                  text: element.textContent,
                  fontFamily: style.fontFamily,
                  fontSize: style.fontSize,
                  lineHeight: style.lineHeight,
                  color: style.color,
                  x: bounds.x,
                  y: bounds.y,
                  width: bounds.width,
                  height: bounds.height,
                };
              }),
            );
          capture.tabs = await page.getByRole('tab').allTextContents();
          await context.close();
        }
        captures.push(capture);
      }
    }
  }
  const result = {
    viewport: '390x844@2x',
    systemTheme: 'light',
    accepted: false,
    errors,
    captures,
  };
  await writeFile(
    path.join(output, 'index.json'),
    JSON.stringify(result, null, 2),
  );
  const rows = captures
    .map(
      (item) =>
        `<section><h2>${escape(item.screen)} · ${escape(item.theme)} · ${escape(item.scenario)}</h2><p>${escape(item.status)}</p><div class="pair"><figure><figcaption>Prototype reference</figcaption>${item.reference ? `<img src="${escape(item.reference)}" alt="Prototype">` : '<p>Reference missing</p>'}</figure><figure><figcaption>React Native web · not approved</figcaption>${item.app ? `<img src="${escape(item.app)}" alt="Application">` : `<p>${escape(item.status)}</p>`}</figure></div></section>`,
    )
    .join('');
  await writeFile(
    path.join(output, 'index.html'),
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Prototype parity review</title><style>body{font:15px system-ui;background:#eee;color:#121420;margin:24px}h1{font-size:26px}.pair{display:flex;gap:16px;flex-wrap:wrap}figure{margin:0;width:390px}img{display:block;width:390px;max-width:100%}section{margin:32px 0}figcaption{margin:8px 0}</style><h1>Prototype | application</h1><p>390 × 844 @2x. Captures are evidence, not approval. Native verification and the UI-PARITY checklist remain required. Missing routes/states are recorded explicitly. Existing screens may still be scaffolds.</p>${rows}</html>`,
  );
  console.log(
    `${captures.filter((item) => item.app).length} app captures; ${captures.filter((item) => !item.app).length} missing route/state comparisons; ${errors.length} app errors`,
  );
  console.log(path.join(output, 'index.html'));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser?.close();
  await app.close();
  await prototype.close();
}
