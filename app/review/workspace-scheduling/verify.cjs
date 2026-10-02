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
const email = `ui-schedule-${randomUUID()}@example.test`;
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
  await page.getByLabel('Имя', { exact: true }).fill('Тренер расписания');
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

const names = ['Участник Альфа', 'Участник Бета', 'Раннее занятие'];
let fixture;
function createFixture() {
  const workspace = sql(`select w.id from public.trainer_workspaces w join auth.users u on u.id=w.owner_user_id where u.email='${email}'`);
  const ids = names.map(() => randomUUID());
  const group = randomUUID();
  const bookings = ids.map(() => randomUUID());
  const date = sql(`select (now() at time zone 'Asia/Almaty')::date`);
  sql(`begin; insert into public.client_records(id,workspace_id,display_name) values ${ids.map((id,i)=>`('${id}','${workspace}','${names[i]}')`).join(',')}; insert into public.group_sessions(id,workspace_id,starts_at,ends_at) values ('${group}','${workspace}','${date} 18:00:00+05','${date} 19:00:00+05'); insert into public.bookings(id,workspace_id,client_record_id,group_session_id,starts_at,ends_at,status) values ${bookings.map((id,i)=>`('${id}','${workspace}','${ids[i]}',${i<2?`'${group}'`:'null'},'${date} ${i<2?'18':'09'}:00:00+05','${date} ${i<2?'19':'10'}:00:00+05','confirmed')`).join(',')}; commit;`);
  const template = randomUUID();
  const exercise = randomUUID();
  sql(`begin; insert into public.exercises(id,workspace_id,name,muscle_group,equipment,measure,bodyweight) values ('${exercise}','${workspace}','Тестовое движение','Ноги','вес тела','reps',true); insert into public.workout_templates(id,workspace_id,name,description) values ('${template}','${workspace}','План занятия','Синтетическая программа'); insert into public.template_exercises(workspace_id,template_id,exercise_id,position,planned_sets,planned_reps,rest_seconds) values ('${workspace}','${template}','${exercise}',0,3,'10',60); commit;`);
  fixture = {workspace, bookings, ids, template, exercise, templateRevision:Number(sql(`select revision from public.workout_templates where id='${template}'`))};
}
async function cleanup() {
  const owned = `select id from public.trainer_workspaces where owner_user_id in (select id from auth.users where email='${email}')`;
  sql(`begin; delete from private.booking_status_command_receipts where workspace_id in (${owned}); delete from public.booking_program_exercises where workspace_id in (${owned}); delete from public.booking_programs where workspace_id in (${owned}); delete from public.bookings where workspace_id in (${owned}); delete from public.group_sessions where workspace_id in (${owned}); delete from public.client_records where workspace_id in (${owned}); delete from public.template_exercises where workspace_id in (${owned}); delete from public.workout_templates where workspace_id in (${owned}); delete from public.exercises where workspace_id in (${owned}); delete from public.trainer_workspaces where id in (${owned}); delete from public.profiles where user_id in (select id from auth.users where email='${email}'); delete from auth.users where email='${email}'; commit;`);
  for(const id of messageIds) {
    const response=await fetch(`${mailpit}/messages`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({IDs:[id]})});
    if(!response.ok) throw new Error('Synthetic mail cleanup failed');
  }
}
async function run() {
  browser = await chromium.launch({headless:true,channel:'chrome'});
  const context = await browser.newContext({viewport:{width:390,height:844}});
  const page = await context.newPage();
  activePage = page;
  page.on('pageerror',error=>pageErrors.push(error.name));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const location = message.location().url;
    if (location === `${origin}/favicon.ico` && /404/.test(message.text())) return;
    pageErrors.push('console-error');
  });
  await signInAsTrainer(page);
  createFixture();
  stage='schedule-read';
  await page.goto(`${origin}/auth/account`,{waitUntil:'networkidle'});
  await clickButton(page,'Открыть расписание');
  await page.waitForURL(/\/workspace\/schedule$/);
  await waitForBodyText(page,names[2]);
  await waitForBodyText(page,names[0]);
  await waitForBodyText(page,names[1]);
  const body=await page.locator('body').innerText();
  check(body.indexOf(names[2])<body.indexOf(names[0]),'real-bookings-chronological');
  check(!/Дана|Мади|Арман|Айгерим/.test(body),'no-demo-clients');
  check(await page.getByRole('button',{name:'Добавить занятие на выбранный день',exact:true}).isEnabled(),'creation-enabled');
  await page.getByText('Мини-группа',{exact:true}).first().click();
  await clickButton(page,`Отменить участие: ${names[0]}`);
  await page.waitForFunction(()=>!document.body.innerText.includes('Отменить участие: Участник Альфа'));
  const state=JSON.parse(sql(`select json_agg(json_build_object('id',id,'status',status) order by id) from public.bookings where workspace_id='${fixture.workspace}'`));
  check(state.find(item=>item.id===fixture.bookings[0]).status==='cancelled_by_trainer','participant-cancellation-committed');
  check(state.find(item=>item.id===fixture.bookings[1]).status==='confirmed','other-participant-survives');
  await page.reload({waitUntil:'networkidle'});
  await waitForBodyText(page,names[1]);
  check(page.url().endsWith('/workspace/schedule'),'no-demo-journal-navigation');
  await clickButton(page,'Следующая неделя');
  await waitForBodyText(page,'День свободен');
  check(!(await page.locator('body').innerText()).includes(names[2]),'next-week-has-no-old-bookings');
  await clickButton(page,'Предыдущая неделя');
  await waitForBodyText(page,names[2]);
  check(true,'previous-week-restores-real-bookings');
  stage='create-selected-plan';
  const futureDate=sql(`select ((now() at time zone 'Asia/Almaty')::date + 1)::text`);
  await page.goto(`${origin}/workspace/new?date=${futureDate}&start=14%3A00`,{waitUntil:'networkidle'});
  await waitForText(page,'Кто занимается');
  await visible(page.getByText(names[0],{exact:true})).click();
  await visible(page.getByText(names[1],{exact:true})).click();
  await clickButton(page,'Продолжить');
  await waitForText(page,'Начало');
  await clickButton(page,'75 мин');
  await clickButton(page,'Продолжить');
  await visible(page.getByText('План занятия',{exact:true})).click();
  await clickButton(page,'Создать занятие');
  await page.waitForURL(/\/workspace\/schedule\?date=/,{timeout:30000});
  await waitForBodyText(page,names[1]);
  const created=JSON.parse(sql(`select json_agg(json_build_object('id',b.id,'client',b.client_record_id,'duration',extract(epoch from (b.ends_at-b.starts_at))/60,'status',b.status,'name',p.name,'revision',p.base_template_revision,'sets',e.planned_sets) order by b.id) from public.bookings b join public.booking_programs p on p.booking_id=b.id join public.booking_program_exercises e on e.booking_program_id=p.id where b.workspace_id='${fixture.workspace}'`));
  check(created.length===2,'group-created-with-two-snapshots');
  check(created.every(item=>item.duration===75&&item.status==='proposed'&&item.name==='План занятия'&&item.revision===fixture.templateRevision&&item.sets===3),'selected-plan-duration-and-values-persist');
  check(new Set(created.map(item=>item.client)).size===2,'selected-participants-persist');
  sql(`update public.workout_templates set name='Изменённый источник',revision=revision+1 where id='${fixture.template}'`);
  await page.reload({waitUntil:'networkidle'});
  await waitForBodyText(page,names[1]);
  check(sql(`select count(*) from public.booking_programs where workspace_id='${fixture.workspace}' and name='План занятия'`)==='2','booking-retains-immutable-plan');
  check(pageErrors.length===0,'no-browser-page-errors');
  mkdirSync('/tmp/screens/workspace-scheduling',{recursive:true});
  await page.screenshot({path:'/tmp/screens/workspace-scheduling/schedule-after-cancel.png',fullPage:true});
  await context.close();
}
run().then(async()=>{await cleanup();await browser?.close();process.stdout.write(`PASS: ${checks} workspace schedule checks completed\n`);}).catch(async(error)=>{process.stderr.write(`FAIL stage=${stage} name=${error.name} message=${String(error.message).slice(0,300)}\n`);try{mkdirSync('/tmp/screens/workspace-scheduling',{recursive:true});await activePage?.screenshot({path:'/tmp/screens/workspace-scheduling/failure.png',fullPage:true});process.stderr.write((await activePage?.locator('body').innerText()).slice(0,1800)+'\n');}catch{}try{await cleanup();}catch{process.stderr.write('Synthetic cleanup failed\n');}await browser?.close();process.exitCode=1;});
