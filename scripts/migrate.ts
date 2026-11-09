import { loadLocalEnv } from '../src/lib/load-env';
import { ensureDatabase, runMigrations } from '../src/lib/migrate';

loadLocalEnv();

async function main(): Promise<void> {
  const adminUrl = process.env.MIGRATION_DATABASE_URL;
  if (!adminUrl) throw new Error('Set MIGRATION_DATABASE_URL (the owner or superuser connection). See .env.example.');
  await ensureDatabase(adminUrl);
  const applied = await runMigrations(adminUrl, process.env.APP_DB_PASSWORD ?? 'starnudge_app_dev');
  console.log(applied.length > 0 ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
