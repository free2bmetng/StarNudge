import { Client } from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Creates the database named in the URL if it does not exist yet. */
export async function ensureDatabase(adminUrl: string): Promise<void> {
  const target = new URL(adminUrl);
  const dbName = decodeURIComponent(target.pathname.slice(1));
  if (!dbName) throw new Error('Connection URL must name a database');
  const maintenance = new URL(adminUrl);
  maintenance.pathname = '/postgres';
  const client = new Client({ connectionString: maintenance.toString() });
  await client.connect();
  try {
    const exists = await client.query('select 1 from pg_database where datname = $1', [dbName]);
    if (exists.rowCount === 0) {
      await client.query(`create database "${dbName.replace(/"/g, '""')}"`);
    }
  } finally {
    await client.end();
  }
}

/**
 * Applies every db/migrations/*.sql file not yet recorded in schema_migrations,
 * then grants the runtime role access. Runs as the owner/superuser connection.
 */
export async function runMigrations(
  adminUrl: string,
  appPassword: string,
  dir = join(process.cwd(), 'db', 'migrations'),
): Promise<string[]> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    const role = await client.query("select 1 from pg_roles where rolname = 'starnudge_app'");
    if (role.rowCount === 0) await client.query('create role starnudge_app login');
    const alter = await client.query<{ sql: string }>(
      "select format('alter role starnudge_app with login password %L', $1::text) as sql",
      [appPassword],
    );
    await client.query(alter.rows[0].sql);

    await client.query(
      'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
    );
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const done = await client.query('select 1 from schema_migrations where name = $1', [file]);
      if (done.rowCount) continue;
      const sql = readFileSync(join(dir, file), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (name) values ($1)', [file]);
        await client.query('commit');
        applied.push(file);
      } catch (err) {
        await client.query('rollback');
        throw err;
      }
    }

    await client.query('grant usage on schema public to starnudge_app');
    await client.query('grant select, insert, update, delete on all tables in schema public to starnudge_app');
    await client.query('grant usage, select on all sequences in schema public to starnudge_app');
    await client.query('grant execute on all functions in schema public to starnudge_app');
    await client.query(
      'alter default privileges in schema public grant select, insert, update, delete on tables to starnudge_app',
    );
    return applied;
  } finally {
    await client.end();
  }
}
