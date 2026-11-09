import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { closeTestDb, resetDb, readyBusiness, addCustomer, tenantRows, NOON_NY } from '../helpers';
import { sendNow } from '@/lib/services/customers';
import { clearSandboxFaults } from '@/lib/adapters/sandbox';
import { makeUnsubscribeToken } from '@/lib/unsubscribe';
import { POST as smsWebhook } from '@/app/api/webhooks/sms/route';
import { POST as emailWebhook } from '@/app/api/webhooks/email/route';
import { POST as stripeWebhook } from '@/app/api/webhooks/stripe/route';
import { POST as cron } from '@/app/api/cron/dispatch/route';
import { GET as shortLink } from '@/app/r/[code]/route';
import { POST as unsubscribe } from '@/app/api/unsubscribe/route';

const SECRET = 'test-webhook-secret';

function signed(body: object): { raw: string; headers: Record<string, string> } {
  const raw = JSON.stringify(body);
  return { raw, headers: { 'content-type': 'application/json', 'x-starnudge-signature': createHmac('sha256', SECRET).update(raw).digest('hex') } };
}

function post(url: string, raw: string, headers: Record<string, string>): Request {
  return new Request(url, { method: 'POST', body: raw, headers });
}

beforeEach(async () => {
  await resetDb();
  clearSandboxFaults();
});
afterAll(closeTestDb);

describe('SMS webhook', () => {
  it('rejects a forged signature with 401 and changes nothing', async () => {
    const biz = await readyBusiness();
    await addCustomer(biz, { phone: '+12125550130', smsSource: 'Form' });
    const body = JSON.stringify({ type: 'inbound', providerMessageId: 'FORGED', from: '+12125550130', to: '+12125550199', body: 'STOP' });
    const res = await smsWebhook(post('http://localhost/api/webhooks/sms', body, { 'x-starnudge-signature': 'nope' }));
    expect(res.status).toBe(401);
    const optOuts = await tenantRows(biz.businessId, 'select 1 from opt_outs');
    expect(optOuts).toHaveLength(0);
  });

  it('accepts a signed STOP and blocks the customer', async () => {
    const biz = await readyBusiness();
    const customer = await addCustomer(biz, { phone: '+12125550131', smsSource: 'Form' });
    const [sender] = await tenantRows<{ sender_number: string }>(biz.businessId, 'select sender_number from sender_registrations');
    const { raw, headers } = signed({ type: 'inbound', providerMessageId: 'SMSROUTE1', from: '+12125550131', to: sender.sender_number, body: 'STOP' });
    const res = await smsWebhook(post('http://localhost/api/webhooks/sms', raw, headers));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'processed', keyword: 'stop' });
    const again = await sendNow(biz.businessId, biz.userId, customer, 'post-stop', NOON_NY);
    expect(again).toMatchObject({ outcome: { kind: 'suppressed', reason: 'opted_out' } });
  });

  it('a signed delivery receipt updates the request, and a repeat is ignored', async () => {
    const biz = await readyBusiness();
    const customer = await addCustomer(biz, { phone: '+12125550132', smsSource: 'Form' });
    await sendNow(biz.businessId, biz.userId, customer, 'receipt', NOON_NY);
    const [msg] = await tenantRows<{ provider_message_id: string }>(biz.businessId, `select provider_message_id from messages where kind = 'review_request'`);
    const { raw, headers } = signed({ type: 'status', providerMessageId: msg.provider_message_id, status: 'delivered' });
    const first = await smsWebhook(post('http://localhost/api/webhooks/sms', raw, headers));
    expect(await first.json()).toEqual({ result: 'processed' });
    const second = await smsWebhook(post('http://localhost/api/webhooks/sms', raw, headers));
    expect(await second.json()).toEqual({ result: 'duplicate' });
  });
});

describe('email webhook', () => {
  it('rejects an unsigned bounce', async () => {
    const res = await emailWebhook(post('http://localhost/api/webhooks/email', '{"type":"bounced","providerMessageId":"x"}', {}));
    expect(res.status).toBe(401);
  });
});

describe('Stripe webhook in sandbox', () => {
  it('answers 404, because sandbox has no Stripe', async () => {
    const res = await stripeWebhook(post('http://localhost/api/webhooks/stripe', '{}', {}));
    expect(res.status).toBe(404);
  });
});

describe('cron endpoint', () => {
  it('refuses calls without the secret', async () => {
    const res = await cron(new Request('http://localhost/api/cron/dispatch', { method: 'POST' }));
    expect(res.status).toBe(401);
    const wrong = await cron(new Request('http://localhost/api/cron/dispatch', { method: 'POST', headers: { authorization: 'Bearer nope' } }));
    expect(wrong.status).toBe(401);
  });

  it('runs a tick with the right secret', async () => {
    const res = await cron(new Request('http://localhost/api/cron/dispatch', { method: 'POST', headers: { authorization: 'Bearer test-cron-secret' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ processed: expect.any(Number), deletions: expect.any(Number) });
  });
});

describe('short link', () => {
  it('records a click and redirects to the review link for every customer', async () => {
    const biz = await readyBusiness();
    const [link] = await tenantRows<{ code: string }>(biz.businessId, 'select code from short_links');
    const res = await shortLink(new Request(`http://localhost/r/${link.code}`), { params: Promise.resolve({ code: link.code }) });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toMatch(/^https:\/\/search\.google\.com\/local\/writereview\?placeid=/);
    const clicks = await tenantRows(biz.businessId, 'select 1 from short_link_clicks');
    expect(clicks).toHaveLength(1);
  });

  it('returns 404 for an unknown code', async () => {
    const res = await shortLink(new Request('http://localhost/r/nope'), { params: Promise.resolve({ code: 'nope' }) });
    expect(res.status).toBe(404);
  });
});

describe('unsubscribe', () => {
  it('a one-click POST with a valid token opts the customer out of every channel', async () => {
    const biz = await readyBusiness();
    const customer = await addCustomer(biz, { phone: '+12125550133', email: 'u@example.com', emailConsentSource: 'Checkout' });
    const token = makeUnsubscribeToken(biz.businessId, customer);
    const res = await unsubscribe(new Request(`http://localhost/api/unsubscribe?token=${token}`, { method: 'POST', body: 'List-Unsubscribe=One-Click' }));
    expect(res.status).toBe(200);
    const rows = await tenantRows(biz.businessId, 'select channel from opt_outs');
    expect(rows).toEqual([{ channel: 'email' }]);
  });

  it('a forged token does nothing', async () => {
    const res = await unsubscribe(new Request('http://localhost/api/unsubscribe?token=abc.def', { method: 'POST' }));
    expect(res.status).toBe(400);
  });
});
