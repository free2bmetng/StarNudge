import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Test-only secrets. Never used outside tests.
const TEST_ENCRYPTION_KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: `${fileURLToPath(new URL('./src/', import.meta.url))}/` }],
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    globalSetup: ['tests/global-setup.ts'],
    env: {
      DATABASE_URL: 'postgres://starnudge_app:starnudge_app_dev@localhost:5432/starnudge_test',
      MIGRATION_DATABASE_URL: 'postgres://postgres@localhost:5432/starnudge_test',
      APP_DB_PASSWORD: 'starnudge_app_dev',
      APP_BASE_URL: 'http://localhost:3000',
      SANDBOX_MODE: 'true',
      APP_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
      APP_HASH_KEY: 'test-hash-key-not-secret',
      CRON_SECRET: 'test-cron-secret',
      SANDBOX_WEBHOOK_SECRET: 'test-webhook-secret',
      NOTIFY_FROM_EMAIL: 'StarNudge <notify@example.com>',
    },
  },
});
