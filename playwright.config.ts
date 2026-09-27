import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './prototype/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: 'output/playwright/results',
  reporter: [['list'], ['html', { outputFolder: 'output/playwright/report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4186',
    browserName: 'chromium',
    headless: true,
    locale: 'ru-RU',
    timezoneId: 'Asia/Almaty',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    ...[320, 375, 390, 430].map(width => ({
      name: `mobile-${width}`,
      use: { viewport: { width, height: 844 }, isMobile: true, hasTouch: true },
    })),
  ],
  webServer: {
    // Only the public prototype directory is served, never .env or repo files.
    command: 'python3 -m http.server 4186 --bind 127.0.0.1 --directory prototype',
    url: 'http://127.0.0.1:4186',
    reuseExistingServer: false,
    timeout: 15_000,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
