import { createHmac, timingSafeEqual } from 'node:crypto';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Sandbox webhooks: hex HMAC-SHA256 of the raw body in X-StarNudge-Signature. */
export function verifySandboxSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(header, expected);
}

/** Stripe: "t=<unix>,v1=<hex>[,v1=...]" over "<t>.<body>", with a 5-minute tolerance. */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds: number = Date.now() / 1000,
  toleranceSeconds = 300,
): boolean {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const timestamp = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v ?? '');
  if (!timestamp || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return signatures.some((sig) => safeEqual(sig, expected));
}

/** Svix (used by Resend): HMAC-SHA256 over "<id>.<timestamp>.<body>" with the base64 key after "whsec_". */
export function verifySvixSignature(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  nowSeconds: number = Date.now() / 1000,
  toleranceSeconds = 300,
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !secret.startsWith('whsec_')) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) return false;
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
  return signature
    .split(' ')
    .map((entry) => entry.split(','))
    .some(([version, value]) => version === 'v1' && value !== undefined && safeEqual(value, expected));
}

/** Twilio: base64 HMAC-SHA1 of the full URL plus sorted POST params, in X-Twilio-Signature. */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  header: string | null,
  authToken: string,
): boolean {
  if (!header || !authToken) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const expected = createHmac('sha1', authToken).update(data).digest('base64');
  return safeEqual(header, expected);
}
