import { ensureDatabase, runMigrations } from '../src/lib/migrate';

/** Creates and migrates the test database once per test run. */
export default async function setup(): Promise<void> {
  const admin = process.env.MIGRATION_DATABASE_URL ?? 'postgres://postgres@localhost:5432/starnudge_test';
  await ensureDatabase(admin);
  await runMigrations(admin, process.env.APP_DB_PASSWORD ?? 'starnudge_app_dev');
}
