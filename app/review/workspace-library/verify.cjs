const { chromium } = require('../../../node_modules/@playwright/test');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const { resolve, dirname } = require('node:path');

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? null : (args[index + 1] ?? null);
};
const workdir = option('--workdir');
const container = option('--container');
const origin = option('--origin') ?? 'http://localhost:8088';
if (!workdir || !container) {
  process.stderr.write('Usage: node verify.cjs --workdir <repo> --container <supabase-db-container> [--origin http://localhost:8088]\n');
  process.exit(2);
}
const resolvedWorkdir = resolve(workdir);
const supabase = resolve(dirname(process.argv[1]), '../../node_modules/.bin/supabase');
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
  process.stderr.write('The origin must be a loopback URL.\n');
  process.exit(2);
}
if (!/^[A-Za-z0-9_.-]+$/.test(container)) {
  process.stderr.write('The container name is invalid.\n');
  process.exit(2);
}
process.chdir(resolvedWorkdir);
const config = JSON.parse(execFileSync(supabase, ['--workdir', resolvedWorkdir, 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
if (!['localhost', '127.0.0.1'].includes(new URL(config.MAILPIT_URL).hostname) || !['localhost', '127.0.0.1'].includes(new URL(config.API_URL).hostname)) throw new Error('Test services must use loopback');
const mailpit = config.MAILPIT_URL.replace(/\/$/, '') + '/api/v1';
const email = `ui-library-${randomUUID()}@example.test`;
const messageIds = new Set();
const failures = [];
const pageErrors = [];
let passed = 0;
let browser;
let stage = 'startup';
let cardDiagnostic = null;

const check = (condition, label) => {
  if (!condition) throw new Error(label);
  passed += 1;
};
const waitForText = async (page, text, timeout = 30000) => {
  await page.getByText(text, { exact: true }).filter({ visible: true }).waitFor({ state: 'visible', timeout });
};
const waitForBodyText = async (page, text, timeout = 30000) => {
  await page.waitForFunction((expected) => document.body.innerText.includes(expected), text, { timeout });
};
async function captureCode(targetEmail) {
  let message;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await fetch(`${mailpit}/messages`);
    if (!response.ok) throw new Error('mailpit-unavailable');
    const inbox = await response.json();
    message = inbox.messages.find((item) => item.To.some((to) => to.Address === targetEmail));
    if (message) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  if (!message) throw new Error('mail-not-captured');
  messageIds.add(message.ID);
  const response = await fetch(`${mailpit}/message/${encodeURIComponent(message.ID)}`);
  if (!response.ok) throw new Error('mailpit-message-unavailable');
  const body = await response.json();
  const match = body.HTML.match(/<strong[^>]*>(\d{6})<\/strong>/) ?? body.Text.match(/\b(\d{6})\b/);
  if (!match) throw new Error('mail-code-unavailable');
  return match[1];
}
async function signInAsTrainer(page) {
  stage = 'trainer-auth';
  await page.goto(`${origin}/auth/sign-in`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.getByLabel('Электронная почта', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Получить код', exact: true }).click();
  await waitForText(page, 'Введите код');
  const code = await captureCode(email);
  await page.getByLabel('Код из письма', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  stage = 'welcome-role';
  await page.getByTestId('trainer-welcome-step-0').waitFor({ state: 'visible', timeout: 60000 });
  await page.getByRole('button', { name: 'Я тренер — начать', exact: true }).click();
  stage = 'welcome-profile';
  await page.getByTestId('trainer-welcome-step-1').waitFor({ state: 'visible' });
  await page.getByLabel('Имя', { exact: true }).fill('Тренер библиотеки');
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  stage = 'welcome-hours';
  await page.getByTestId('trainer-welcome-step-2').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  stage = 'welcome-client';
  await page.getByTestId('trainer-welcome-step-3').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Добавлю позже', exact: true }).click();
  await page.getByTestId('trainer-welcome-step-4').waitFor({ state: 'visible', timeout: 60000 });
  await page.getByRole('button', { name: 'Перейти на главную', exact: true }).click();
  await page.waitForURL(/\/workspace\/clients(?:\?.*)?$/, { timeout: 30000 });
}
async function cleanup() {
  const quotedEmail = `'${email}'`;
  const sql = `
begin;
do $cleanup$
declare
  owned_workspace_ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into owned_workspace_ids
  from public.trainer_workspaces
  where owner_user_id in (select id from auth.users where email = ${quotedEmail});
  delete from private.template_command_receipts where workspace_id = any(owned_workspace_ids);
  delete from public.template_exercises where workspace_id = any(owned_workspace_ids);
  delete from public.workout_templates where workspace_id = any(owned_workspace_ids);
  delete from public.exercises where workspace_id = any(owned_workspace_ids);
  delete from public.trainer_workspaces where id = any(owned_workspace_ids);
  delete from public.profiles where user_id in (select id from auth.users where email = ${quotedEmail});
  delete from auth.users where email = ${quotedEmail};
end
$cleanup$;
commit;`;
  execFileSync('docker', ['exec', container, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', sql], { cwd: resolvedWorkdir, stdio: 'pipe' });
  for (const id of messageIds) {
    const response = await fetch(`${mailpit}/messages`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [id] }) });
    if (!response.ok) throw new Error('Synthetic mail cleanup failed');
  }
}
const isAppError = (message) => message.type() === 'error' && !(message.location().url === `${origin}/favicon.ico` && message.text() === 'Failed to load resource: the server responded with a status of 404 (Not Found)');
const watchPage = (page) => {
  page.on('pageerror', () => pageErrors.push('pageerror'));
  page.on('console', (message) => { if (isAppError(message)) pageErrors.push('console-error'); });
};
async function screenshot(page, name) {
  mkdirSync('/tmp/screens/workspace-library', { recursive: true });
  await page.screenshot({ path: `/tmp/screens/workspace-library/${name}.png`, fullPage: true });
}
async function discardEditorDraft(page) {
  await page.getByRole('button', { name: 'Удалить черновик', exact: true }).filter({ visible: true }).first().click();
  await waitForText(page, 'Удалить черновик?');
  await page.getByRole('button', { name: 'Удалить черновик', exact: true }).filter({ visible: true }).last().click();
  await page.getByText('Удалить черновик?', { exact: true }).filter({ visible: true }).waitFor({ state: 'hidden', timeout: 30000 });
}
async function run() {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  watchPage(page);
  await signInAsTrainer(page);
  stage = 'open-account-library';
  await page.goto(`${origin}/auth/account`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.getByRole('button', { name: 'Открыть библиотеку', exact: true }).click();
  await page.waitForURL(/\/workspace\/library(?:\?.*)?$/, { timeout: 30000 });
  await page.getByTestId('trainer-library-normal').waitFor({ state: 'visible', timeout: 60000 });
  await waitForBodyText(page, 'Приседания со штангой');
  check(await page.getByText('Приседания со штангой', { exact: true }).count() > 0, 'workspace-library-loads-seeded-exercises');
  await screenshot(page, 'library-seeded');

  const customName = `Проверка ${randomUUID().slice(0, 8)}`;
  stage = 'create-custom-exercise';
  await page.getByRole('textbox', { name: 'Поиск упражнений', exact: true }).fill(customName);
  await page.getByRole('button', { name: `Создать своё: «${customName}»`, exact: true }).click();
  await waitForText(page, customName, 60000);
  check(await page.getByText(customName, { exact: true }).count() > 0, 'custom-exercise-saved-and-visible');

  stage = 'open-template-create';
  await page.getByRole('button', { name: 'Шаблоны', exact: false }).click();
  await page.getByRole('button', { name: 'Создать шаблон', exact: true }).click();
  await page.waitForURL(/\/workspace\/library\/editor(?:\?.*)?$/, { timeout: 30000 });
  stage = 'name-template';
  await page.getByRole('textbox', { name: 'Название шаблона', exact: true }).fill('Низ А');
  await page.getByRole('button', { name: 'Добавить упражнения', exact: true }).click();
  await page.getByRole('textbox', { name: 'Поиск упражнений для шаблона', exact: true }).fill('Приседания со штангой');
  await page.getByRole('button', { name: 'Приседания со штангой', exact: true }).click();
  await page.getByRole('textbox', { name: 'Поиск упражнений для шаблона', exact: true }).fill(customName);
  await page.getByRole('button', { name: customName, exact: true }).click();
  await page.getByRole('button', { name: /^Готово/ }).click();
  await page.getByRole('textbox', { name: 'Поиск упражнений для шаблона', exact: true }).waitFor({ state: 'hidden' });
  check(await page.getByText(customName, { exact: true }).count() > 0 && await page.getByText('Приседания со штангой', { exact: true }).count() > 0, 'template-holds-custom-and-seeded-exercise');
  await screenshot(page, 'template-editor-with-custom');
  stage = 'save-template';
  await page.getByRole('button', { name: 'Сохранить шаблон', exact: true }).click();
  await page.waitForURL(/\/workspace\/library\/template\/[a-f0-9-]+(?:\?.*)?$/, { timeout: 60000 });
  await waitForBodyText(page, 'Низ А', 60000);
  check(await page.getByText(customName, { exact: true }).count() > 0, 'saved-template-detail-has-custom-exercise');
  stage = 'reload-template';
  await page.reload({ waitUntil: 'networkidle', timeout: 90000 });
  await waitForBodyText(page, 'Низ А', 60000);
  check(await page.getByText('Приседания со штангой', { exact: true }).count() > 0 && await page.getByText(customName, { exact: true }).count() > 0, 'saved-template-survives-reload');
  await screenshot(page, 'template-detail-saved');

  stage = 'edit-preserves-plan';
  await page.getByRole('button', { name: 'Изменить', exact: true }).click();
  await page.waitForURL(/\/workspace\/library\/editor/, { timeout: 30000 });
  await waitForText(page, customName);
  await waitForText(page, 'Приседания со штангой');
  check(true, 'editing-template-prefills-existing-exercises');
  await discardEditorDraft(page);
  await page.waitForURL(/\/workspace\/library(?:\?.*)?$/, { timeout: 30000 });
  stage = 'copy-preserves-plan';
  await page.getByRole('button', { name: 'Шаблоны', exact: false }).click();
  await page.getByRole('textbox', { name: 'Поиск шаблонов', exact: true }).fill('Низ А');
  await page.getByRole('button').filter({ hasText: 'Низ А', visible: true }).first().click({ force: true });
  await page.waitForURL(/\/workspace\/library\/template\//, { timeout: 30000 });
  await page.getByRole('button', { name: 'Создать копию шаблона', exact: true }).click();
  await page.waitForURL(/\/workspace\/library\/editor/, { timeout: 30000 });
  await waitForText(page, customName);
  await waitForText(page, 'Приседания со штангой');
  check(true, 'copy-template-prefills-existing-exercises');
  await discardEditorDraft(page);
  await page.waitForURL(/\/workspace\/library(?:\?.*)?$/, { timeout: 30000 });

  stage = 'archive-custom-exercise';
  await page.getByRole('button', { name: 'Упражнения', exact: false }).click();
  await page.getByRole('textbox', { name: 'Поиск упражнений', exact: true }).fill(customName);
  await page.getByText(customName, { exact: true }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: 'Архивировать упражнение', exact: true }).click();
  await page.getByRole('button', { name: 'Архивировать', exact: true }).click();
  await page.waitForFunction((name) => !Array.from(document.querySelectorAll('*')).some((element) => element.children.length === 0 && element.textContent?.trim() === name && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0), customName, { timeout: 60000 });
  check(await page.getByText(customName, { exact: true }).filter({ visible: true }).count() === 0, 'archived-exercise-disappears-from-active-library');
  await page.getByText('Архивировать упражнение', { exact: true }).filter({ visible: true }).waitFor({ state: 'hidden', timeout: 30000 });
  await screenshot(page, 'archive-complete');
  stage = 'archived-reference-open-tab';
  await page.getByRole('button', { name: 'Шаблоны', exact: false }).filter({ visible: true }).click();
  stage = 'archived-reference-search';
  await page.getByRole('textbox', { name: 'Поиск шаблонов', exact: true }).fill('Низ А');
  stage = 'archived-reference-card-lookup';
  const templateCard = page.getByRole('button', { name: /Мой шаблон\s*Низ А/ });
  const [textCount, cardCount, hitTest] = await Promise.all([
    page.getByText('Низ А', { exact: true }).count(),
    templateCard.count(),
    page.evaluate(() => Array.from(document.querySelectorAll('[role="button"]')).filter((element) => element.textContent?.includes('Низ А') && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0).map((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        ariaHidden: element.closest('[aria-hidden="true"]') !== null,
        inert: element.closest('[inert]') !== null,
        pointerEvents: getComputedStyle(element).pointerEvents,
        hitRole: hit?.getAttribute('role') ?? null,
        hitInsideCard: Boolean(hit && (hit === element || element.contains(hit))),
      };
    })),
  ]);
  cardDiagnostic = { textCount, accessibleCardCount: cardCount, hitTest };
  check(cardCount === 1, 'visible-template-card-is-accessible');
  await templateCard.click();
  await page.waitForURL(/\/workspace\/library\/template\//, { timeout: 30000 });
  await waitForText(page, customName, 60000);
  check(true, 'archived-exercise-name-remains-in-template');
  await screenshot(page, 'archived-template-reference');
  check(pageErrors.length === 0, 'no-browser-page-errors');
  await context.close();
}
run()
  .then(async () => {
    await cleanup();
    await browser?.close();
    process.stdout.write(`PASS: ${passed} workspace library checks completed\n`);
  })
  .catch(async () => {
    failures.push(`workspace-library-smoke-failed-at-${stage}`);
    const pages = browser?.contexts().flatMap((context) => context.pages()) ?? [];
    const failedPage = pages.at(-1);
    if (failedPage) {
      const diagnostic = await failedPage.evaluate(() => ({
        path: location.pathname.startsWith('/workspace/library/template/') ? '/workspace/library/template/:id' : location.pathname,
        headings: Array.from(document.querySelectorAll('h1,h2,[role=heading]')).map((element) => element.textContent?.trim() ?? ''),
        visibleMarkers: ['Шаблон сохранён', 'Шаблоны не найдены', 'Не удалось загрузить шаблоны', 'Не удалось сохранить', 'Черновик сохраняется на этом устройстве.', 'Сохранение…'].filter((copy) => document.body.innerText.includes(copy)),
        visibleButtons: Array.from(document.querySelectorAll('[role=button],button')).filter((element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0).map((element) => (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)).filter((value) => value.includes('Низ А') || value.includes('Шаблон')),
      })).catch(() => ({ path: 'unknown', headings: [], visibleMarkers: [] }));
      process.stderr.write(`SAFE_ROUTE_DIAGNOSTIC: ${JSON.stringify({ ...diagnostic, cardDiagnostic })}\n`);
      if (!diagnostic.path.startsWith('/invite/')) {
        mkdirSync('/tmp/screens/workspace-library', { recursive: true });
        await failedPage.screenshot({ path: '/tmp/screens/workspace-library/failure-safe.png', fullPage: true }).catch(() => {});
      }
    }
    process.stderr.write(`${failures.join('\n')}\n`);
    await browser?.close();
    try { await cleanup(); } catch { process.stderr.write('Synthetic fixture cleanup failed.\n'); }
    process.exitCode = 1;
  });
