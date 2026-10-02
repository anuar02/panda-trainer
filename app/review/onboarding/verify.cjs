const { chromium } = require('../../../node_modules/@playwright/test');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const supabase = resolve(dirname(process.argv[1]), '../../node_modules/.bin/supabase');

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? null : args[index + 1] ?? null;
};
const workdir = option('--workdir');
const container = option('--container');
const origin = option('--origin') ?? 'http://localhost:8087';
if (!workdir || !container) {
  process.stderr.write('Usage: node verify.cjs --workdir <repo> --container <supabase-db-container> [--origin http://localhost:8087]\n');
  process.exit(2);
}
const resolvedWorkdir = resolve(workdir);
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
const emails = [
  `ui-onboarding-${randomUUID()}@example.test`,
  `ui-onboarding-${randomUUID()}@example.test`,
];
const messageIds = new Set();
const failures = [];
let passed = 0;
let browser;
let stage = 'startup';
const screenDir = '/tmp/screens';

const check = (condition, label) => {
  if (!condition) throw new Error(label);
  passed += 1;
};

const waitForText = async (page, text, timeout = 30000) => {
  await page.getByText(text, { exact: true }).waitFor({ state: 'visible', timeout });
};

async function captureCode(email) {
  let message;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await fetch(`${mailpit}/messages`);
    if (!response.ok) throw new Error('mailpit-unavailable');
    const inbox = await response.json();
    message = inbox.messages.find((item) => item.To.some((to) => to.Address === email));
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

async function signIn(page, email) {
  await page.goto(`${origin}/auth/sign-in`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.getByLabel('Электронная почта', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Получить код', exact: true }).click();
  await waitForText(page, 'Введите код');
  const code = await captureCode(email);
  await page.getByLabel('Код из письма', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await page.getByTestId('trainer-welcome-step-0').waitFor({ state: 'visible', timeout: 60000 });
}

async function beginTrainer(page) {
  await page.getByRole('button', { name: 'Я тренер — начать', exact: true }).click();
  await page.getByTestId('trainer-welcome-step-1').waitFor({ state: 'visible' });
}

async function completeProfileAndHours(page, trainerName, captureHours = false) {
  await page.getByLabel('Имя', { exact: true }).fill(trainerName);
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await page.getByTestId('trainer-welcome-step-2').waitFor({ state: 'visible' });
  if (captureHours) await page.screenshot({ path: `${screenDir}/welcome-hours.png`, fullPage: true });
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await page.getByTestId('trainer-welcome-step-3').waitFor({ state: 'visible' });
}

async function cleanup() {
  const ownEmails = emails.map((email) => `'${email}'`).join(', ');
  const sql = `
begin;
do $cleanup$
declare
  owned_workspace_ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into owned_workspace_ids
  from public.trainer_workspaces
  where owner_user_id in (select id from auth.users where email in (${ownEmails}));
  delete from private.client_creation_receipts where workspace_id = any(owned_workspace_ids);
  delete from private.program_assignment_receipts where workspace_id = any(owned_workspace_ids);
  delete from private.booking_creation_receipts where workspace_id = any(owned_workspace_ids);
  delete from private.booking_reschedule_receipts where workspace_id = any(owned_workspace_ids);
  delete from private.booking_status_command_receipts where workspace_id = any(owned_workspace_ids);
  delete from private.template_command_receipts where workspace_id = any(owned_workspace_ids);
  delete from public.set_results where workspace_id = any(owned_workspace_ids);
  delete from public.session_notes where workspace_id = any(owned_workspace_ids);
  delete from public.private_notes where workspace_id = any(owned_workspace_ids);
  delete from public.workout_exercises where workspace_id = any(owned_workspace_ids);
  delete from public.workout_instances where workspace_id = any(owned_workspace_ids);
  delete from public.schedule_proposals where workspace_id = any(owned_workspace_ids);
  delete from public.bookings where workspace_id = any(owned_workspace_ids);
  delete from public.group_sessions where workspace_id = any(owned_workspace_ids);
  delete from public.client_program_exercises where workspace_id = any(owned_workspace_ids);
  delete from public.client_programs where workspace_id = any(owned_workspace_ids);
  delete from public.template_exercises where workspace_id = any(owned_workspace_ids);
  delete from public.workout_templates where workspace_id = any(owned_workspace_ids);
  delete from public.exercises where workspace_id = any(owned_workspace_ids);
  delete from public.invitations where client_record_id in
    (select id from public.client_records where workspace_id = any(owned_workspace_ids));
  delete from public.client_records where workspace_id = any(owned_workspace_ids);
  delete from public.sync_operations where workspace_id = any(owned_workspace_ids);
  delete from public.trainer_workspaces where id = any(owned_workspace_ids);
  delete from public.profiles where user_id in
    (select id from auth.users where email in (${ownEmails}));
  delete from auth.users where email in (${ownEmails});
end
$cleanup$;
commit;`;
  execFileSync('docker', [
    'exec', container, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', sql,
  ], { cwd: resolvedWorkdir, stdio: 'pipe' });
  for (const id of messageIds) {
    const response = await fetch(`${mailpit}/messages`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ IDs: [id] }),
    });
    if (!response.ok) throw new Error('Synthetic mail cleanup failed');
  }
}

const isAppError = (message) => message.type() === 'error' && !(message.location().url === `${origin}/favicon.ico` && message.text() === 'Failed to load resource: the server responded with a status of 404 (Not Found)');

async function run() {
  mkdirSync(screenDir, { recursive: true });
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const pageErrors = [];
  const contextA = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageA = await contextA.newPage();
  pageA.on('pageerror', () => pageErrors.push('user-a'));
  pageA.on('console', (message) => { if (isAppError(message)) pageErrors.push('user-a-console'); });

  stage = 'first-login';
  await signIn(pageA, emails[0]);
  stage = 'first-setup';
  await beginTrainer(pageA);
  await pageA.screenshot({ path: `${screenDir}/welcome-profile.png`, fullPage: true });
  await completeProfileAndHours(pageA, 'Тестовый тренер А', true);
  await pageA.getByLabel('Имя и фамилия', { exact: true }).fill('Тестовый клиент А');
  await pageA.getByLabel('Телефон', { exact: true }).fill('+7 700 000 00 11');
  await pageA.getByRole('button', { name: 'Добавить клиента', exact: true }).click();
  await pageA.getByTestId('trainer-welcome-step-4').waitFor({ state: 'visible', timeout: 60000 });
  await pageA.screenshot({ path: `${screenDir}/welcome-done.png`, fullPage: true });
  await pageA.getByRole('button', { name: 'Перейти на главную', exact: true }).click();
  await pageA.getByRole('heading', { name: 'Клиенты', exact: true }).waitFor({ state: 'visible' });
  await pageA.getByRole('button', { name: 'Тестовый клиент А', exact: true }).waitFor({ state: 'visible' });
  await pageA.screenshot({ path: `${screenDir}/client-list.png`, fullPage: true });
  check(true, 'user-a-onboarding-and-first-client');

  stage = 'reload';
  await pageA.reload({ waitUntil: 'networkidle' });
  await pageA.getByRole('button', { name: 'Тестовый клиент А', exact: true }).waitFor({ state: 'visible' });
  check(true, 'user-a-client-persists-after-reload');

  stage = 'add-client';
  await pageA.getByRole('button', { name: 'Добавить клиента', exact: true }).click();
  await waitForText(pageA, 'Новый клиент');
  await pageA.getByLabel('Имя и фамилия', { exact: true }).fill('Тестовый клиент Б');
  await pageA.getByRole('button', { name: 'Создать карточку', exact: true }).click();
  await pageA.getByRole('button', { name: 'Тестовый клиент Б', exact: true }).waitFor({ state: 'visible', timeout: 60000 });

  stage = 'search-and-detail';
  const search = pageA.getByLabel('Поиск клиента по имени или телефону', { exact: true });
  await search.fill('Тестовый клиент Б');
  await pageA.getByRole('button', { name: 'Тестовый клиент Б', exact: true }).waitFor({ state: 'visible' });
  await pageA.getByText('Тестовый клиент А', { exact: true }).waitFor({ state: 'hidden' });
  await search.fill('77000000011');
  await pageA.getByRole('button', { name: 'Тестовый клиент А', exact: true }).waitFor({ state: 'visible' });
  await pageA.getByRole('button', { name: 'Тестовый клиент Б', exact: true }).waitFor({ state: 'hidden' });
  await search.fill('Тестовый клиент Б');
  await pageA.getByRole('button', { name: 'Тестовый клиент Б', exact: true }).click();
  await pageA.waitForURL(/\/workspace\/client\/[a-f0-9-]+$/);
  await pageA.getByText('Тестовый клиент Б', { exact: true }).filter({ visible: true }).waitFor({ state: 'visible' });
  const clientPath = new URL(pageA.url()).pathname;
  const clientId = clientPath.split('/').pop();
  check(/^\/[a-z0-9-]+$/.test(`/${clientId}`), 'user-a-client-detail-route');
  await pageA.screenshot({ path: `${screenDir}/client-detail.png`, fullPage: true });
  check(true, 'user-a-search-name-phone-and-detail');

  const contextB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageB = await contextB.newPage();
  pageB.on('pageerror', () => pageErrors.push('user-b'));
  pageB.on('console', (message) => { if (isAppError(message)) pageErrors.push('user-b-console'); });
  stage = 'second-login';
  await signIn(pageB, emails[1]);
  stage = 'second-setup';
  await beginTrainer(pageB);
  await completeProfileAndHours(pageB, 'Тестовый тренер Б');
  await pageB.getByRole('button', { name: 'Добавлю позже', exact: true }).click();
  await pageB.getByTestId('trainer-welcome-step-4').waitFor({ state: 'visible', timeout: 60000 });
  await pageB.getByRole('button', { name: 'Перейти на главную', exact: true }).click();
  await pageB.getByRole('heading', { name: 'Клиенты', exact: true }).waitFor({ state: 'visible' });
  await waitForText(pageB, 'Ваш первый клиент');
  await pageB.getByRole('button', { name: 'Тестовый клиент А', exact: true }).waitFor({ state: 'hidden' });
  stage = 'isolation';
  await pageB.goto(`${origin}/workspace/client/${clientId}`, { waitUntil: 'networkidle' });
  await waitForText(pageB, 'Клиент не найден', 30000);
  check(true, 'user-b-empty-and-cannot-open-user-a-client');

  check(pageErrors.length === 0, 'no-browser-page-errors');
  await contextA.close();
  await contextB.close();
}

run()
  .then(async () => {
    await cleanup();
    await browser?.close();
    process.stdout.write(`PASS: ${passed} checks; 5 screenshots saved in /tmp/screens\n`);
  })
  .catch(async () => {
    failures.push(`onboarding-smoke-failed-at-${stage}`);
    const failedPage = browser?.contexts().at(-1)?.pages().at(-1);
    await failedPage?.screenshot({ path: `${screenDir}/failed.png`, fullPage: true }).catch(() => {});
    try {
      await cleanup();
    } catch {
      failures.push('fixture-cleanup-failed');
    }
    await browser?.close();
    process.stderr.write(`FAIL: ${failures.join('; ')}\n`);
    process.exitCode = 1;
  });
