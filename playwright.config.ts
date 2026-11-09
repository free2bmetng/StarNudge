import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
// Test-only secrets and a pinned sandbox clock (a weekday afternoon in New York).
const E2E_ENV = {
  DATABASE_URL: 'postgres://starnudge_app:starnudge_app_dev@localhost:5432/starnudge_e2e',
  MIGRATION_DATABASE_URL: 'postgres://postgres@localhost:5432/starnudge_e2e',
  APP_BASE_URL: BASE,
  SANDBOX_MODE: 'true',
  APP_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  APP_HASH_KEY: 'e2e-hash-key-not-secret',
  CRON_SECRET: 'e2e-cron-secret',
  SANDBOX_WEBHOOK_SECRET: 'e2e-webhook-secret',
  STARNUDGE_SANDBOX_NOW: '2026-11-09T16:00:00.000Z',
};

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: BASE,
    trace: 'off',
    launchOptions: { executablePath: '/opt/pw-browsers/chromium' },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: BASE,
    reuseExistingServer: false,
    timeout: 120_000,
    env: E2E_ENV,
  },
});
