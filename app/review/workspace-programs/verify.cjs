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
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) throw new Error('The origin must be a loopback URL');
if (!/^[A-Za-z0-9_.-]+$/.test(container)) throw new Error('The container name is invalid');
process.chdir(resolvedWorkdir);
const config = JSON.parse(execFileSync(supabase, ['--workdir', resolvedWorkdir, 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
if (!['localhost', '127.0.0.1'].includes(new URL(config.MAILPIT_URL).hostname) || !['localhost', '127.0.0.1'].includes(new URL(config.API_URL).hostname)) throw new Error('Test services must use loopback');
const mailpit = config.MAILPIT_URL.replace(/\/$/, '') + '/api/v1';
const email = `ui-program-${randomUUID()}@example.test`;
const clientName = `Программа ${randomUUID().slice(0, 7)}`;
const templateNames = [`План А ${randomUUID().slice(0, 7)}`, `План Б ${randomUUID().slice(0, 7)}`];
const secondExercise = `Упражнение ${randomUUID().slice(0, 7)}`;
const messageIds = new Set();
const pageErrors = [];
let checks = 0;
let browser;
let stage = 'startup';
let failedCheck = null;
let clientId = null;
let templateIds = [];
let allowOneAbortedRpcConsoleError = false;
const networkEvents = [];

const check = (condition, label) => {
  if (!condition) {
    failedCheck = label;
    throw new Error(label);
  }
  checks += 1;
};
const visible = (locator) => locator.filter({ visible: true });
const waitForText = async (page, text, timeout = 30000) => {
  await visible(page.getByText(text, { exact: true })).waitFor({ state: 'visible', timeout });
};
const waitForBodyText = async (page, text, timeout = 30000) => {
  await page.waitForFunction((expected) => document.body.innerText.includes(expected), text, { timeout });
};
const clickButton = async (page, label) => visible(page.getByRole('button', { name: label, exact: true })).click();
async function captureCode(targetEmail) {
  let message;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await fetch(`${mailpit}/messages`);
    if (!response.ok) throw new Error('mailpit-unavailable');
    const inbox = await response.json();
    message = inbox.messages.find((item) => item.To.some((to) => to.Address === targetEmail));
    if (message) break;
    await new Promise((delay) => setTimeout(delay, 250));
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
  await clickButton(page, 'Получить код');
  await waitForText(page, 'Введите код');
  const code = await captureCode(email);
  await page.getByLabel('Код из письма', { exact: true }).fill(code);
  await clickButton(page, 'Продолжить');
  stage = 'welcome-role';
  await page.getByTestId('trainer-welcome-step-0').waitFor({ state: 'visible', timeout: 60000 });
  await clickButton(page, 'Я тренер — начать');
  stage = 'welcome-profile';
  await page.getByTestId('trainer-welcome-step-1').waitFor({ state: 'visible' });
  await page.getByLabel('Имя', { exact: true }).fill('Тренер программ');
  await clickButton(page, 'Продолжить');
  stage = 'welcome-hours';
  await page.getByTestId('trainer-welcome-step-2').waitFor({ state: 'visible' });
  await clickButton(page, 'Продолжить');
  stage = 'welcome-client';
  await page.getByTestId('trainer-welcome-step-3').waitFor({ state: 'visible' });
  await clickButton(page, 'Добавлю позже');
  await page.getByTestId('trainer-welcome-step-4').waitFor({ state: 'visible', timeout: 60000 });
  await clickButton(page, 'Перейти на главную');
  await page.waitForURL(/\/workspace\/clients(?:\?.*)?$/, { timeout: 30000 });
}
function sql(sqlText) {
  return execFileSync('docker', ['exec', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', sqlText], { cwd: resolvedWorkdir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function ownedIds() {
  const result = sql(`select json_build_object('workspace', w.id, 'client', c.id)::text from public.trainer_workspaces w join auth.users u on u.id = w.owner_user_id left join public.client_records c on c.workspace_id = w.id and c.display_name = '${clientName.replaceAll("'", "''")}' where u.email = '${email}' limit 1`);
  return result ? JSON.parse(result) : null;
}
function programSnapshots() {
  const ids = ownedIds();
  if (!ids?.client) return [];
  const result = sql(`select coalesce(json_agg(json_build_object('id', p.id, 'name', p.name, 'base_template_id', p.base_template_id, 'base_template_revision', p.base_template_revision, 'exercises', (select json_agg(json_build_object('exercise_name_snapshot', e.exercise_name_snapshot, 'measure_snapshot', e.measure_snapshot, 'planned_sets', e.planned_sets, 'planned_reps', e.planned_reps, 'planned_seconds', e.planned_seconds, 'position', e.position) order by e.position) from public.client_program_exercises e where e.workspace_id = p.workspace_id and e.client_program_id = p.id)) order by p.created_at, p.id), '[]'::json)::text from public.client_programs p where p.workspace_id = '${ids.workspace}' and p.client_record_id = '${ids.client}'`);
  return JSON.parse(result || '[]');
}
function assignmentReceiptCount() {
  const ids = ownedIds();
  if (!ids?.workspace) return 0;
  return Number(sql(`select count(*) from private.program_assignment_receipts where workspace_id = '${ids.workspace}'`));
}
async function createTemplate(page, index, exercise) {
  const name = templateNames[index];
  stage = `create-template-${index + 1}`;
  await clickButton(page, 'Создать шаблон');
  await page.waitForURL(/\/workspace\/library\/editor(?:\?.*)?$/, { timeout: 30000 });
  await page.getByRole('textbox', { name: 'Название шаблона', exact: true }).fill(name);
  await clickButton(page, 'Добавить упражнения');
  await page.getByRole('textbox', { name: 'Поиск упражнений для шаблона', exact: true }).fill(exercise);
  await clickButton(page, exercise);
  await visible(page.getByRole('button', { name: /^Готово/ })).click();
  await page.getByRole('textbox', { name: 'Поиск упражнений для шаблона', exact: true }).waitFor({ state: 'hidden' });
  await clickButton(page, 'Сохранить шаблон');
  await page.waitForURL(/\/workspace\/library\/template\/[a-f0-9-]+(?:\?.*)?$/, { timeout: 60000 });
  await waitForBodyText(page, name, 60000);
  const templateId = new URL(page.url()).pathname.split('/').at(-1);
  check(Boolean(templateId), `template-${index + 1}-saved`);
  templateIds[index] = templateId;
  return { name, exercise };
}
async function cleanup() {
  const quotedEmail = `'${email}'`;
  const quotedName = `'${clientName.replaceAll("'", "''")}'`;
  const cleanupSql = `begin; do $cleanup$ declare owned_workspace_ids uuid[]; begin select coalesce(array_agg(id), '{}') into owned_workspace_ids from public.trainer_workspaces where owner_user_id in (select id from auth.users where email = ${quotedEmail}); delete from public.client_program_exercises where workspace_id = any(owned_workspace_ids); delete from public.client_programs where workspace_id = any(owned_workspace_ids); delete from private.program_assignment_receipts where workspace_id = any(owned_workspace_ids); delete from public.template_exercises where workspace_id = any(owned_workspace_ids); delete from public.workout_templates where workspace_id = any(owned_workspace_ids); delete from private.template_command_receipts where workspace_id = any(owned_workspace_ids); delete from private.client_creation_receipts where workspace_id = any(owned_workspace_ids); delete from public.client_records where workspace_id = any(owned_workspace_ids) and display_name = ${quotedName}; delete from public.exercises where workspace_id = any(owned_workspace_ids) and not exists (select 1 from public.template_exercises te where te.workspace_id = exercises.workspace_id and te.exercise_id = exercises.id); delete from public.trainer_workspaces where id = any(owned_workspace_ids); delete from public.profiles where user_id in (select id from auth.users where email = ${quotedEmail}); delete from auth.users where email = ${quotedEmail}; end $cleanup$; commit;`;
  execFileSync('docker', ['exec', container, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', cleanupSql], { cwd: resolvedWorkdir, stdio: 'pipe' });
  for (const id of messageIds) {
    const response = await fetch(`${mailpit}/messages`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [id] }) });
    if (!response.ok) throw new Error('Synthetic mail cleanup failed');
  }
}
const isAppError = (message) => message.type() === 'error' && !(message.location().url === `${origin}/favicon.ico` && message.text() === 'Failed to load resource: the server responded with a status of 404 (Not Found)');
async function run() {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', () => pageErrors.push('pageerror'));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (/^\/rest\/v1\/(rpc\/create_client_record|client_records)$/.test(url.pathname)) {
      const event = { method: response.request().method(), path: url.pathname, status: response.status() };
      networkEvents.push(event);
      if (url.pathname.endsWith('/rpc/create_client_record') && !response.ok()) {
        void response.json().then((body) => {
          if (typeof body?.code === 'string' && /^[0-9A-Z]{5}$/.test(body.code)) event.code = body.code;
        }).catch(() => {});
      }
    }
  });
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (/^\/rest\/v1\/(rpc\/create_client_record|client_records)$/.test(url.pathname)) {
      networkEvents.push({ method: request.method(), path: url.pathname, failed: true });
    }
  });
  page.on('console', (message) => {
    if (!isAppError(message)) return;
    const intentionalAbort = allowOneAbortedRpcConsoleError &&
      /\/rest\/v1\/rpc\/assign_client_program/.test(message.location().url) &&
      /net::ERR_FAILED|Failed to load resource/.test(message.text());
    if (intentionalAbort) {
      allowOneAbortedRpcConsoleError = false;
      return;
    }
    pageErrors.push('console-error');
  });
  await signInAsTrainer(page);
  stage = 'open-client-sheet';
  await visible(page.getByRole('button', { name: 'Добавить клиента', exact: true })).first().click();
  stage = 'fill-client-name';
  await page.getByRole('textbox', { name: 'Имя и фамилия', exact: true }).fill(clientName);
  stage = 'submit-client';
  await clickButton(page, 'Создать карточку');
  stage = 'wait-created-client';
  await waitForText(page, clientName, 60000);
  const clientCard = visible(page.getByRole('button', { name: clientName, exact: true }));
  await clientCard.click();
  await page.waitForURL(/\/workspace\/client\/[a-f0-9-]+(?:\?.*)?$/, { timeout: 30000 });
  clientId = new URL(page.url()).pathname.split('/').at(-1);
  check(Boolean(clientId), 'synthetic-client-created');
  stage = 'open-client-program-tab';
  await visible(page.getByRole('tab', { name: 'Программа', exact: true })).click();
  await waitForText(page, 'Открыть библиотеку');
  stage = 'open-assignment-library';
  await clickButton(page, 'Открыть библиотеку');
  await page.waitForURL(/\/workspace\/library\?[^#]*clientId=[a-f0-9-]+[^#]*tab=templates|\/workspace\/library\?[^#]*tab=templates[^#]*clientId=[a-f0-9-]+/, { timeout: 30000 });
  await visible(page.getByRole('button', { name: 'Шаблоны', exact: false })).click();
  await waitForText(page, 'Создать шаблон');
  const first = await createTemplate(page, 0, 'Приседания со штангой');
  stage = 'assign-first-template';
  await page.goto(`${origin}/workspace/client/${clientId}?tab=program`, { waitUntil: 'networkidle', timeout: 90000 });
  await waitForText(page, 'Открыть библиотеку', 60000);
  await clickButton(page, 'Открыть библиотеку');
  await page.waitForURL(/\/workspace\/library\?[^#]*clientId=[a-f0-9-]+/, { timeout: 30000 });
  await visible(page.getByRole('button', { name: 'Шаблоны', exact: false })).click();
  await page.getByRole('textbox', { name: 'Поиск шаблонов', exact: true }).fill(first.name);
  await visible(page.getByRole('button', { name: new RegExp(first.name) })).first().click();
  await page.waitForURL(/\/workspace\/library\/template\/[a-f0-9-]+/, { timeout: 30000 });
  let firstAssignRequests = 0;
  let firstRequestId = null;
  let firstRpcResult = null;
  let resolveInterceptDone;
  let rejectInterceptDone;
  const interceptDone = new Promise((resolvePromise, rejectPromise) => {
    resolveInterceptDone = resolvePromise;
    rejectInterceptDone = rejectPromise;
  });
  const interceptFirstAssignment = async (route) => {
    firstAssignRequests += 1;
    if (firstAssignRequests === 1) {
      try {
        const requestBody = route.request().postDataJSON();
        firstRequestId = requestBody.p_request_id;
        const response = await route.fetch();
        firstRpcResult = await response.json();
        if (!response.ok() || !firstRpcResult?.id || firstRpcResult.replayed !== false) {
          throw new Error('First assignment RPC did not commit as expected');
        }
        await route.abort('failed');
        resolveInterceptDone({ requestId: firstRequestId, result: firstRpcResult });
      } catch (error) {
        rejectInterceptDone(error);
        await route.abort('failed').catch(() => {});
      }
      return;
    }
    await route.continue();
  };
  await page.route(/\/rest\/v1\/rpc\/assign_client_program(?:\?|$)/, interceptFirstAssignment);
  allowOneAbortedRpcConsoleError = true;
  await clickButton(page, 'Назначить программу');
  let interceptTimeout;
  const intercepted = await Promise.race([
    interceptDone,
    new Promise((_, reject) => {
      interceptTimeout = setTimeout(() => reject(new Error('Assignment RPC did not finish interception')), 30000);
    }),
  ]).finally(() => clearTimeout(interceptTimeout));
  await page.unroute(/\/rest\/v1\/rpc\/assign_client_program(?:\?|$)/, interceptFirstAssignment);
  await waitForText(page, 'Повторить назначение', 30000);
  await page.goto(`${origin}/workspace/client/${clientId}?tab=program`, { waitUntil: 'networkidle', timeout: 90000 });
  await waitForText(page, 'Продолжить назначение', 60000);
  const committedBeforeReplay = programSnapshots();
  check(firstAssignRequests === 1 && intercepted.requestId === firstRequestId && firstRpcResult.replayed === false && committedBeforeReplay.length === 1 && assignmentReceiptCount() === 1, 'ambiguous-assignment-committed-once-before-retry');
  stage = 'retry-open-pending-template';
  await clickButton(page, 'Продолжить назначение');
  await page.waitForURL(/\/workspace\/library\/template\/[a-f0-9-]+/, { timeout: 30000 });
  await waitForText(page, 'Повторить назначение', 30000);
  stage = 'retry-submit';
  const replayResponsePromise = page.waitForResponse((response) => /\/rest\/v1\/rpc\/assign_client_program(?:\?|$)/.test(response.url()), { timeout: 30000 });
  await clickButton(page, 'Повторить назначение');
  stage = 'retry-wait-rpc-response';
  const replayResponse = await replayResponsePromise;
  const replayBody = await replayResponse.json();
  const retryRequestId = replayResponse.request().postDataJSON().p_request_id;
  check(replayResponse.ok(), 'retry-rpc-succeeds');
  check(retryRequestId === firstRequestId, 'retry-reuses-request-id');
  check(replayBody.id === firstRpcResult.id, 'retry-replays-same-program-id');
  check(replayBody.replayed === true, 'retry-response-is-server-replay');
  stage = 'retry-wait-client-details';
  await page.waitForURL(new RegExp(`/workspace/client/${clientId}\\?tab=program`), { timeout: 60000 });
  await waitForBodyText(page, first.name, 60000);
  await waitForText(page, first.exercise, 60000);
  const firstSnapshot = programSnapshots();
  check(firstSnapshot.length === 1 && firstSnapshot[0].name === first.name && assignmentReceiptCount() === 1, 'replayed-assignment-resolves-with-one-program-and-receipt');
  stage = 'reload-first-assignment';
  await page.reload({ waitUntil: 'networkidle', timeout: 90000 });
  await waitForBodyText(page, first.name, 60000);
  await waitForText(page, first.exercise, 60000);
  check(JSON.stringify(programSnapshots()) === JSON.stringify(firstSnapshot), 'first-assignment-survives-reload');
  stage = 'open-library-for-second-template';
  await clickButton(page, 'Открыть библиотеку');
  await page.waitForURL(/\/workspace\/library\?[^#]*clientId=[a-f0-9-]+/, { timeout: 30000 });
  await visible(page.getByRole('button', { name: 'Упражнения', exact: false })).click();
  await page.getByRole('textbox', { name: 'Поиск упражнений', exact: true }).fill(secondExercise);
  await clickButton(page, `Создать своё: «${secondExercise}»`);
  await waitForText(page, secondExercise, 60000);
  await visible(page.getByRole('button', { name: 'Шаблоны', exact: false })).click();
  await waitForText(page, 'Создать шаблон');
  const second = await createTemplate(page, 1, secondExercise);
  stage = 'assign-second-template';
  await page.goto(`${origin}/workspace/client/${clientId}?tab=program`, { waitUntil: 'networkidle', timeout: 90000 });
  await waitForText(page, 'Открыть библиотеку', 60000);
  await clickButton(page, 'Открыть библиотеку');
  await page.waitForURL(/\/workspace\/library\?[^#]*clientId=[a-f0-9-]+/, { timeout: 30000 });
  await visible(page.getByRole('button', { name: 'Шаблоны', exact: false })).click();
  await page.getByRole('textbox', { name: 'Поиск шаблонов', exact: true }).fill(second.name);
  await visible(page.getByRole('button', { name: new RegExp(second.name) })).first().click();
  await page.waitForURL(/\/workspace\/library\/template\/[a-f0-9-]+/, { timeout: 30000 });
  await clickButton(page, 'Назначить программу');
  await page.waitForURL(new RegExp(`/workspace/client/${clientId}\\?tab=program`), { timeout: 60000 });
  await waitForBodyText(page, second.name, 60000);
  await waitForText(page, second.exercise, 60000);
  const snapshots = programSnapshots();
  check(snapshots.length === 2, 'second-assignment-creates-new-program');
  check(snapshots[0].id !== snapshots[1].id, 'assignments-have-distinct-program-ids');
  check(JSON.stringify(snapshots[0]) === JSON.stringify(firstSnapshot[0]), 'older-program-snapshot-remains-unchanged');
  check(snapshots[1].name === second.name && snapshots[1].exercises[0].exercise_name_snapshot === second.exercise, 'second-program-snapshots-selected-template');
  stage = 'reload-second-assignment';
  await page.reload({ waitUntil: 'networkidle', timeout: 90000 });
  await waitForBodyText(page, second.name, 60000);
  await waitForText(page, second.exercise, 60000);
  check(pageErrors.length === 0, 'no-browser-page-errors');
  mkdirSync('/tmp/screens/workspace-programs', { recursive: true });
  await page.screenshot({ path: '/tmp/screens/workspace-programs/assigned-second-program.png', fullPage: true });
  await context.close();
}
run()
  .then(async () => {
    await cleanup();
    await browser?.close();
    process.stdout.write(`PASS: ${checks} workspace program assignment checks completed\n`);
  })
  .catch(async (caught) => {
    const pages = browser?.contexts().flatMap((context) => context.pages()) ?? [];
    const page = pages.at(-1);
    let diagnosticClientCount = null;
    try {
      diagnosticClientCount = Number(sql(`select count(*) from public.client_records c join public.trainer_workspaces w on w.id = c.workspace_id join auth.users u on u.id = w.owner_user_id where u.email = '${email}' and c.display_name = '${clientName.replaceAll("'", "''")}'`));
    } catch {}
    if (page) {
      const safe = await page.evaluate(() => ({
        path: location.pathname.replace(/\/workspace\/client\/[a-f0-9-]+/, '/workspace/client/:id'),
        headings: Array.from(document.querySelectorAll('h1,h2,[role=heading]')).map((element) => element.textContent?.trim() ?? ''),
        visibleButtons: Array.from(document.querySelectorAll('[role=button],button')).filter((element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0).map((element) => (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)),
        alerts: Array.from(document.querySelectorAll('[role=alert]')).filter((element) => element.getBoundingClientRect().width > 0).map((element) => element.textContent?.trim() ?? ''),
      })).catch(() => ({ path: 'unknown', headings: [], visibleButtons: [] }));
      const failureMessage = String(caught?.message ?? caught)
        .replaceAll(email, '[synthetic-email]')
        .replaceAll(clientName, '[synthetic-client]')
        .replaceAll(secondExercise, '[synthetic-exercise]')
        .replaceAll(templateNames[0], '[synthetic-template-a]')
        .replaceAll(templateNames[1], '[synthetic-template-b]')
        .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '[uuid]')
        .replace(/\s+/g, ' ')
        .slice(0, 500);
      process.stderr.write(`SAFE_ROUTE_DIAGNOSTIC: ${JSON.stringify({ ...safe, networkEvents, diagnosticClientCount, failedCheck, failureName: caught?.name ?? 'Error', failureMessage })}\n`);
      mkdirSync('/tmp/screens/workspace-programs', { recursive: true });
      await page.screenshot({ path: '/tmp/screens/workspace-programs/failure-safe.png', fullPage: true }).catch(() => {});
    }
    process.stderr.write(`workspace-program-smoke-failed-at-${stage}\n`);
    await browser?.close();
    try { await cleanup(); } catch { process.stderr.write('Synthetic fixture cleanup failed.\n'); }
    process.exitCode = 1;
  });
