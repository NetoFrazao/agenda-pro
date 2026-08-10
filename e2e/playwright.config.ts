import { defineConfig, devices } from '@playwright/test';

/**
 * Browser E2E (Playwright).
 *
 * Pré-requisitos para smoke live (`E2E_LIVE=1`):
 * - API em http://localhost:3001 (ou E2E_API_URL)
 * - Web em http://localhost:3000 (ou E2E_BASE_URL)
 * - Seed demo: dono@demo.local / SenhaDemo123! / slug demo-barbearia
 *
 * Sem E2E_LIVE=1 os specs fazem skip (CI unitário não exige stack).
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
