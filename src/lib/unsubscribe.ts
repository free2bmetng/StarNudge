import { signValue, verifySignedValue } from './crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Signed token that identifies one customer at one business for email unsubscribe links. */
export function makeUnsubscribeToken(businessId: string, customerId: string): string {
  const payload = Buffer.from(JSON.stringify({ b: businessId, c: customerId })).toString('base64url');
  return `${payload}.${signValue(payload)}`;
}

export function parseUnsubscribeToken(token: string): { businessId: string; customerId: string } | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!verifySignedValue(payload, signature)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { b?: string; c?: string };
    if (data.b && data.c && UUID_RE.test(data.b) && UUID_RE.test(data.c)) {
      return { businessId: data.b, customerId: data.c };
    }
  } catch {
    return null;
  }
  return null;
}
