const { chromium, expect } = require('../../../node_modules/@playwright/test');
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
  process.stderr.write(
    'Usage: node verify.cjs --workdir <repo> --container <supabase-db-container> [--origin http://localhost:8088]\n',
  );
  process.exit(2);
}
const resolvedWorkdir = resolve(workdir);
const supabase = resolve(
  dirname(process.argv[1]),
  '../../node_modules/.bin/supabase',
);
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
  throw new Error('The origin must be a loopback URL');
if (!/^[A-Za-z0-9_.-]+$/.test(container))
  throw new Error('The container name is invalid');
process.chdir(resolvedWorkdir);
const config = JSON.parse(
  execFileSync(
    supabase,
    ['--workdir', resolvedWorkdir, 'status', '-o', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ),
);
if (
  !['localhost', '127.0.0.1'].includes(new URL(config.MAILPIT_URL).hostname) ||
  !['localhost', '127.0.0.1'].includes(new URL(config.API_URL).hostname)
)
  throw new Error('Test services must use loopback');
const mailpit = config.MAILPIT_URL.replace(/\/$/, '') + '/api/v1';
const email = `ui-client-schedule-${randomUUID()}@example.test`;
const messageIds = new Set();
const pageErrors = [];
let checks = 0;
let browser;
let activePage;
let stage = 'startup';

const check = (condition, label) => {
  if (!condition) {
    throw new Error(label);
  }
  checks += 1;
};
const visible = (locator) => locator.filter({ visible: true });
const waitForText = async (page, text, timeout = 30000) => {
  await visible(page.getByText(text, { exact: true })).waitFor({
    state: 'visible',
    timeout,
  });
};
const waitForBodyText = async (page, text, timeout = 30000) => {
  await page.waitForFunction(
    (expected) => document.body.innerText.includes(expected),
    text,
    { timeout },
  );
};
const clickButton = async (page, label) =>
  visible(page.getByRole('button', { name: label, exact: true })).click();
async function captureCode(targetEmail) {
  let message;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await fetch(`${mailpit}/messages`);
    if (!response.ok) throw new Error('mailpit-unavailable');
    const inbox = await response.json();
    message = inbox.messages.find((item) =>
      item.To.some((to) => to.Address === targetEmail),
    );
    if (message) break;
    await new Promise((delay) => setTimeout(delay, 250));
  }
  if (!message) throw new Error('mail-not-captured');
  messageIds.add(message.ID);
  const response = await fetch(
    `${mailpit}/message/${encodeURIComponent(message.ID)}`,
  );
  if (!response.ok) throw new Error('mailpit-message-unavailable');
  const body = await response.json();
  const match =
    body.HTML.match(/<strong[^>]*>(\d{6})<\/strong>/) ??
    body.Text.match(/\b(\d{6})\b/);
  if (!match) throw new Error('mail-code-unavailable');
  return match[1];
}
async function signInAsTrainer(page) {
  stage = 'trainer-auth';
  await page.goto(`${origin}/auth/sign-in`, {
    waitUntil: 'networkidle',
    timeout: 90000,
  });
  await page.getByLabel('Электронная почта', { exact: true }).fill(email);
  await clickButton(page, 'Получить код');
  await waitForText(page, 'Введите код');
  const code = await captureCode(email);
  await page.getByLabel('Код из письма', { exact: true }).fill(code);
  await clickButton(page, 'Продолжить');
  stage = 'welcome-role';
  await page
    .getByTestId('trainer-welcome-step-0')
    .waitFor({ state: 'visible', timeout: 60000 });
  await clickButton(page, 'Я тренер — начать');
  stage = 'welcome-profile';
  await page
    .getByTestId('trainer-welcome-step-1')
    .waitFor({ state: 'visible' });
  await page.getByLabel('Имя', { exact: true }).fill('Тренер расписания');
  await clickButton(page, 'Продолжить');
  stage = 'welcome-hours';
  await page
    .getByTestId('trainer-welcome-step-2')
    .waitFor({ state: 'visible' });
  await clickButton(page, 'Продолжить');
  stage = 'welcome-client';
  await page
    .getByTestId('trainer-welcome-step-3')
    .waitFor({ state: 'visible' });
  await clickButton(page, 'Добавлю позже');
  await page
    .getByTestId('trainer-welcome-step-4')
    .waitFor({ state: 'visible', timeout: 60000 });
  await clickButton(page, 'Перейти на главную');
  await page.waitForURL(/\/workspace\/clients(?:\?.*)?$/, { timeout: 30000 });
}
function sql(sqlText) {
  return execFileSync(
    'docker',
    [
      'exec',
      container,
      'psql',
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-c',
      sqlText,
    ],
    {
      cwd: resolvedWorkdir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  ).trim();
}

const names = ['Клиент Проверка', 'Скрытый Участник'];
let fixture;
const clientEmail = `ui-client-own-${randomUUID()}@example.test`;
const asUser = (id, statement) =>
  sql(
    `begin; set local role authenticated; set local request.jwt.claims='{"sub":"${id}","role":"authenticated"}'; ${statement}; commit;`,
  );
async function createFixture() {
  const workspace = sql(
    `select w.id from public.trainer_workspaces w join auth.users u on u.id=w.owner_user_id where u.email='${email}'`,
  );
  const owner = sql(
    `select owner_user_id from public.trainer_workspaces where id='${workspace}'`,
  );
  const ids = names.map(() => randomUUID());
  const account = await fetch(`${config.API_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.SERVICE_ROLE_KEY}`,
      apikey: config.SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: clientEmail, email_confirm: true }),
  });
  if (!account.ok)
    throw new Error(
      `Synthetic client account creation failed (${account.status})`,
    );
  const clientUser = (await account.json()).id;
  if (typeof clientUser !== 'string' || !/^[0-9a-f-]{36}$/.test(clientUser))
    throw new Error('Synthetic client account identity invalid');
  const template = randomUUID();
  const exercise = randomUUID();
  const date = sql(`select ((now() at time zone 'Asia/Almaty')::date+1)::text`);
  fixture = { workspace, owner, ids, clientUser, template, exercise, date };
  sql(
    `begin; insert into public.client_records(id,workspace_id,display_name,user_id) values ('${ids[0]}','${workspace}','${names[0]}',null),('${ids[1]}','${workspace}','${names[1]}',null); insert into public.exercises(id,workspace_id,name,muscle_group,equipment,measure,bodyweight) values ('${exercise}','${workspace}','Движение проверки','Ноги','вес тела','reps',true); insert into public.workout_templates(id,workspace_id,name,description) values ('${template}','${workspace}','Неизменный план','Синтетическая программа'); insert into public.template_exercises(workspace_id,template_id,exercise_id,position,planned_sets,planned_reps,rest_seconds) values ('${workspace}','${template}','${exercise}',0,3,'10',60); commit;`,
  );
  const revision = Number(
    sql(`select revision from public.workout_templates where id='${template}'`),
  );
  asUser(
    owner,
    `select public.create_booking_set_with_plan(array['${ids[0]}','${ids[1]}']::uuid[],'${date} 14:00+05','${date} 15:00+05',false,'${randomUUID()}','${template}',${revision})`,
  );
  fixture.booking = sql(
    `select id from public.bookings where client_record_id='${ids[0]}'`,
  );
  fixture.peer = sql(
    `select id from public.bookings where client_record_id='${ids[1]}'`,
  );
  fixture.original = sql(
    `select starts_at::text from public.bookings where id='${fixture.booking}'`,
  );
  createHistoryFixture();
  sql(
    `update public.client_records set user_id='${clientUser}' where id='${ids[0]}'`,
  );
  sql(
    `update public.workout_templates set name='Изменённый источник',revision=revision+1 where id='${template}'`,
  );
}
function createHistoryFixture() {
  const { workspace, owner, ids, exercise } = fixture;
  const past = sql(`select ((now() at time zone 'Asia/Almaty')::date-2)::text`);
  const histories = ['own', 'draft', 'peer'].map((kind) => ({
    kind,
    booking: randomUUID(),
    journal: randomUUID(),
    line: randomUUID(),
  }));
  const device = randomUUID();
  sql(
    `begin; ${histories.map((row) => `insert into public.bookings(id,workspace_id,client_record_id,starts_at,ends_at,status) values ('${row.booking}','${workspace}','${row.kind === 'peer' ? ids[1] : ids[0]}','${past} 18:00+05','${past} 19:00+05','confirmed'); insert into public.workout_instances(id,workspace_id,booking_id,client_record_id,started_at) values ('${row.journal}','${workspace}','${row.booking}','${row.kind === 'peer' ? ids[1] : ids[0]}','${past} 17:20+05'); insert into public.workout_exercises(id,workspace_id,workout_instance_id,exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,position,planned_sets,planned_reps,rest_seconds) values ('${row.line}','${workspace}','${row.journal}','${exercise}','${row.kind === 'own' ? 'Снимок истории' : row.kind === 'peer' ? 'Чужое движение' : 'Черновое движение'}','reps',false,'Ноги','Гантели',array['Сохранённая инструкция'],0,3,'8-10',60); insert into public.session_notes(id,workspace_id,workout_instance_id,text,author_user_id,device_id) values ('${randomUUID()}','${workspace}','${row.journal}','${row.kind === 'own' ? 'Открытая историческая заметка' : row.kind === 'peer' ? 'Чужая историческая заметка' : 'Черновая историческая заметка'}','${owner}','${device}');`).join(' ')} insert into public.set_results(id,workspace_id,workout_instance_id,workout_exercise_id,position,reps,weight_g,author_user_id,device_id) values ('${randomUUID()}','${workspace}','${histories[0].journal}','${histories[0].line}',0,8,20500,'${owner}','${device}'),('${randomUUID()}','${workspace}','${histories[0].journal}','${histories[0].line}',1,0,0,'${owner}','${device}'),('${randomUUID()}','${workspace}','${histories[0].journal}','${histories[0].line}',2,null,null,'${owner}','${device}'); insert into public.private_notes(id,workspace_id,workout_instance_id,text,author_user_id,device_id) values ('${randomUUID()}','${workspace}','${histories[0].journal}','Секретная историческая заметка','${owner}','${device}'); update public.workout_instances set finished_at='${past} 18:20+05' where id in ('${histories[0].journal}','${histories[2].journal}'); update public.exercises set name='Текущий каталог переименован' where id='${exercise}'; commit;`,
  );
  fixture.history = histories[0];
}
async function cleanup() {
  const owned = `select id from public.trainer_workspaces where owner_user_id in (select id from auth.users where email='${email}')`;
  try {
    sql(
      `begin; delete from private.booking_command_abandonments where workspace_id in (${owned}); delete from private.booking_creation_receipts where workspace_id in (${owned}); delete from private.booking_reschedule_receipts where workspace_id in (${owned}); delete from private.booking_status_command_receipts where workspace_id in (${owned}); delete from public.booking_program_exercises where workspace_id in (${owned}); delete from public.booking_programs where workspace_id in (${owned}); delete from public.schedule_proposals where workspace_id in (${owned}); delete from public.private_notes where workspace_id in (${owned}); delete from public.session_notes where workspace_id in (${owned}); delete from public.set_results where workspace_id in (${owned}); delete from public.workout_exercises where workspace_id in (${owned}); delete from public.workout_instances where workspace_id in (${owned}); delete from public.bookings where workspace_id in (${owned}); delete from public.group_sessions where workspace_id in (${owned}); delete from public.client_records where workspace_id in (${owned}); delete from public.template_exercises where workspace_id in (${owned}); delete from public.workout_templates where workspace_id in (${owned}); delete from public.exercises where workspace_id in (${owned}); delete from public.trainer_workspaces where id in (${owned}); delete from public.profiles where user_id in (select id from auth.users where email='${email}'); delete from auth.users where email='${email}' or id=${fixture?.clientUser ? `'${fixture.clientUser}'` : 'null'}; commit;`,
    );
  } catch (error) {
    const detail = error.stderr
      ? String(error.stderr).trim()
      : String(error.message);
    throw new Error(
      `Synthetic database cleanup failed: ${detail.slice(0, 1000)}`,
    );
  }
  for (const id of messageIds) {
    const response = await fetch(`${mailpit}/messages`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ IDs: [id] }),
    });
    if (!response.ok) throw new Error('Synthetic mail cleanup failed');
  }
}
async function loginClient(page) {
  await page.goto(`${origin}/auth/sign-in`, { waitUntil: 'networkidle' });
  await page.getByLabel('Электронная почта', { exact: true }).fill(clientEmail);
  await clickButton(page, 'Получить код');
  await waitForText(page, 'Введите код');
  await page
    .getByLabel('Код из письма', { exact: true })
    .fill(await captureCode(clientEmail));
  await clickButton(page, 'Продолжить');
  await page.waitForURL(/\/auth\/account$/, { timeout: 60000 });
  await page.goto(`${origin}/auth/account`, { waitUntil: 'networkidle' });
  await clickButton(page, 'Открыть занятия');
  await page.waitForURL(new RegExp(`/connection/${fixture.ids[0]}$`));
}
async function run() {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const trainerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  activePage = await trainerContext.newPage();
  activePage.on('pageerror', (error) =>
    pageErrors.push(String(error.message).slice(0, 240)),
  );
  await signInAsTrainer(activePage);
  await createFixture();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  activePage = page;
  page.on('pageerror', (error) =>
    pageErrors.push(String(error.message).slice(0, 240)),
  );
  stage = 'client-auth-open';
  await loginClient(page);
  await waitForBodyText(page, names[0]);
  await waitForBodyText(page, 'Неизменный план');
  const body = await page.locator('body').innerText();
  check(!body.includes(names[1]), 'group-peer-name-is-private');
  check(
    !body.includes('₸') && !body.includes('Осталось занятий'),
    'no-invented-client-finances',
  );
  check(!body.includes('Изменённый источник'), 'immutable-program-name');
  const revision = () =>
    Number(
      sql(`select revision from public.bookings where id='${fixture.booking}'`),
    );
  const reload = async () => {
    await page.reload({ waitUntil: 'networkidle' });
    await waitForBodyText(page, 'Неизменный план');
  };
  stage = 'client-confirm';
  await clickButton(page, 'Подтвердить');
  await expect
    .poll(() =>
      sql(`select status from public.bookings where id='${fixture.booking}'`),
    )
    .toBe('confirmed');
  check(
    sql(`select status from public.bookings where id='${fixture.peer}'`) ===
      'proposed',
    'confirm-own-booking-only',
  );
  const resolveLabel = 'Проверить результат и завершить запрос';
  const statusKey = `panda-trainer-pending-booking-status-v1:${fixture.clientUser}:${fixture.workspace}`;
  const proposalKey = `panda-trainer-pending-reschedule-v1:${fixture.clientUser}:${fixture.workspace}`;
  const injectPending = async (key, command) => {
    await page.evaluate(
      ({ key, command }) => localStorage.setItem(key, JSON.stringify(command)),
      { key, command },
    );
    await reload();
    await waitForText(page, resolveLabel);
  };
  const resolvePending = async (key, endpoint) => {
    const response = page.waitForResponse((result) =>
      result.url().endsWith(`/rest/v1/rpc/${endpoint}`),
    );
    await clickButton(page, resolveLabel);
    const result = await (await response).json();
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), key))
      .toBe(null);
    return result;
  };
  stage = 'client-resolve-stale-status';
  const staleStatus = {
    action: 'cancel',
    bookingId: fixture.booking,
    expectedRevision: 1,
    requestId: randomUUID(),
  };
  await injectPending(statusKey, staleStatus);
  const abandonedStatus = await resolvePending(
    statusKey,
    'resolve_booking_status_request',
  );
  check(
    abandonedStatus.outcome === 'abandoned' &&
      sql(
        `select status from public.bookings where id='${fixture.booking}'`,
      ) === 'confirmed',
    'resolve-stale-status-without-cancel',
  );
  check(
    sql(
      `select count(*) from private.booking_command_abandonments where request_id='${staleStatus.requestId}'`,
    ) === '1',
    'stale-status-request-durably-abandoned',
  );
  stage = 'client-resolve-succeeded-status';
  const confirmedRequest = sql(
    `select request_id from private.booking_status_command_receipts where workspace_id='${fixture.workspace}' and actor_user_id='${fixture.clientUser}' and command='confirm'`,
  );
  const confirmedRevision = revision();
  await injectPending(statusKey, {
    action: 'confirm',
    bookingId: fixture.booking,
    expectedRevision: 1,
    requestId: confirmedRequest,
  });
  const replayedStatus = await resolvePending(
    statusKey,
    'resolve_booking_status_request',
  );
  check(
    replayedStatus.outcome === 'succeeded' &&
      replayedStatus.result.replayed === true &&
      revision() === confirmedRevision,
    'resolve-applied-status-with-original-receipt',
  );
  stage = 'client-resolve-stale-proposal';
  const staleProposal = {
    action: 'propose',
    bookingId: fixture.booking,
    expectedBookingRevision: 1,
    proposedStartsAtUtc: new Date(
      `${fixture.date}T16:00:00+05:00`,
    ).toISOString(),
    requestId: randomUUID(),
  };
  await injectPending(proposalKey, staleProposal);
  const abandonedProposal = await resolvePending(
    proposalKey,
    'resolve_booking_reschedule_request',
  );
  check(
    abandonedProposal.outcome === 'abandoned' &&
      sql(
        `select count(*) from public.schedule_proposals where booking_id='${fixture.booking}'`,
      ) === '0',
    'resolve-stale-proposal-without-new-proposal',
  );
  check(
    sql(
      `select count(*) from private.booking_command_abandonments where request_id='${staleProposal.requestId}'`,
    ) === '1',
    'stale-proposal-request-durably-abandoned',
  );
  await reload();
  stage = 'client-propose-withdraw';
  const moveDate = sql(`select ('${fixture.date}'::date+1)::text`);
  const send = async (clock) => {
    const date = visible(page.getByLabel('Новая дата', { exact: true }));
    await expect(date).toBeEditable();
    await date.fill(moveDate);
    await visible(page.getByLabel('Начало', { exact: true })).fill(clock);
    await clickButton(page, 'Отправить предложение');
  };
  await clickButton(page, 'Предложить перенос');
  await send('16:00');
  await waitForBodyText(page, 'Отозвать запрос');
  check(
    sql(
      `select starts_at='${fixture.original}'::timestamptz from public.bookings where id='${fixture.booking}'`,
    ) === 't',
    'proposal-preserves-current-time',
  );
  await clickButton(page, 'Отозвать запрос');
  await expect
    .poll(() =>
      sql(
        `select count(*) from public.schedule_proposals where booking_id='${fixture.booking}' and status='pending'`,
      ),
    )
    .toBe('0');
  check(
    sql(
      `select count(*) from public.schedule_proposals where booking_id='${fixture.booking}' and status='withdrawn'`,
    ) === '1',
    'client-withdraw-recorded',
  );
  const propose = (clock) =>
    JSON.parse(
      asUser(
        fixture.owner,
        `select public.propose_booking_reschedule('${fixture.booking}',${revision()},'${moveDate} ${clock}+05','${randomUUID()}')`,
      ),
    );
  stage = 'client-counter';
  const counter = propose('16:00');
  await reload();
  await clickButton(page, 'Другое время');
  await send('17:00');
  await waitForBodyText(page, 'Отозвать запрос');
  check(
    sql(
      `select revision from public.schedule_proposals where id='${counter.proposal_id}'`,
    ) === '2',
    'client-counter-recorded',
  );
  await clickButton(page, 'Отозвать запрос');
  await expect
    .poll(() =>
      sql(
        `select status from public.schedule_proposals where id='${counter.proposal_id}'`,
      ),
    )
    .toBe('withdrawn');
  stage = 'client-decline';
  const declined = propose('16:00');
  await reload();
  await clickButton(page, 'Отклонить');
  await expect
    .poll(() =>
      sql(
        `select status from public.schedule_proposals where id='${declined.proposal_id}'`,
      ),
    )
    .toBe('declined');
  check(
    sql(
      `select starts_at='${fixture.original}'::timestamptz from public.bookings where id='${fixture.booking}'`,
    ) === 't',
    'decline-preserves-booking',
  );
  stage = 'client-accept';
  const accepted = propose('16:00');
  await reload();
  await clickButton(page, 'Принять');
  await expect
    .poll(() =>
      sql(
        `select status from public.schedule_proposals where id='${accepted.proposal_id}'`,
      ),
    )
    .toBe('accepted');
  check(
    sql(
      `select group_session_id is null from public.bookings where id='${fixture.booking}'`,
    ) === 't',
    'accept-detaches-own-participant',
  );
  check(
    sql(
      `select starts_at='${fixture.original}'::timestamptz and status='proposed' and group_session_id is not null from public.bookings where id='${fixture.peer}'`,
    ) === 't',
    'peer-unchanged-after-all-actions',
  );
  await reload();
  check(
    sql(
      `select name from public.booking_programs where booking_id='${fixture.booking}'`,
    ) === 'Неизменный план',
    'accepted-move-keeps-program',
  );
  stage = 'client-program';
  await page.goto(`${origin}/connection/${fixture.ids[0]}/program`, {
    waitUntil: 'networkidle',
  });
  await waitForText(page, 'Движение проверки');
  check(
    (await page.locator('body').innerText()).includes('Неизменный план'),
    'program-reads-own-booking-snapshot',
  );
  check(
    !(await page.locator('body').innerText()).includes(
      'Текущий каталог переименован',
    ),
    'program-snapshot-survives-catalog-change',
  );
  await clickButton(page, 'Движение проверки');
  await waitForText(
    page,
    'Подсказка тренера по этому упражнению пока не добавлена.',
  );
  check(
    !(await page.locator('body').innerText()).includes('Личный рекорд'),
    'program-detail-does-not-invent-results',
  );
  await page.goto(`${origin}/connection/${fixture.ids[0]}`, {
    waitUntil: 'networkidle',
  });
  await waitForBodyText(page, 'Неизменный план');
  stage = 'client-cancel';
  await clickButton(page, 'Отменить запись');
  await waitForText(page, 'Отменить запись?');
  await visible(
    page.getByRole('button', { name: 'Отменить запись', exact: true }),
  )
    .last()
    .click();
  await expect
    .poll(() =>
      sql(`select status from public.bookings where id='${fixture.booking}'`),
    )
    .toBe('cancelled_by_client');
  await page.reload({ waitUntil: 'networkidle' });
  check(
    !(await page.locator('body').innerText()).includes('Неизменный план'),
    'cancelled-booking-hidden-after-reload',
  );
  mkdirSync('/tmp/screens/client-scheduling', { recursive: true });
  await page.screenshot({
    path: '/tmp/screens/client-scheduling/after-cancel.png',
    fullPage: true,
  });
  stage = 'client-history';
  await clickButton(page, 'История занятий');
  await page.waitForURL(new RegExp(`/connection/${fixture.ids[0]}/history$`));
  await waitForBodyText(page, 'Открытая историческая заметка');
  const historyBody = await page.locator('body').innerText();
  check(
    !historyBody.includes('Черновая историческая заметка'),
    'draft-journal-hidden',
  );
  check(
    !historyBody.includes('Чужая историческая заметка') &&
      !historyBody.includes(names[1]),
    'peer-journal-hidden',
  );
  check(
    !historyBody.includes('Секретная историческая заметка'),
    'private-note-hidden',
  );
  check(
    !historyBody.includes('Списания и возвраты') && !historyBody.includes('₸'),
    'no-invented-history-charges',
  );
  await visible(page.getByRole('button', { name: /17:20/ })).click();
  await waitForBodyText(page, 'Снимок истории');
  await waitForBodyText(page, '20,5 кг');
  await waitForBodyText(page, '8 повт.');
  await waitForBodyText(page, '0 повт.');
  await waitForBodyText(page, '0 кг');
  await waitForBodyText(page, 'Повторы не записаны');
  await waitForBodyText(page, 'Вес не записан');
  const detail = await page.locator('body').innerText();
  check(
    !detail.includes('Черновое движение') && !detail.includes('Чужое движение'),
    'only-own-finished-exercises',
  );
  check(
    !detail.includes('Текущий каталог переименован'),
    'historical-exercise-snapshot-retained',
  );
  check(
    detail.includes('8 повт.') && detail.includes('20,5 кг'),
    'actual-historical-set-values',
  );
  check(
    detail.includes('0 повт.') &&
      detail.includes('0 кг') &&
      detail.includes('Повторы не записаны') &&
      detail.includes('Вес не записан'),
    'null-and-zero-values-distinct',
  );
  check(
    sql(
      `select finished_at is not null and client_record_id='${fixture.ids[0]}'::uuid from public.workout_instances where id='${fixture.history.journal}'`,
    ) === 't',
    'prelink-history-remains-on-same-card',
  );
  await page.screenshot({
    path: '/tmp/screens/client-scheduling/history-detail.png',
    fullPage: true,
  });
  stage = 'client-progress';
  await page.goto(`${origin}/connection/${fixture.ids[0]}/progress`, {
    waitUntil: 'networkidle',
  });
  await waitForText(page, 'Снимок истории');
  await waitForBodyText(page, '20,5 кг × 8 повт');
  const progressBody = await page.locator('body').innerText();
  check(
    progressBody.includes('20,5 кг × 8 повт'),
    'progress-own-actual-best-set',
  );
  check(
    !progressBody.includes('Чужое движение') &&
      !progressBody.includes('Черновое движение'),
    'progress-excludes-peer-and-draft',
  );
  check(
    !progressBody.includes('Посещения за неделю') &&
      !progressBody.includes('₸'),
    'progress-does-not-invent-attendance-or-finances',
  );
  await page.screenshot({
    path: '/tmp/screens/client-scheduling/progress.png',
    fullPage: true,
  });
  stage = 'account-switch';
  await page.goto(`${origin}/auth/account`, { waitUntil: 'networkidle' });
  await clickButton(page, 'Сменить аккаунт');
  await page.waitForURL(/\/auth\/sign-in$/);
  await page.goto(`${origin}/connection/${fixture.ids[0]}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForURL(/\/auth\/sign-in$/);
  check(
    !(await page.locator('body').innerText()).includes(names[0]),
    'signed-out-route-hides-client-data',
  );
  check(pageErrors.length === 0, 'no-browser-errors');
  await context.close();
  await trainerContext.close();
}
run()
  .then(async () => {
    await cleanup();
    await browser?.close();
    process.stdout.write(`PASS: ${checks} client schedule checks completed\n`);
  })
  .catch(async (error) => {
    process.stderr.write(
      `FAIL stage=${stage} name=${error.name} message=${String(error.message).slice(0, 300)}\n`,
    );
    try {
      mkdirSync('/tmp/screens/client-scheduling', { recursive: true });
      await activePage?.screenshot({
        path: '/tmp/screens/client-scheduling/failure.png',
        fullPage: true,
      });
      process.stderr.write(
        (await activePage?.locator('body').innerText()).slice(0, 1800) + '\n',
      );
    } catch {}
    try {
      await cleanup();
    } catch {
      process.stderr.write('Synthetic cleanup failed\n');
    }
    await browser?.close();
    process.exitCode = 1;
  });
