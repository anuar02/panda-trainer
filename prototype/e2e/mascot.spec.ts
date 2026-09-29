import { test, expect } from '@playwright/test';

test('mascot: static red panda poses and short-screen CTA', async ({ page }, info) => {
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('group', { name: 'Роль', exact: true }).getByRole('button', { name: 'Клиент', exact: true }).click();
  await page.locator('#rail').getByRole('button', { name: 'Первый вход', exact: true }).click();
  await page.setViewportSize(viewport);
  const mascot = page.locator('.mascot');
  const img = mascot.locator('img');
  const states = page.getByRole('group', { name: 'Состояние приглашения' });
  for (const [state, pose] of [['Активна', 'welcome'], ['Принята', 'approved'], ['Нет занятия', 'waiting']]) {
    await states.getByRole('button', { name: state, exact: true }).click();
    await expect(mascot).toHaveAttribute('data-mascot', pose);
    await expect(img).toHaveAttribute('src', 'assets/mascot/red-panda-dark-headband.png');
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(1536);
    expect(await mascot.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
    await page.screenshot({ path: info.outputPath(`panda-${pose}.png`) });
  }
  await states.getByRole('button', { name: 'Истекла', exact: true }).click();
  await expect(mascot).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await states.getByRole('button', { name: 'Принята', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(page.getByRole('button', { name: 'Перейти на главную', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await mascot.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
  await page.screenshot({ path: info.outputPath('panda-approved-short.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#toolbar [data-act="scenario"][data-s="empty"]').click();
  for (const [screen, pose] of [['Программа', 'reading'], ['Прогресс', 'ready'], ['Главная', 'rest']]) {
    await page.locator('#rail').getByRole('button', { name: screen, exact: true }).click();
    await page.setViewportSize(viewport);
    await expect(mascot).toHaveAttribute('data-mascot', pose);
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(1536);
    expect(await mascot.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`panda-${pose}.png`) });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
});
