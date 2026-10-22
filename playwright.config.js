import { defineConfig } from '@playwright/test';

export default defineConfig({
  globalSetup: './tests/config/globalSetup.js',
  testDir: './tests/specs',
  // Serial DB + bridge sync — use 1 worker unless you isolate data per worker
  workers: Number(process.env.PW_WORKERS || 1),
  fullyParallel: false,
  timeout: Number(process.env.PW_TEST_TIMEOUT || 180000),
  expect: {
    timeout: 20000
  },
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['allure-playwright', { outputFolder: 'allure-results' }]
  ],
  use: {
    trace: 'on-first-retry',
  },
});
