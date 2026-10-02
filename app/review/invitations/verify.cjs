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
const origin = option('--origin') ?? 'http://localhost:8087';
if (!workdir || !container) {
  process.stderr.write('Usage: node verify.cjs --workdir <repo> --container <supabase-db-container> [--origin http://localhost:8087]\n');
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
const emails = [1, 2, 3].map(() => `ui-invitation-${randomUUID()}@example.test`);
const messageIds = new Set();
const failures = [];
const pageErrors = [];
const acceptanceResponses = [];
let passed = 0;
let browser;
let stage = 'startup';

const check = (condition, label) => {
  if (!condition) throw new Error(label);
  passed += 1;
};

const waitForText = async (page, text, timeout = 30000) => {
  await page.getByText(text, { exact: true }).waitFor({ state: 'visible', timeout });
};

const waitForBodyText = async (page, text, timeout = 30000) => {
  await page.waitForFunction((expected) => document.body.innerText.includes(expected), text, { timeout });
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

async function submitEmailCode(page, email) {
  await page.getByLabel('Электронная почта', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Получить код', exact: true }).click();
  await waitForText(page, 'Введите код');
  const code = await captureCode(email);
  await page.getByLabel('Код из письма', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
}

async function signInAsTrainer(page, email, name) {
  stage = 'trainer-auth';
  await page.goto(`${origin}/auth/sign-in`, { waitUntil: 'networkidle', timeout: 90000 });
  await submitEmailCode(page, email);
  stage = 'trainer-welcome-start';
  await page.getByTestId('trainer-welcome-step-0').waitFor({ state: 'visible', timeout: 60000 });
  await page.getByRole('button', { name: 'Я тренер — начать', exact: true }).click();
  await page.getByTestId('trainer-welcome-step-1').waitFor({ state: 'visible' });
  stage = 'trainer-profile';
  await page.getByLabel('Имя', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await page.getByTestId('trainer-welcome-step-2').waitFor({ state: 'visible' });
  stage = 'trainer-hours';
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await page.getByTestId('trainer-welcome-step-3').waitFor({ state: 'visible' });
  stage = 'trainer-skip-client';
  await page.getByRole('button', { name: 'Добавлю позже', exact: true }).click();
  await page.getByTestId('trainer-welcome-step-4').waitFor({ state: 'visible', timeout: 60000 });
  await page.getByRole('button', { name: 'Перейти на главную', exact: true }).click();
  stage = 'trainer-client-route';
  await page.waitForURL(/\/workspace\/clients(?:\?.*)?$/, { timeout: 30000 });
  stage = 'trainer-client-add-button';
  await page.locator('[aria-label="Добавить клиента"]').first().waitFor({ state: 'visible' });
}

async function signInFromInvitation(page, email) {
  await page.getByRole('button', { name: 'Войти и подключиться', exact: true }).click();
  await page.getByLabel('Электронная почта', { exact: true }).waitFor({ state: 'visible' });
  await submitEmailCode(page, email);
}

async function readRenderedLink(page) {
  const text = await page.locator('body').innerText();
  const match = text.match(/\/invite\/([A-Za-z0-9_-]{43})(?:\b|$)/);
  if (!match) throw new Error('invitation-link-invalid');
  return `${origin}/invite/${match[1]}`;
}

async function waitForRenderedLink(page, previousToken = '') {
  await page.waitForFunction((previous) => {
    const match = document.body.innerText.match(/\/invite\/([A-Za-z0-9_-]{43})(?:\b|$)/);
    return Boolean(match && match[1] !== previous);
  }, previousToken, { timeout: 60000 });
  return readRenderedLink(page);
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
  delete from private.client_invitation_receipts where workspace_id = any(owned_workspace_ids);
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
  execFileSync('docker', ['exec', container, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', sql], { cwd: resolvedWorkdir, stdio: 'pipe' });
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
const watchPage = (page, label) => {
  page.on('pageerror', () => pageErrors.push({ label, type: 'pageerror', acceptEndpoint: false }));
  page.on('console', (message) => {
    if (!isAppError(message)) return;
    const location = message.location().url;
    pageErrors.push({ label, type: 'console', acceptEndpoint: location.includes('/rest/v1/rpc/accept_invitation') });
  });
  page.on('response', async (response) => {
    if (!response.url().includes('/rest/v1/rpc/accept_invitation')) return;
    const result = { status: response.status(), code: '', keys: [] };
    try {
      const body = await response.json();
      if (body && typeof body === 'object') {
        result.code = typeof body.code === 'string' ? body.code : '';
        result.keys = Object.keys(body).sort();
      }
    } catch {}
    acceptanceResponses.push(result);
  });
};

async function run() {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const contextTrainer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const trainer = await contextTrainer.newPage();
  watchPage(trainer, 'trainer');

  stage = 'trainer-onboarding';
  await signInAsTrainer(trainer, emails[0], 'Тренер приглашений');
  stage = 'create-first-client-open-sheet';
  await trainer.locator('[aria-label="Добавить клиента"]').first().click();
  await waitForText(trainer, 'Новый клиент');
  stage = 'create-first-client-submit';
  await trainer.getByLabel('Имя и фамилия', { exact: true }).fill('Клиент приглашения');
  await trainer.getByRole('button', { name: 'Создать карточку', exact: true }).click();
  await trainer.locator('[aria-label="Клиент приглашения"]').waitFor({ state: 'visible', timeout: 60000 });
  stage = 'open-first-client';
  await trainer.locator('[aria-label="Клиент приглашения"]').click();
  await trainer.waitForURL(/\/workspace\/client\/[a-f0-9-]+$/);
  stage = 'open-invitation-manager';
  await trainer.getByRole('button', { name: 'Пригласить', exact: true }).click();
  await waitForText(trainer, 'Подключить клиента');
  stage = 'issue-invitation';
  await trainer.getByRole('button', { name: 'Создать ссылку-приглашение', exact: true }).click();
  const firstLink = await waitForRenderedLink(trainer);
  const firstToken = new URL(firstLink).pathname.split('/').pop();
  stage = 'reissue-invitation';
  await trainer.getByRole('button', { name: 'Перевыпустить', exact: true }).click();
  const activeLink = await waitForRenderedLink(trainer, firstToken);
  check(firstLink !== activeLink, 'reissue-produces-new-bearer-link');

  const contextOther = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const other = await contextOther.newPage();
  watchPage(other, 'other');
  stage = 'reissued-link-rejected';
  await other.goto(firstLink, { waitUntil: 'networkidle', timeout: 90000 });
  await waitForText(other, 'Подключитесь к тренеру', 60000);
  stage = 'reissued-link-auth';
  await signInFromInvitation(other, emails[2]);
  stage = 'reissued-link-accept';
  await other.getByRole('button', { name: 'Подключиться', exact: true }).waitFor({ state: 'visible', timeout: 60000 });
  await other.getByRole('button', { name: 'Подключиться', exact: true }).click();
  await waitForBodyText(other, 'Приглашение недоступно', 60000);
  check(true, 'reissued-link-invalidates-previous-unused-link');

  const contextClient = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const client = await contextClient.newPage();
  watchPage(client, 'client');
  stage = 'client-acceptance';
  await client.goto(activeLink, { waitUntil: 'networkidle', timeout: 90000 });
  await waitForText(client, 'Подключитесь к тренеру', 60000);
  stage = 'client-auth';
  await signInFromInvitation(client, emails[1]);
  stage = 'client-after-auth-accept-button';
  await client.getByRole('button', { name: 'Подключиться', exact: true }).waitFor({ state: 'visible', timeout: 60000 });
  check(!/\/auth\/onboarding(?:$|\?)/.test(client.url()), 'invited-client-skips-trainer-onboarding');
  stage = 'client-accept-request';
  await client.getByRole('button', { name: 'Подключиться', exact: true }).click();
  stage = 'client-accept-success-state';
  await waitForText(client, 'Вы подключены к Тренер приглашений', 60000);
  stage = 'client-continue-account';
  await client.getByRole('button', { name: 'Перейти в аккаунт', exact: true }).click();
  stage = 'client-account-connected';
  await client.getByText('Ваш тренер: Тренер приглашений', { exact: true }).filter({ visible: true }).waitFor({ state: 'visible', timeout: 60000 });
  stage = 'client-account-reload';
  await client.reload({ waitUntil: 'networkidle', timeout: 90000 });
  await waitForBodyText(client, 'Ваш тренер: Тренер приглашений', 60000);
  check(true, 'client-explicitly-accepts-and-account-shows-trainer');

  stage = 'used-link-rejected-by-other-account';
  await other.goto(activeLink, { waitUntil: 'networkidle', timeout: 90000 });
  await waitForText(other, 'Подключитесь к тренеру', 60000);
  stage = 'used-link-accept';
  await other.getByRole('button', { name: 'Подключиться', exact: true }).click();
  await waitForBodyText(other, 'Приглашение недоступно', 60000);
  check(true, 'used-link-cannot-connect-a-different-account');

  stage = 'revoke-link';
  await trainer.goto(`${origin}/workspace/clients`, { waitUntil: 'networkidle', timeout: 90000 });
  stage = 'create-revoked-client-open-sheet';
  await trainer.locator('[aria-label="Добавить клиента"]').first().click();
  await waitForText(trainer, 'Новый клиент');
  stage = 'create-revoked-client-submit';
  await trainer.getByLabel('Имя и фамилия', { exact: true }).fill('Клиент отзыва');
  await trainer.getByRole('button', { name: 'Создать карточку', exact: true }).click();
  await trainer.locator('[aria-label="Клиент отзыва"]').waitFor({ state: 'visible', timeout: 60000 });
  stage = 'open-revoked-client';
  await trainer.locator('[aria-label="Клиент отзыва"]').click();
  await trainer.waitForURL(/\/workspace\/client\/[a-f0-9-]+$/);
  stage = 'open-revoke-manager';
  await trainer.getByRole('button', { name: 'Пригласить', exact: true }).click();
  await waitForText(trainer, 'Подключить клиента');
  stage = 'issue-revoked-link';
  await trainer.getByRole('button', { name: 'Создать ссылку-приглашение', exact: true }).click();
  const revokedLink = await waitForRenderedLink(trainer);
  stage = 'revoke-issued-link';
  const revokeResponsePromise = trainer.waitForResponse(
    (response) => response.url().includes('/rest/v1/rpc/revoke_client_invitation'),
    { timeout: 60000 },
  );
  await trainer.getByRole('button', { name: 'Отозвать ссылку', exact: true }).click();
  const revokeResponse = await revokeResponsePromise;
  if (!revokeResponse.ok()) throw new Error('revoke-request-failed');
  await trainer.waitForFunction(() => !document.body.innerText.includes('/invite/'), null, { timeout: 60000 });
  stage = 'revoked-link-unavailable';
  await other.goto(revokedLink, { waitUntil: 'networkidle', timeout: 90000 });
  stage = 'revoked-link-prompt';
  await waitForText(other, 'Подключитесь к тренеру', 60000);
  stage = 'revoked-link-accept-click';
  await other.getByRole('button', { name: 'Подключиться', exact: true }).click();
  stage = 'revoked-link-rejection';
  await waitForBodyText(other, 'Приглашение недоступно', 60000);
  check(true, 'revoked-link-is-unavailable');

  const unexpectedErrors = pageErrors.filter((entry) => entry.type === 'pageerror' || !entry.acceptEndpoint || !acceptanceResponses.some((response) => response.status === 500 && response.code === 'P0002'));
  check(unexpectedErrors.length === 0, 'no-browser-page-errors');
  await contextTrainer.close();
  await contextOther.close();
  await contextClient.close();
}

run()
  .then(async () => {
    await cleanup();
    await browser?.close();
    process.stdout.write(`PASS: ${passed} invitation checks completed\n`);
  })
  .catch(async () => {
    failures.push(`invitation-smoke-failed-at-${stage}`);
    const allPages = browser?.contexts().flatMap((context) => context.pages()) ?? [];
    const failedPage = [...allPages].reverse().find((page) => {
      try {
        return /^\/invite\/[A-Za-z0-9_-]{43}$/.test(new URL(page.url()).pathname);
      } catch {
        return false;
      }
    }) ?? allPages.at(-1);
    const failedPath = failedPage ? new URL(failedPage.url()).pathname : '';
    const failedBody = await failedPage?.locator('body').innerText().catch(() => '') ?? '';
    const safeFailure = failedPage && !failedPath.startsWith('/invite/') && !failedBody.includes('/invite/') && !/https?:\/\//.test(failedBody);
    if (stage === 'revoked-link-rejection' && failedPage) {
      const routeState = await failedPage.evaluate(() => ({
        path: location.pathname.startsWith('/invite/') ? 'invite' : location.pathname,
        headings: Array.from(document.querySelectorAll('h1,h2,[role="heading"]')).map((element) => element.textContent?.trim() ?? ''),
        visibleCopy: ['Подключитесь к тренеру', 'Приглашение недоступно', 'Не удалось выполнить действие', 'Проверяем приглашение', 'Загружаем…'].filter((copy) => document.body.innerText.includes(copy)),
      })).catch(() => ({ path: 'unknown', headings: [], visibleCopy: [] }));
      process.stderr.write(`SAFE_ACCEPT_DIAGNOSTIC: ${JSON.stringify({ routeState, responses: acceptanceResponses.slice(-2) })}\n`);
    }
    if (safeFailure && failedPath === '/workspace/clients') {
      const diagnostic = await failedPage.evaluate(() => ({
        headers: Array.from(document.querySelectorAll('h1,h2,[role="heading"]')).map((element) => element.textContent?.trim() ?? ''),
        buttons: Array.from(document.querySelectorAll('button,[role="button"]')).map((element) => ({
          label: element.getAttribute('aria-label') ?? '',
          text: element.textContent?.trim() ?? '',
        })),
      }));
      process.stderr.write(`SAFE_CLIENT_LIST_DIAGNOSTIC: ${JSON.stringify(diagnostic)}\n`);
    }
    if (safeFailure) {
      mkdirSync('/tmp/screens', { recursive: true });
      await failedPage.screenshot({ path: '/tmp/screens/invitations-failed-safe.png', fullPage: true }).catch(() => {});
    }
    try {
      await cleanup();
    } catch {
      failures.push('fixture-cleanup-failed');
    }
    await browser?.close();
    process.stderr.write(`FAIL: ${failures.join('; ')}\n`);
    process.exitCode = 1;
  });
