import { Client } from 'pg';
import { ensureDatabase, runMigrations } from '../../src/lib/migrate';

const ADMIN = 'postgres://postgres@localhost:5432/starnudge_e2e';

/** Gives every end-to-end run a clean, migrated database. */
export default async function setup(): Promise<void> {
  await ensureDatabase(ADMIN);
  await runMigrations(ADMIN, 'starnudge_app_dev');
  const client = new Client({ connectionString: ADMIN });
  await client.connect();
  try {
    await client.query(
      'truncate table users, businesses, webhook_events, import_batches restart identity cascade',
    );
    await client.query('alter sequence sandbox_sender_seq restart with 150');
  } finally {
    await client.end();
  }
}
