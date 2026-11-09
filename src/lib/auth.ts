import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cfg, LIMITS } from './config';
import { pool, q, withTenant } from './db';
import { sha256Hex } from './crypto';

export const SESSION_COOKIE = 'sn_session';

export interface SessionContext {
  userId: string;
  businessId: string;
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  const secure = cfg().appBaseUrl.startsWith('https://');
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: LIMITS.sessionDays * 86_400,
  });
}

export async function currentSession(): Promise<SessionContext | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await q<{ user_id: string; business_id: string }>(
    pool(),
    'select user_id, business_id from resolve_session($1)',
    [sha256Hex(token)],
  );
  if (rows.length === 0) return null;
  return { userId: rows[0].user_id, businessId: rows[0].business_id };
}

export async function requireSession(): Promise<SessionContext> {
  const session = await currentSession();
  if (!session) redirect('/login');
  return session;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const session = token ? await currentSession() : null;
  if (token && session) {
    await withTenant(session.businessId, (tx) =>
      tx.query('delete from sessions where token_hash = $1', [sha256Hex(token)]),
    );
  }
  store.delete(SESSION_COOKIE);
}
