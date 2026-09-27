import { test as base, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// No personal Chrome profile, shared storageState, or direct Store mutations.
// Fonts are served locally. External font services must not be needed.
const test = base.extend<{ runtimeErrors: string[] }>({
  runtimeErrors: [async ({ page, context }, use) => {
    const errors: string[] = [];
    const observe = (tab: Page) => {
      tab.on('pageerror', error => errors.push(error.message));
      tab.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    };
    observe(page);
    context.on('page', observe);
    await context.route('https://fonts.googleapis.com/**', route => route.abort());
    await context.route('https://fonts.gstatic.com/**', route => route.abort());
    await use(errors);
    expect(errors, 'No uncaught runtime or application console errors').toEqual([]);
  }, { auto: true }],
});

test('journal conflict: stale tab keeps drafts in downloadable copy without overwriting saved facts', async ({ page, context }, info) => {
  await home(page);
  await openDana(page);
  // These two real tabs intentionally share storage within this test only.
  const stale = await context.newPage();
  await home(stale);
  await openDana(stale);

  await firstSet(page).click();
  await page.getByLabel('Вес, кг', { exact: true }).fill('32,5');
  await page.getByLabel('Повторы', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Записать подход', exact: true }).click();
  await expect(page.locator('.setrow__today').first()).toContainText('32,5 кг');

  await firstSet(stale).click();
  const sheet = stale.getByRole('dialog');
  await sheet.getByLabel('Вес, кг', { exact: true }).fill('25');
  await sheet.getByLabel('Повторы', { exact: true }).fill('6');
  await expect(sheet.getByRole('alert')).toContainText('Журнал изменён в другой вкладке');
  const exportButton = sheet.getByRole('button', { name: 'Скачать копию журнала', exact: true });
  await expect(exportButton).toBeInViewport();
  await stale.screenshot({ path: info.outputPath('journal-conflict.png'), fullPage: true, animations: 'disabled' });
  await info.attach('journal-conflict', { path: info.outputPath('journal-conflict.png'), contentType: 'image/png' });
  const downloadEvent = stale.waitForEvent('download');
  await exportButton.click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('journal-s1.json');
  expect(await download.failure()).toBeNull();
  const copyPath = info.outputPath(download.suggestedFilename());
  await download.saveAs(copyPath);
  const copy = JSON.parse(await readFile(copyPath, 'utf8'));
  expect(copy).toMatchObject({ version: 1, sessionId: 's1', finished: false, source: 'trainer-prototype-local-journal' });
  expect(copy.drafts.c5.e1[0]).toEqual({ kg: '25', reps: '6' });
  expect(copy.values.c5?.e1?.[0] ?? null).toBeNull();

  await sheet.getByRole('button', { name: 'Записать только в этой вкладке', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(stale.locator('.setrow__today').first()).toContainText('25 кг');
  await stale.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  await expect(stale.getByRole('dialog')).toHaveCount(0);
  await expect(stale.locator('.log-completed')).toHaveCount(0);
  await expect(stale.locator('.log-recovery')).toContainText('Автоматическое объединение не поддерживается');

  // Reload a fresh view to verify the stale draft never replaced the first tab's fact.
  await page.reload();
  await openDana(page);
  await expect(page.locator('.session-journal')).toContainText('1/12');
  await firstSet(page).click();
  await expect(page.getByLabel('Вес, кг', { exact: true })).toHaveValue('32.5');
  await expect(page.getByLabel('Повторы', { exact: true })).toHaveValue('10');
});

async function home(page: Page, now = '08:00') {
  await page.goto(`/?now=${now}`);
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true, level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

test('local typography: real fonts load without CDN; trainer and client captures', async ({ page }, info) => {
  const external: string[] = [];
  page.on('request', request => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) external.push(request.url());
  });
  await home(page);
  const faces = await page.evaluate(() => Array.from(document.fonts).map(face => ({ family: face.family, status: face.status })));
  expect(faces).toEqual(expect.arrayContaining([
    { family: 'Inter', status: 'loaded' }, { family: 'Montserrat', status: 'loaded' },
  ]));
  const timeGap = await page.locator('.today-entry.is-expanded').evaluate(el => {
    const range = document.createRange();
    range.selectNodeContents(el.querySelector('.today-entry__time time')!);
    return el.querySelector('.today-entry__main')!.getBoundingClientRect().left - range.getBoundingClientRect().right;
  });
  expect(timeGap, 'Loaded Montserrat time has space before the name').toBeGreaterThanOrEqual(10);
  for (const role of ['Тренер', 'Клиент']) {
    await page.getByRole('group', { name: 'Роль', exact: true }).getByRole('button', { name: role, exact: true }).click();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    const name = role === 'Тренер' ? 'trainer-home' : 'client-home';
    await page.screenshot({ path: info.outputPath(`${name}.png`), animations: 'disabled' });
    await info.attach(name, { path: info.outputPath(`${name}.png`), contentType: 'image/png' });
    if (role === 'Клиент') {
      const when = page.locator('.hero-card__when');
      expect(await when.evaluate(el => el.scrollWidth <= el.clientWidth), 'Session time fits the card').toBe(true);
      for (const row of await page.locator('.client-request__dates dd').all()) {
        expect(await row.evaluate(el => el.scrollWidth <= el.clientWidth), 'Each proposed/current time fits its column').toBe(true);
      }
      await page.locator('.client-package').scrollIntoViewIfNeeded();
      await expect(page.locator('.client-package')).toBeInViewport();
      await page.screenshot({ path: info.outputPath('client-package.png'), animations: 'disabled' });
      await info.attach('client-package', { path: info.outputPath('client-package.png'), contentType: 'image/png' });
    }
  }
  expect(external).toEqual([]);
});

async function openDana(page: Page) {
  const dock = page.getByRole('button', { name: /^Вернуться к тренировке: Дана/ });
  if (await dock.count()) await dock.click();
  else await page.getByRole('button', { name: /^(Начать тренировку|Продолжить тренировку|Посмотреть результаты)$/ }).click();
  await expect(page.locator('.session-journal h1')).toContainText('Дана');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('client secondary: program, history, progress and profile remain readable', async ({ page }, info) => {
  await home(page);
  await page.getByRole('group', { name: 'Роль', exact: true }).getByRole('button', { name: 'Клиент', exact: true }).click();
  for (const [label, name] of [['Программа', 'program'], ['История', 'history'], ['Прогресс', 'progress'], ['Профиль', 'profile']]) {
    await page.locator('.tabbar').getByRole('button', { name: label, exact: true }).click();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`client-${name}.png`), animations: 'disabled' });
    await info.attach(`client-${name}`, { path: info.outputPath(`client-${name}.png`), contentType: 'image/png' });
    await expect(page.getByRole('heading', { name: label, exact: true, level: 1 })).toBeVisible();
    if (name === 'program') {
      await page.locator('.client-program').getByRole('button', { name: /Планка/ }).click();
      await expect(page.getByRole('dialog')).toContainText('45 сек');
      await expect(page.getByRole('dialog')).not.toContainText('45 повт');
      await page.keyboard.press('Escape');
      await expect(page.locator('.client-program').getByRole('button', { name: /Планка/ })).toBeFocused();
    }
    if (name === 'progress') {
      await expect(page.locator('.progress-chart')).toContainText('19 авг — 9 сен');
      await page.getByRole('button', { name: 'Румынская тяга', exact: true }).click();
      await expect(page.locator('.progress-summary')).toContainText('60');
      await expect(page.getByRole('button', { name: 'Румынская тяга', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await page.locator('.progress-table').scrollIntoViewIfNeeded();
      await expect(page.locator('.progress-table tbody tr')).toHaveCount(4);
      await page.screenshot({ path: info.outputPath('client-progress-records.png'), animations: 'disabled' });
      await info.attach('client-progress-records', { path: info.outputPath('client-progress-records.png'), contentType: 'image/png' });
    }
    if (name === 'profile') {
      const amount = page.locator('.client-details--payment dd');
      expect(await amount.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await expect(page.locator('.client-profile [data-act="toast"]')).toHaveCount(0);
      await page.locator('.client-profile').getByRole('button', { name: 'Уведомления', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('Ваш запрос на перенос');
      await expect(page.getByRole('dialog')).not.toContainText('Арман');
      await page.keyboard.press('Escape');
    }
  }
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#toolbar [data-act="scenario"][data-s="empty"]').click();
  await page.setViewportSize(viewport);
  for (const [label, title] of [['Программа', 'Программа появится здесь'], ['История', 'Списаний пока нет'], ['Прогресс', 'Первые результаты — впереди'], ['Профиль', 'Пакета пока нет']]) {
    await page.locator('.tabbar').getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    if (label === 'Программа' || label === 'Прогресс') {
      const art = page.locator('.client-empty__art');
      await expect.poll(() => art.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
      const name = label === 'Программа' ? 'client-empty-program' : 'client-empty-progress';
      await page.screenshot({ path: info.outputPath(`${name}.png`), animations: 'disabled' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await page.screenshot({ path: info.outputPath('client-empty-profile.png'), animations: 'disabled' });
  await info.attach('client-empty-profile', { path: info.outputPath('client-empty-profile.png'), contentType: 'image/png' });
  for (const state of ['loading', 'offline']) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator(`#toolbar [data-act="scenario"][data-s="${state}"]`).click();
    await page.setViewportSize(viewport);
    await page.locator('.tabbar').getByRole('button', { name: 'Программа', exact: true }).click();
    if (state === 'loading') await expect(page.getByRole('status', { name: 'Загрузка раздела' })).toBeVisible();
    else await expect(page.locator('.client-offline')).toBeVisible();
  }
  // Actual late-day bookings; no attendance or package operation is invented.
  await home(page, '20:30');
  await page.getByRole('group', { name: 'Роль', exact: true }).getByRole('button', { name: 'Клиент', exact: true }).click();
  await page.locator('.tabbar').getByRole('button', { name: 'История', exact: true }).click();
  await expect(page.locator('.client-history__entry').first()).toBeVisible();
  await expect(page.locator('.client-history__entry').first()).toContainText('Нет отметки');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('client-history-ledger.png'), animations: 'disabled' });
});

test('visual inventory: trainer reference screens and client card open without errors', async ({ page }, info) => {
  await home(page);
  const viewport = page.viewportSize()!;
  for (const id of ['t-schedule', 't-new', 't-inbox', 't-clients', 't-client', 't-library', 't-template', 't-billing', 't-invite', 't-profile']) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator(`#rail [data-act="nav.go"][data-id="${id}"]`).click();
    await page.setViewportSize(viewport);
    await expect(page.locator('#screen')).not.toContainText('Ошибка экрана');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`${id}.png`), animations: 'disabled' });
    await info.attach(id, { path: info.outputPath(`${id}.png`), contentType: 'image/png' });
    if (id === 't-clients') {
      await page.locator('[data-act="client.open"][data-id="c1"]').click();
      await expect(page.locator('.screen')).toContainText('Айгерим');
    }
    if (id === 't-client') {
      const title = page.locator('.trainer-bookings .row__title').first();
      expect(await title.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.getByRole('button', { name: 'Прогресс', exact: true }).click();
      await expect(page.locator('.progress-table')).toContainText('82,5');
    }
    if (id === 't-library') {
      await page.locator('[data-act="template.open"][data-id="t2"]').click();
      await expect(page.getByRole('heading', { name: 'Верх Б', exact: true })).toBeVisible();
      await expect(page.locator('.reference-screen')).toContainText('Жим гантелей под углом');
      await expect(page.locator('.reference-screen')).not.toContainText('Приседания со штангой');
    }
    if (id === 't-profile') {
      await expect(page.getByRole('button', { name: 'Настройки', exact: true })).toHaveCount(0);
      await expect(page.locator('.reference-screen')).toContainText('Пока недоступны');
    }
  }
});

function firstSet(page: Page) {
  return page.locator('.session-journal [data-act="sheet.open"][data-id="setlog"]').first();
}

test('quick entry: confirm, undo, deviation and correction without losing the set context', async ({ page }, info) => {
  await home(page);
  await openDana(page);
  const quick = (index: number) => page.locator(`[data-act="setlog.quick"][data-ex="e1"][data-si="${index}"]`);
  const edit = (index: number) => page.locator(`[data-act="sheet.open"][data-id="setlog"][data-ex="e1"][data-si="${index}"]`);
  const capture = async (name: string) => {
    await page.screenshot({ path: info.outputPath(`${name}.png`), animations: 'disabled' });
    await info.attach(name, { path: info.outputPath(`${name}.png`), contentType: 'image/png' });
  };
  for (const target of [quick(0), edit(0)]) {
    const box = (await target.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  const boxes = await page.locator('.setrow--quick').evaluateAll(rows => rows.every(row => row.scrollWidth <= row.clientWidth));
  expect(boxes, 'Quick rows fit without horizontal overflow').toBe(true);
  await capture('quick-start');
  await quick(0).press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(edit(0)).toBeFocused();
  await expect(page.locator('.setrow__today').first()).toContainText('50 кг');
  await expect(page.locator('.log-context')).toContainText('1/12');
  await page.getByRole('button', { name: 'Отменить запись', exact: true }).click();
  await expect(quick(0)).toBeFocused();
  await expect(page.locator('.log-context')).toContainText('0/12');
  await quick(0).click();
  await capture('quick-saved');
  await edit(1).click();
  await page.getByLabel('Вес, кг', { exact: true }).fill('52,5');
  await page.getByLabel('Повторы', { exact: true }).fill('8');
  await page.getByRole('button', { name: 'Записать подход', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Отменить запись', exact: true })).toHaveCount(0);
  await quick(2).click();
  await expect(page.locator('.log-context')).toContainText('3/12');
  await capture('quick-three-sets');
  await edit(0).click();
  await page.getByLabel('Вес, кг', { exact: true }).fill('47,5');
  await page.getByRole('button', { name: 'Записать подход', exact: true }).click();
  await expect(page.locator('.setrow__today').first()).toContainText('47,5 кг');
  await page.reload();
  await openDana(page);
  await expect(page.locator('.log-context')).toContainText('3/12');
  await expect(page.locator('.setrow__today').nth(0)).toContainText('47,5 кг');
  await expect(page.locator('.setrow__today').nth(1)).toContainText('52,5 кг');
  await expect(page.locator('.setrow__today').nth(2)).toContainText('50 кг');
  // A short viewport is layout evidence only, not an emulation of an iOS keyboard.
  if (info.project.name.startsWith('mobile')) {
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 667 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Завершить тренировку', exact: true })).toBeInViewport();
    await capture('quick-short');
  }
});

test('workout dock: minimize, browse sections, resume position and draft, reload and finish', async ({ page }, info) => {
  await home(page);
  await expect(page.locator('.workout-dock')).toHaveCount(0);
  await openDana(page);
  await page.locator('[data-act="setlog.quick"]').first().click();
  const lastSet = () => page.locator('.session-journal [data-id="setlog"]').last();
  await lastSet().click();
  await page.locator('[data-log-field="reps"]').fill('35');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  const body = page.locator('.session-journal .screen__body');
  const position = await body.evaluate(el => el.scrollTop);
  expect(position).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Свернуть тренировку' }).click();
  const resume = page.getByRole('button', { name: /^Вернуться к тренировке:/ });
  await expect(resume).toBeFocused();
  await expect(resume).toContainText('Дана');
  await expect(resume).toContainText('1 из 12');
  await expect(resume).toContainText('Есть черновик');
  await page.screenshot({ path: info.outputPath('workout-minimized.png'), animations: 'disabled' });
  for (const tab of ['Расписание', 'Клиенты', 'Профиль']) {
    await page.locator('.tabbar').getByRole('button', { name: tab, exact: true }).click();
    await expect(resume).toBeInViewport();
    const dock = (await page.locator('.workout-dock').boundingBox())!;
    const nav = (await page.locator('.tabbar').boundingBox())!;
    expect(dock.y + dock.height).toBeLessThanOrEqual(nav.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: info.outputPath('workout-profile-dock.png'), animations: 'disabled' });
  await page.locator('.tabbar').getByRole('button', { name: 'Клиенты', exact: true }).click();
  await page.locator('[data-act="client.open"]').first().click();
  await expect(resume).toBeInViewport();
  await page.screenshot({ path: info.outputPath('workout-client-card-dock.png'), animations: 'disabled' });
  await resume.click();
  await expect(page.locator('.workout-dock')).toHaveCount(0);
  expect(await body.evaluate(el => el.scrollTop)).toBeCloseTo(position, 0);
  await lastSet().click();
  await expect(page.locator('[data-log-field="reps"]')).toHaveValue('35');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Свернуть тренировку' }).click();
  if (info.project.name === 'desktop') {
    await page.getByRole('button', { name: 'Широкий', exact: true }).click();
    await expect(page.locator('.wide .workout-dock')).toBeVisible();
    await resume.click();
    await page.getByRole('button', { name: 'Свернуть тренировку' }).click();
  }
  await page.reload();
  await expect(resume).toContainText('Есть черновик');
  await page.getByRole('group', { name: 'Роль', exact: true }).getByRole('button', { name: 'Клиент', exact: true }).click();
  await expect(page.locator('.workout-dock')).toHaveCount(0);
  await page.getByRole('group', { name: 'Роль', exact: true }).getByRole('button', { name: 'Тренер', exact: true }).click();
  await resume.click();
  await expect(page.locator('.log-context')).toContainText('1/12');
  await lastSet().click();
  await expect(page.locator('[data-log-field="reps"]')).toHaveValue('35');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить записанное и завершить' }).click();
  await page.getByRole('button', { name: 'Вернуться к расписанию', exact: true }).click();
  await expect(page.locator('.workout-dock')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.workout-dock')).toHaveCount(0);
});

test('workout dock group: minimize preserves selected participant and separate drafts', async ({ page }, info) => {
  await home(page, '20:30');
  await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  await firstSet(page).click();
  await page.getByLabel('Вес, кг', { exact: true }).fill('77,5');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: /^Дана 0\/12/ }).click();
  await firstSet(page).click();
  await page.getByLabel('Вес, кг', { exact: true }).fill('8,');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Свернуть тренировку' }).click();
  const resume = page.getByRole('button', { name: /^Вернуться к тренировке:/ });
  await expect(resume).toContainText('Черновики: 2 участн.');
  await expect(resume).toContainText('20:00');
  await expect(resume).toContainText('Мини-группа');
  await expect(resume).toContainText('Дана');
  await page.screenshot({ path: info.outputPath('workout-group-dock.png'), animations: 'disabled' });
  await resume.click();
  await expect(page.locator('.pcard.is-on')).toContainText('Дана');
  await firstSet(page).click();
  await expect(page.getByLabel('Вес, кг', { exact: true })).toHaveValue('8,');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Алия 0\/16/ }).click();
  await firstSet(page).click();
  await expect(page.getByLabel('Вес, кг', { exact: true })).toHaveValue('77,5');
});

test('workout UX: multiple sets, correction, leave and return, partial results', async ({ page }, info) => {
  const capture = async (name: string) => {
    await page.screenshot({ path: info.outputPath(`${name}.png`), animations: 'disabled' });
    await info.attach(name, { path: info.outputPath(`${name}.png`), contentType: 'image/png' });
  };
  await home(page);
  await openDana(page);
  expect((await page.locator('.log-progress .meter').boundingBox())!.width).toBeGreaterThan(100);
  await capture('personal-start');
  for (const [index, kg, reps] of [[0, '20', '12'], [1, '22,5', '10']] as const) {
    await page.locator('.session-journal [data-id="setlog"]').nth(index).click();
    await page.getByLabel('Вес, кг', { exact: true }).fill(kg);
    await page.getByLabel('Повторы', { exact: true }).fill(reps);
    await page.getByRole('button', { name: 'Записать подход', exact: true }).click();
    await expect(page.locator('.log-action-status')).toHaveText(`Подход ${index + 1} записан · Дана`);
    await expect(page.locator('.toast.is-on')).toHaveCount(0);
  }
  await capture('personal-saved');
  await firstSet(page).click();
  await expect(page.getByLabel('Вес, кг', { exact: true })).toHaveValue('20');
  await page.getByLabel('Вес, кг', { exact: true }).fill('21');
  await page.getByRole('button', { name: 'Записать подход', exact: true }).click();
  await expect(page.locator('.setrow__today').first()).toContainText('21 кг');
  await page.locator('.session-journal [data-id="setlog"]').last().click();
  await page.keyboard.press('Escape');
  const journalBody = page.locator('.session-journal .screen__body');
  const scrollBeforeLeave = await journalBody.evaluate(el => el.scrollTop);
  expect(scrollBeforeLeave).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Свернуть тренировку' }).click();
  await openDana(page);
  expect(await journalBody.evaluate(el => el.scrollTop)).toBeCloseTo(scrollBeforeLeave, 0);
  await expect(page.locator('.log-context')).toBeInViewport();
  await expect(page.locator('.session-journal')).toContainText('2/12');
  await capture('personal-return');
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('2 из 12');
  await capture('personal-review');
  await page.getByRole('button', { name: 'Сохранить записанное и завершить' }).click();
  await expect(page.locator('.log-completed')).toBeInViewport();
  await expect(firstSet(page)).toHaveCount(0);
  await expect(page.locator('.toast.is-on')).toHaveCount(0);
  await capture('personal-results');
});

test('workout UX: group context and draft survive switching and completion review', async ({ page }, info) => {
  const capture = async (name: string) => {
    await page.screenshot({ path: info.outputPath(`${name}.png`), animations: 'disabled' });
    await info.attach(name, { path: info.outputPath(`${name}.png`), contentType: 'image/png' });
  };
  await home(page, '20:30');
  await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  const strip = page.locator('.pstrip');
  expect(await strip.evaluate(el => el.scrollWidth <= el.clientWidth), 'All three participants fit without horizontal scrolling').toBe(true);
  await capture('group-start');
  await firstSet(page).click();
  await page.getByLabel('Вес, кг', { exact: true }).fill('77,5');
  await page.getByLabel('Повторы', { exact: true }).fill('8');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: /^Дана 0\/12/ }).click();
  await expect(page.locator('.log-context')).toContainText('Участие пока не подтверждено');
  await firstSet(page).click();
  await page.getByLabel('Вес, кг', { exact: true }).fill('20');
  await page.getByLabel('Повторы', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Записать подход', exact: true }).click();
  await page.getByRole('button', { name: /^Алия 0\/16/ }).click();
  await expect(page.locator('.log-action-status')).toBeEmpty();
  await expect(firstSet(page)).toHaveAccessibleName('Продолжить подход 1: Приседания со штангой');
  await expect(page.locator('.log-draft-label').first()).toHaveText('Черновик');
  await capture('group-draft-return');
  await firstSet(page).click();
  await expect(page.getByLabel('Вес, кг', { exact: true })).toHaveValue('77,5');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Мади Не участвует/ }).click();
  await expect(firstSet(page)).toHaveCount(0);
  await expect(page.locator('.session-journal')).not.toContainText('0/13');
  await expect(page.locator('.log-context')).toContainText('Участник: Мади');
  await capture('group-cancelled');
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('черновиков: 1');
  await expect(page.getByRole('dialog')).toContainText('1 из 12');
  await capture('group-review');
  await page.getByRole('button', { name: 'Продолжить ввод', exact: true }).click();
  await page.getByRole('button', { name: /^Алия 0\/16/ }).click();
  await firstSet(page).click();
  await page.getByRole('button', { name: 'Записать подход', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить записанное и завершить' }).click();
  await expect(page.locator('.log-completed')).toBeVisible();
  await capture('group-results');
});

test('journal: direct start, validation, draft reload, explicit save, completion', async ({ page }) => {
  await home(page);
  await openDana(page);
  await expect(page.locator('.session-journal')).toContainText('0/12');
  await firstSet(page).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toHaveAccessibleName(/Дана/);
  await sheet.getByRole('button', { name: 'Записать подход', exact: true }).click();
  await expect(sheet.getByRole('alert')).toBeVisible();
  await sheet.getByLabel('Вес, кг', { exact: true }).fill('8,5');
  await sheet.getByLabel('Повторы', { exact: true }).fill('12');
  await page.reload();
  await openDana(page);
  await expect(page.locator('.session-journal')).toContainText('0/12');
  await firstSet(page).click();
  await expect(sheet.getByLabel('Вес, кг', { exact: true })).toHaveValue('8,5');
  await expect(sheet.getByLabel('Повторы', { exact: true })).toHaveValue('12');
  await sheet.getByLabel('Вес, кг', { exact: true }).press('Enter');
  await expect(sheet.getByLabel('Повторы', { exact: true })).toBeFocused();
  await sheet.getByLabel('Повторы', { exact: true }).press('Enter');
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('.setrow__today').first()).toContainText('8,5 кг');
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Завершить журнал?' })).toContainText('1 из 12');
  await page.getByRole('button', { name: 'Сохранить записанное и завершить' }).click();
  await expect(page.locator('.log-completed')).toContainText('Журнал завершён');
  await expect(firstSet(page)).toHaveCount(0);
  await page.reload();
  // Completed appointments are no longer the expanded "next" entry.
  await page.getByRole('button', { name: 'Занятие Дана, 09:00–10:00', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Посмотреть результаты' }).click();
  await expect(page.locator('.log-completed')).toBeVisible();
  await expect(page.locator('.setrow__today').first()).toContainText('8,5 кг');
});

test('sheet: keyboard containment, Escape and return focus; narrow viewport capture', async ({ page }, info) => {
  await home(page);
  await openDana(page);
  await firstSet(page).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(sheet.getByRole('button', { name: 'Записать подход', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(sheet.getByRole('button', { name: 'Закрыть', exact: true })).toBeFocused();
  await expect(sheet).toBeInViewport();
  await expect(sheet.getByRole('button', { name: 'Записать подход', exact: true })).toBeInViewport();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow, 'No document-level horizontal overflow').toBe(false);
  await page.screenshot({ path: info.outputPath('set-editor.png'), fullPage: true, animations: 'disabled' });
  await info.attach('set-editor', { path: info.outputPath('set-editor.png'), contentType: 'image/png' });
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(firstSet(page)).toBeFocused();
});

test('group: participant drafts stay separate; cancelled member cannot log', async ({ page }) => {
  await home(page, '20:30');
  await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  await expect(page.locator('.session-journal h1')).toHaveText('Мини-группа');
  await firstSet(page).click();
  await page.getByLabel('Вес, кг', { exact: true }).fill('77,5');
  await page.getByLabel('Повторы', { exact: true }).fill('8');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: /^Дана 0\/12/ }).click();
  await firstSet(page).click();
  await expect(page.getByLabel('Вес, кг', { exact: true })).toHaveValue('');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Алия 0\/16/ }).click();
  await firstSet(page).click();
  await expect(page.getByLabel('Вес, кг', { exact: true })).toHaveValue('77,5');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Мади Не участвует/ }).click();
  await expect(firstSet(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('черновиков: 1');
  await expect(page.getByRole('dialog')).toContainText('Не участвует');
});

test('booking: create, reload, confirm as client, reload', async ({ page }) => {
  await home(page);
  await page.locator('.today-head').getByRole('button', { name: 'Создать занятие', exact: true }).click();
  await page.locator('[data-act="ns.toggle"][data-id="c1"]').click();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await page.locator('[data-act="ns.patch"][data-key="start"][data-value="11:30"]').click();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await page.getByText('Подтверждаю пересечение', { exact: true }).click();
  await page.getByRole('button', { name: /Назначить программу позже/ }).click();
  await page.getByRole('button', { name: 'Создать занятие', exact: true }).click();
  await expect(page.locator('.cal-entry').filter({ hasText: 'Айгерим' }).filter({ hasText: '11:30' })).toContainText('Ждём согласия');
  await page.reload();
  await page.getByRole('group', { name: 'Роль', exact: true }).getByRole('button', { name: 'Клиент', exact: true }).click();
  await expect(page.locator('.hero-card')).toContainText('11:30–12:30');
  await page.getByRole('button', { name: 'Подтвердить участие', exact: true }).click();
  await expect(page.locator('.hero-card')).toContainText('Подтверждено');
  await page.reload();
  await page.getByRole('group', { name: 'Роль', exact: true }).getByRole('button', { name: 'Клиент', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Подтвердить участие', exact: true })).toHaveCount(0);
  await expect(page.locator('.hero-card')).toContainText('11:30–12:30');
});

test('reschedule: proposal does not move booking; trainer accepts; reload keeps time', async ({ page }) => {
  await home(page, '20:30');
  await page.getByRole('group', { name: 'Роль', exact: true }).getByRole('button', { name: 'Клиент', exact: true }).click();
  await page.getByRole('button', { name: 'Предложить перенос', exact: true }).click();
  await page.getByLabel('Новая дата', { exact: true }).fill('2026-09-16');
  await page.getByLabel('Начало', { exact: true }).fill('10:15');
  await page.getByRole('dialog').getByRole('button', { name: /Предложить|Отправить/ }).click();
  await expect(page.locator('.hero-card__when')).toContainText('21:15–22:00');
  await page.getByRole('group', { name: 'Роль', exact: true }).getByRole('button', { name: 'Тренер', exact: true }).click();
  await page.getByRole('button', { name: /Входящие: .* требуют ответа/ }).click();
  await page.locator('[data-act="rs.accept"]:not([data-id="r1"]):not([data-id="r2"])').click();
  await page.reload();
  await page.getByRole('group', { name: 'Роль', exact: true }).getByRole('button', { name: 'Клиент', exact: true }).click();
  await expect(page.locator('.hero-card__when')).toContainText('10:15–11:00');
});

test('reduced motion: opening a sheet creates no running transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await home(page);
  await openDana(page);
  await firstSet(page).click();
  expect(await page.getByRole('dialog').evaluate(el => el.getAnimations().filter(a => a.playState === 'running').length)).toBe(0);
});

test('motion: frequent and keyboard actions are instant; occasional sheet can be interrupted', async ({ page }) => {
  // Observe native WAAPI calls without changing their timing or application state.
  await page.addInitScript(() => {
    const calls: { sheet: string | null; duration: number }[] = [];
    (window as typeof window & { motionCalls: typeof calls }).motionCalls = calls;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      calls.push({ sheet: this.getAttribute('data-sheet'), duration: Number(typeof options === 'number' ? options : options?.duration) });
      return animate.call(this, frames, options);
    };
  });
  const calls = () => page.evaluate(() => (window as typeof window & { motionCalls: { sheet: string | null; duration?: number | string }[] }).motionCalls);
  await home(page);
  await openDana(page);
  await firstSet(page).click();
  await page.getByLabel('Вес, кг', { exact: true }).fill('20');
  await page.getByLabel('Повторы', { exact: true }).fill('8');
  await page.keyboard.press('Escape');
  await firstSet(page).press('Enter');
  await expect(page.getByLabel('Вес, кг', { exact: true })).toHaveValue('20');
  expect(await calls()).toEqual([]);
  await page.keyboard.press('Escape');
  const more = page.getByRole('button', { name: 'Ещё', exact: true });
  await more.click();
  expect(await calls()).toEqual([{ sheet: 'session', duration: 240 }]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(more).toBeFocused();
  await more.press('Enter');
  expect(await calls()).toHaveLength(1);
  await page.keyboard.press('Escape');
  await more.click();
  await page.keyboard.press('Tab');
  expect(await page.getByRole('dialog').evaluate(el => el.getAnimations().length)).toBe(0);
  expect(await calls()).toHaveLength(2);
  await page.keyboard.press('Escape');
  await more.click();
  expect(await calls()).toHaveLength(3);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.getByRole('dialog').evaluate(el => el.getAnimations().length)).toBe(0);
  await page.keyboard.press('Escape');
  await more.click();
  expect(await calls()).toHaveLength(3);
  expect(await page.getByRole('dialog').evaluate(el => el.getAnimations().length)).toBe(0);
});

test('invitation: GPT illustrations, narrow layout and honest demo states', async ({ page }, info) => {
  const targetViewport = page.viewportSize()!;
  // First-entry demo is reached through the prototype's desktop screen index.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await home(page);
  await page.getByRole('group', { name: 'Роль', exact: true }).getByRole('button', { name: 'Клиент', exact: true }).click();
  await page.locator('#rail').getByRole('button', { name: 'Первый вход', exact: true }).click();
  await page.setViewportSize(targetViewport);
  const screen = page.locator('.onboarding');
  await expect(screen.getByRole('heading', { level: 1 })).toHaveText('Данияр приглашает вас');
  const art = screen.locator('img');
  await expect(art).toHaveAttribute('src', 'assets/mascot/red-panda-dark-headband.png');
  await expect.poll(() => art.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await expect(screen.getByRole('button', { name: 'Подключиться', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: info.outputPath('invitation.png'), animations: 'disabled' });
  await info.attach('invitation', { path: info.outputPath('invitation.png'), contentType: 'image/png' });
  const states = screen.getByRole('group', { name: 'Состояние приглашения' });
  await states.getByRole('button', { name: 'Истекла', exact: true }).click();
  await expect(screen).toContainText('Отправка запроса из приложения пока не подключена');
  await expect(screen.getByRole('button', { name: 'Запросить новую ссылку' })).toHaveCount(0);
  await states.getByRole('button', { name: 'Нет занятия', exact: true }).click();
  await expect(art).toHaveAttribute('src', 'assets/mascot/red-panda-dark-headband.png');
  await expect.poll(() => art.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await expect(screen).toContainText('запрос свободного времени из приложения пока недоступен');
  await page.screenshot({ path: info.outputPath('first-plan.png'), animations: 'disabled' });
  await info.attach('first-plan', { path: info.outputPath('first-plan.png'), contentType: 'image/png' });
  await states.getByRole('button', { name: 'Активна', exact: true }).click();
  await screen.getByRole('button', { name: 'Подключиться', exact: true }).click();
  await expect(page.locator('.hero-card')).toBeVisible();
  await expect(page.locator('.toast.is-on')).toContainText('Демо: открыт главный экран клиента');
  await expect(page.locator('.session-journal img')).toHaveCount(0);
});

test('reschedule counter: trainer suggests another time, client accepts only after reload', async ({ page }) => {
  await home(page, '20:30');
  const roles = page.getByRole('group', { name: 'Роль', exact: true });
  await roles.getByRole('button', { name: 'Клиент', exact: true }).click();
  await page.getByRole('button', { name: 'Предложить перенос', exact: true }).click();
  await page.getByLabel('Новая дата', { exact: true }).fill('2026-09-16');
  await page.getByLabel('Начало', { exact: true }).fill('10:15');
  await page.getByRole('dialog').getByRole('button', { name: /Предложить|Отправить/ }).click();
  await expect(page.locator('.hero-card__when')).toContainText('21:15–22:00');

  await roles.getByRole('button', { name: 'Тренер', exact: true }).click();
  await page.getByRole('button', { name: /Входящие: .* требуют ответа/ }).click();
  await page.locator('[data-id="counter"]:not([data-rid="r1"]):not([data-rid="r2"])').click();
  await expect(page.getByLabel('Новая дата', { exact: true })).toHaveValue('2026-09-16');
  await expect(page.getByLabel('Начало', { exact: true })).toHaveValue('10:15');
  await page.getByLabel('Начало', { exact: true }).fill('12:30');
  await page.getByRole('dialog').getByRole('button', { name: /Предложить|Отправить/ }).click();
  await page.reload();
  await roles.getByRole('button', { name: 'Клиент', exact: true }).click();
  const hero = page.locator('.hero-card');
  await expect(hero.locator('.hero-card__when')).toContainText('21:15–22:00');
  await expect(hero.locator('.pending')).toContainText('12:30–13:15');
  await expect(hero.locator('.pending')).toContainText('Нужен ваш ответ');
  await hero.getByRole('button', { name: 'Подтвердить перенос', exact: true }).click();
  await expect(hero.locator('.hero-card__when')).toContainText('12:30–13:15');
  await expect(hero.locator('.pending')).toHaveCount(0);
  await page.reload();
  await roles.getByRole('button', { name: 'Клиент', exact: true }).click();
  await expect(hero.locator('.hero-card__when')).toContainText('12:30–13:15');
  await expect(hero.locator('.pending')).toHaveCount(0);
});


test('review fixes: placeholder steps, visible draft and client identity on scroll', async ({ page }, info) => {
  await home(page); await openDana(page); await firstSet(page).click();
  await page.locator('[data-act="setlog.step"][data-field="kg"][data-by="2.5"]').click();
  await expect(page.getByLabel('Вес, кг', { exact: true })).toHaveValue('52,5');
  await page.locator('[data-act="setlog.step"][data-field="reps"][data-by="1"]').click();
  await expect(page.getByLabel('Повторы', { exact: true })).toHaveValue('11');
  await page.getByLabel('Вес, кг', { exact: true }).fill('2,5');
  await page.getByLabel('Повторы', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.locator('.setrow__draft').first()).toHaveText('2,5 кг × —');
  await page.screenshot({ path: info.outputPath('review-draft.png'), animations: 'disabled' });
  await page.locator('.session-journal .screen__body').evaluate(el => { el.scrollTop = 220; });
  const identity = page.locator('.log-screen-status__client');
  await expect(identity).toBeInViewport();
  await expect(identity).toHaveText('Дана Ержанова');
  await page.screenshot({ path: info.outputPath('review-scroll.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Свернуть тренировку' }).click();
  await expect(page.locator('.today-entry[data-session="s1"] [data-act="logging.open"]')).toHaveCount(0);
});

test('review fixes: finishing another journal returns dock to the earlier draft', async ({ page }, info) => {
  await home(page); await openDana(page); await firstSet(page).click();
  await page.getByLabel('Вес, кг', { exact: true }).fill('2,5');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Свернуть тренировку' }).click();
  await page.locator('.today-entry[data-session="s2"] .today-entry__name-btn').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  await expect(page.locator('.session-journal h1')).toContainText('Мади');
  await page.getByRole('button', { name: 'Свернуть тренировку' }).click();
  await expect(page.locator('.today-entry[data-session="s1"] [data-act="logging.open"]')).toHaveText(/Открыть журнал · Дана/);
  await expect(page.locator('.workout-dock')).toContainText('Мади');
  await page.getByRole('button', { name: /^Вернуться к тренировке:/ }).click();
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить записанное и завершить' }).click();
  await page.getByRole('button', { name: 'Вернуться к расписанию', exact: true }).click();
  await expect(page.locator('.workout-dock')).toContainText('Дана');
  await expect(page.locator('.workout-dock')).toContainText('09:00');
  await page.screenshot({ path: info.outputPath('review-fallback.png'), animations: 'disabled' });
  await page.reload(); await openDana(page);
  await expect(page.locator('.setrow__draft').first()).toHaveText('2,5 кг × —');
});

test('review fixes: stale dock opens completed results and exports unsaved local draft', async ({ page, context }, info) => {
  await home(page); await openDana(page);
  const stale = await context.newPage(); await home(stale); await openDana(stale);
  await page.locator('[data-act="setlog.quick"]').first().click();
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить записанное и завершить' }).click();
  await firstSet(stale).click();
  await stale.getByLabel('Вес, кг', { exact: true }).fill('25');
  await stale.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await stale.getByRole('button', { name: 'Свернуть тренировку' }).click();
  await stale.getByRole('button', { name: /^Вернуться к тренировке:/ }).click();
  await expect(stale.locator('.log-recovery')).toContainText('завершён в другой вкладке');
  await expect(stale.locator('.session-journal [data-id="setlog"], [data-act="setlog.quick"]')).toHaveCount(0);
  await expect(stale.locator('.setrow__today').first()).toContainText('50 кг');
  await stale.screenshot({ path: info.outputPath('review-stale-completed.png'), animations: 'disabled' });
  const event = stale.waitForEvent('download');
  await stale.getByRole('button', { name: 'Скачать копию журнала', exact: true }).click();
  const download = await event; const copyPath = info.outputPath('recovered.json'); await download.saveAs(copyPath);
  const copy = JSON.parse(await readFile(copyPath, 'utf8'));
  expect(copy.finished).toBe(true);
  expect(copy.localRecovery.drafts.c5.e1[0].kg).toBe('25');
  expect(copy.values.c5.e1[0]).toEqual({ kg: 50, reps: 10 });
});


test('workout polish: group entry fits a short screen and keeps participant context after scrolling', async ({ page }, info) => {
  await home(page, '20:30');
  await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click();
  if (info.project.name.startsWith('mobile')) await page.setViewportSize({ width: page.viewportSize()!.width, height: 640 });
  const quick = page.locator('[data-act="setlog.quick"]').first();
  const row = page.locator('.setrow--quick').first();
  const body = page.locator('.session-journal .screen__body');
  const bounds = (await body.boundingBox())!;
  const set = (await row.boundingBox())!;
  expect(set.y + set.height, 'The complete first approach fits without scrolling').toBeLessThanOrEqual(bounds.y + bounds.height);
  await expect(page.getByRole('button', { name: /^Алия 0\/16 подходов/ })).toHaveAttribute('aria-pressed', 'true');
  for (const button of await page.locator('.pcard').all()) {
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44); expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await expect(quick).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Завершить тренировку', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('polish-group-short.png'), animations: 'disabled' });
  await quick.click();
  await expect(page.locator('.setrow__today').first()).toContainText('80 кг');
  await expect(page.locator('.pcard.is-on')).toContainText('1/16');
  await body.evaluate(el => { el.scrollTop = 250; });
  await expect(page.locator('.log-screen-status__client')).toBeInViewport();
  await expect(page.locator('.log-screen-status__client')).toHaveText('Мини-группа · Алия');
  await page.getByRole('button', { name: /^Дана 0\/12 подходов/ }).click();
  await expect(page.locator('.log-context__identity')).toContainText('Дана');
  await expect(page.locator('.log-context')).toContainText('Участие пока не подтверждено');
});
