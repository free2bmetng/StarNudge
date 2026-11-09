import { Pool, type PoolClient } from 'pg';
import { cfg } from './config';

export type Queryable = Pool | PoolClient;

const globalForDb = globalThis as unknown as { __starnudgePool?: Pool };

/** Shared pool. Connects as the runtime role, which is subject to row-level security. */
export function pool(): Pool {
  if (!globalForDb.__starnudgePool) {
    globalForDb.__starnudgePool = new Pool({ connectionString: cfg().databaseUrl, max: 10 });
  }
  return globalForDb.__starnudgePool;
}

export async function q<T = Record<string, unknown>>(
  db: Queryable,
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await db.query(text, values);
  return result.rows as T[];
}

/**
 * Runs fn inside one transaction with app.business_id set. RLS then limits every
 * query in fn to that business. The setting is transaction-local, so pooled
 * connections never leak a tenant into the next request.
 */
export async function withTenant<T>(businessId: string, fn: (tx: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.business_id', $1, true)", [businessId]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  if (globalForDb.__starnudgePool) {
    await globalForDb.__starnudgePool.end();
    globalForDb.__starnudgePool = undefined;
  }
}
