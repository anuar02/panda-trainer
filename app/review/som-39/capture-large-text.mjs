import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(path.join(root, 'package.json'));
const { chromium } = require('playwright');
const output = path.join(root, 'app/review/som-39/large-text');
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    let file = path.resolve(root, 'app/dist', `.${pathname}`);
    if (!file.startsWith(path.join(root, 'app/dist'))) throw new Error('path');
    if (!path.extname(file)) file += '.html';
    response.setHeader(
      'Content-Type',
      file.endsWith('.html')
        ? 'text/html'
        : file.endsWith('.js')
          ? 'application/javascript'
          : file.endsWith('.css')
            ? 'text/css'
            : 'application/octet-stream',
    );
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('address');
const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const results = [];
try {
  for (const route of ['today', 'session/s1']) {
    for (const fontScale of [1.34, 2]) {
      for (const calm of [false, true]) {
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          reducedMotion: 'reduce',
          deviceScaleFactor: 1,
        });
        await context.addInitScript(
          ({ calm }) => {
            localStorage.setItem('panda-trainer.appearance', 'auto');
            localStorage.setItem('panda-trainer.calm.trainer', String(calm));
          },
          { calm },
        );
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        let dimensionPatches = 0;
        await page.route('**/_expo/static/js/web/*.js', async (request) => {
          const response = await request.fetch();
          const body = await response.text();
          dimensionPatches += (body.match(/fontScale:1/g) ?? []).length;
          await request.fulfill({
            response,
            body: body.replaceAll('fontScale:1', `fontScale:${fontScale}`),
          });
        });
        await page.goto(`http://127.0.0.1:${address.port}/${route}`, {
          waitUntil: 'networkidle',
        });
        await page
          .getByTestId(
            route === 'today' ? 'trainer-today-normal' : 'workout-normal',
          )
          .waitFor();
        await page.evaluate(() => document.fonts.ready);
        const scaleText = async () =>
          page.evaluate((scale) => {
            const entries = [...document.querySelectorAll('*')]
              .filter(
                (element) =>
                  element instanceof HTMLElement &&
                  !element.dataset.reviewScaled &&
                  (['INPUT', 'TEXTAREA'].includes(element.tagName) ||
                    [...element.childNodes].some(
                      (node) =>
                        node.nodeType === Node.TEXT_NODE &&
                        node.textContent.trim(),
                    )),
              )
              .map((element) => ({
                element,
                font: parseFloat(getComputedStyle(element).fontSize),
                leading: parseFloat(getComputedStyle(element).lineHeight),
              }));
            for (const { element, font, leading } of entries) {
              element.dataset.reviewScaled = 'true';
              element.style.fontSize = `${font * scale}px`;
              if (Number.isFinite(leading))
                element.style.lineHeight = `${leading * scale}px`;
            }
          }, fontScale);
        await scaleText();
        const prefix = `${route.replaceAll('/', '-')}-${fontScale}-${calm ? 'calm' : 'normal'}`;
        await page.screenshot({ path: path.join(output, `${prefix}-top.png`) });
        const overflow = await page.evaluate(() =>
          [...document.querySelectorAll('[data-review-scaled]')]
            .filter(
              (element) => !['INPUT', 'TEXTAREA'].includes(element.tagName),
            )
            .flatMap((element) => {
              const range = document.createRange();
              range.selectNodeContents(element);
              const bounds = range.getBoundingClientRect();
              return bounds.width > 0 &&
                (bounds.left < -1 || bounds.right > 391)
                ? [
                    {
                      text: element.textContent,
                      left: bounds.left,
                      right: bounds.right,
                    },
                  ]
                : [];
            }),
        );
        if (route.startsWith('session')) {
          await page
            .getByRole('button', { name: 'Записать подход 1', exact: true })
            .click();
          await scaleText();
          await page
            .getByRole('button', { name: 'Завершить', exact: true })
            .scrollIntoViewIfNeeded();
          await page.screenshot({
            path: path.join(output, `${prefix}-actions.png`),
          });
          await page
            .getByRole('button', {
              name: 'Изменить подход 1: Приседания со штангой',
              exact: true,
            })
            .click();
          await page.getByTestId('workout-editor-kg').waitFor();
          await scaleText();
          await page.waitForTimeout(500);
          await page.screenshot({
            path: path.join(output, `${prefix}-sheet.png`),
          });
          await page.getByTestId('workout-editor-kg').fill('52,5');
          const save = page.getByRole('button', {
            name: 'Записать подход',
            exact: true,
          });
          await save.scrollIntoViewIfNeeded();
          await page.screenshot({
            path: path.join(output, `${prefix}-sheet-actions.png`),
          });
          await save.click();
          await page
            .getByTestId('workout-editor-kg')
            .waitFor({ state: 'detached' });
          await page
            .getByText('52,5 кг × 10', { exact: true })
            .first()
            .waitFor();
        }
        results.push({
          route,
          fontScale,
          calm,
          dimensionPatches,
          errors,
          horizontalTextOverflow: overflow,
          mascotImages: await page.locator('img').count(),
          status: 'web-simulation-not-native-acceptance',
        });
        await context.close();
      }
    }
  }
  const profileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const profilePage = await profileContext.newPage();
  const profileErrors = [];
  profilePage.on('pageerror', (error) => profileErrors.push(error.message));
  const profileChecks = [];
  for (const role of ['trainer', 'client']) {
    await profilePage.goto(`http://127.0.0.1:${address.port}/${role}-profile`, {
      waitUntil: 'networkidle',
    });
    const toggle = profilePage.getByRole('switch', {
      name: 'Спокойный интерфейс',
    });
    if ((await toggle.getAttribute('aria-checked')) !== 'false')
      throw new Error(
        JSON.stringify({
          role,
          checked: await toggle.getAttribute('aria-checked'),
          preferences: await profilePage.evaluate(() => ({
            trainer: localStorage.getItem('panda-trainer.calm.trainer'),
            client: localStorage.getItem('panda-trainer.calm.client'),
          })),
        }),
      );
    await toggle.click();
    await profilePage.waitForFunction(
      (role) => localStorage.getItem(`panda-trainer.calm.${role}`) === 'true',
      role,
    );
    await profilePage.reload({ waitUntil: 'networkidle' });
    await profilePage.waitForFunction(
      () =>
        document
          .querySelector('[role="switch"]')
          ?.getAttribute('aria-checked') === 'true',
    );
    await toggle.scrollIntoViewIfNeeded();
    await profilePage.screenshot({
      path: path.join(output, `${role}-profile-calm.png`),
    });
    profileChecks.push({ role, enabled: true, persistedAfterReload: true });
  }
  await writeFile(
    path.join(output, 'profile-report.json'),
    `${JSON.stringify({ profileChecks, errors: profileErrors }, null, 2)}\n`,
  );
  await profileContext.close();
  await writeFile(
    path.join(output, 'report.json'),
    `${JSON.stringify(results, null, 2)}\n`,
  );
  if (
    profileErrors.length ||
    results.some(
      (result) =>
        result.errors.length ||
        result.dimensionPatches !== 4 ||
        result.horizontalTextOverflow.length ||
        result.mascotImages !== (result.calm ? 0 : 1),
    )
  )
    throw new Error('Inspect large-text/report.json');
  process.stdout.write(
    `Captured ${results.length} web simulations; no runtime errors or horizontal text overflow.\n`,
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
