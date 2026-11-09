import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { closeTestDb, resetDb, readyBusiness, createBusiness, addCustomer, addVisit, tenantRows, NOON_NY, zoneWhereItIsNoon } from '../helpers';
import { sendNow, requestDeletion, createCustomer } from '@/lib/services/customers';
import { processRequest, tick, enqueueAutomation } from '@/lib/services/pipeline';
import { handleInboundSms, handleSmsStatus, handleEmailEvent } from '@/lib/services/inbound';
import { importCustomers } from '@/lib/services/imports';
import { clearSandboxFaults, queueSandboxFault } from '@/lib/adapters/sandbox';
import { addMinutes } from '@/lib/time';
import { pool, withTenant } from '@/lib/db';
import { updateTemplate } from '@/lib/services/templates-admin';
import { saveReviewLink, submitSenderRegistration } from '@/lib/services/accounts';

beforeEach(async () => {
  await resetDb();
  clearSandboxFaults();
});
afterAll(closeTestDb);

async function senderNumber(businessId: string): Promise<string> {
  const rows = await tenantRows<{ sender_number: string }>(businessId, 'select sender_number from sender_registrations');
  return rows[0].sender_number;
}

async function requestsFor(businessId: string, customerId: string) {
  return tenantRows<{ id: string; status: string; status_reason: string | null; failure_reason: string | null; next_attempt_at: Date; sent_at: Date | null }>(
    businessId,
    'select id, status, status_reason, failure_reason, next_attempt_at, sent_at from review_requests where customer_id = $1 order by created_at',
    [customerId],
  );
}

describe('happy path', () => {
  it('sends by text, then records the delivery receipt', async () => {
    const biz = await readyBusiness();
    const customer = await addCustomer(biz, { phone: '+12125550100', smsSource: 'Signed intake form' });
    const result = await sendNow(biz.businessId, biz.userId, customer, 'nonce-1', NOON_NY);
    expect(result).toMatchObject({ ok: true, outcome: { kind: 'sent', channel: 'sms' } });

    const [msg] = await tenantRows<{ status: string; provider_message_id: string; body_enc: string }>(
      biz.businessId,
      `select status, provider_message_id, body_enc from messages where kind = 'review_request'`,
    );
    expect(msg.status).toBe('accepted');
    expect(msg.body_enc).toMatch(/^v1\./); // stored encrypted

    expect(await handleSmsStatus({ providerMessageId: msg.provider_message_id, status: 'delivered' }, NOON_NY)).toBe('processed');
    const [req] = await requestsFor(biz.businessId, customer);
    expect(req.status).toBe('delivered');
  });

  it('a second request to the same customer hits the 90-day cap', async () => {
    const biz = await readyBusiness();
    const customer = await addCustomer(biz, { phone: '+12125550101', smsSource: 'Form' });
    await sendNow(biz.businessId, biz.userId, customer, 'a', NOON_NY);
    const second = await sendNow(biz.businessId, biz.userId, customer, 'b', NOON_NY);
    expect(second).toMatchObject({ ok: true, outcome: { kind: 'suppressed', reason: 'frequency_cap' } });
  });
});

describe('opt-outs and imports', () => {
  it('STOP by text blocks every channel for the business (rule R5)', async () => {
    const biz = await readyBusiness();
    const customer = await createCustomer(biz.businessId, biz.userId, {
      firstName: 'Maria',
      lastName: '',
      phone: '+12125550102',
      email: 'maria@example.com',
      language: 'en',
      smsConsentSource: 'Form',
      emailConsentSource: 'Checkout opt-in',
    }, NOON_NY);
    if (!customer.ok) throw new Error(customer.error);
    const from = '+12125550102';
    const to = await senderNumber(biz.businessId);
    expect(await handleInboundSms({ providerMessageId: 'SMSTOP1', from, to, body: 'STOP' }, NOON_NY)).toEqual({ status: 'processed', keyword: 'stop' });

    const result = await sendNow(biz.businessId, biz.userId, customer.id, 'after-stop', NOON_NY);
    expect(result).toMatchObject({ ok: true, outcome: { kind: 'suppressed', reason: 'opted_out' } });
  });

  it('START does not re-subscribe the customer', async () => {
    const biz = await readyBusiness();
    const customer = await addCustomer(biz, { phone: '+12125550103', smsSource: 'Form' });
    const to = await senderNumber(biz.businessId);
    await handleInboundSms({ providerMessageId: 'SMSSTOP2', from: '+12125550103', to, body: 'STOP' }, NOON_NY);
    await handleInboundSms({ providerMessageId: 'SMSSTART2', from: '+12125550103', to, body: 'START' }, NOON_NY);
    const result = await sendNow(biz.businessId, biz.userId, customer, 'x', NOON_NY);
    expect(result).toMatchObject({ outcome: { kind: 'suppressed', reason: 'opted_out' } });
  });

  it('re-importing an opted-out customer does not re-enable sending', async () => {
    const biz = await readyBusiness();
    await addCustomer(biz, { phone: '+12125550104', smsSource: 'Form' });
    const to = await senderNumber(biz.businessId);
    await handleInboundSms({ providerMessageId: 'SMSSTOP3', from: '+12125550104', to, body: 'STOP' }, NOON_NY);

    const csv = [
      'first_name,last_name,phone,email,service_or_purchase,visit_date,consent_type,consent_source,consent_date',
      'Maria,Lopez,(212) 555-0104,,Cleaning,2026-11-08,sms_pew,Re-signed form,2026-11-08',
    ].join('\n');
    const summary = await importCustomers(biz.businessId, biz.userId, 'again.csv', csv, NOON_NY);
    expect(summary).toMatchObject({ ok: true, created: 0, merged: 0, skipped: 1 });
    if (!summary.ok) throw new Error('import failed');
    expect(summary.errors[0].message).toMatch(/opted out/);

    const consents = await tenantRows(biz.businessId, `select 1 from consents where type = 'sms_pew' and revoked_at is null`);
    // The original consent stays, but the new import adds nothing new for the opted-out contact.
    expect(consents.length).toBeLessThanOrEqual(1);
  });

  it('a bare STOP from an unknown number is recorded as a suppression, not a customer', async () => {
    const biz = await readyBusiness();
    const to = await senderNumber(biz.businessId);
    await handleInboundSms({ providerMessageId: 'SMSSTOP4', from: '+12125559999', to, body: 'STOP' }, NOON_NY);
    const rows = await tenantRows(biz.businessId, `select 1 from suppressions where reason = 'opted_out' and channel = 'all'`);
    expect(rows).toHaveLength(1);
  });

  it('a duplicate inbound webhook changes nothing', async () => {
    const biz = await readyBusiness();
    await addCustomer(biz, { phone: '+12125550105', smsSource: 'Form' });
    const to = await senderNumber(biz.businessId);
    const first = await handleInboundSms({ providerMessageId: 'SMSDUP', from: '+12125550105', to, body: 'Can you come earlier?' }, NOON_NY);
    const second = await handleInboundSms({ providerMessageId: 'SMSDUP', from: '+12125550105', to, body: 'Can you come earlier?' }, NOON_NY);
    expect(first.status).toBe('processed');
    expect(second.status).toBe('duplicate');
    const threads = await tenantRows(biz.businessId, 'select 1 from support_threads');
    expect(threads).toHaveLength(1);
  });
});

describe('gates before sending', () => {
  it('no sends until the review link is confirmed', async () => {
    const biz = await createBusiness();
    const customer = await addCustomer(biz, { phone: '+12125550106', smsSource: 'Form' });
    const result = await sendNow(biz.businessId, biz.userId, customer, 'unconfirmed', NOON_NY);
    expect(result).toMatchObject({ ok: true, outcome: { kind: 'deferred', reason: 'review_link_unconfirmed' } });
  });

  it('an unapproved SMS sender holds the request and never sends by email instead', async () => {
    const biz = await createBusiness();
    await saveReviewLink(biz.businessId, biz.userId, { placeId: 'ChIJHoldTest0000001' });
    const { confirmReviewLink } = await import('@/lib/services/accounts');
    await confirmReviewLink(biz.businessId, biz.userId, NOON_NY);
    await submitSenderRegistration(biz.businessId, biz.userId, {
      legalName: 'Test LLC',
      website: '',
      useCase: 'Asking recent customers to share a review of their visit.',
      sampleMessage: 'Thanks for visiting, share your experience here.',
      consentDescription: 'Paper intake form with a text consent line.',
    });
    const customer = await addCustomer(biz, { phone: '+12125550107', smsSource: 'Form', email: 'x@example.com', emailConsentSource: 'Checkout' });
    const result = await sendNow(biz.businessId, biz.userId, customer, 'held', NOON_NY);
    expect(result).toMatchObject({ ok: true, outcome: { kind: 'deferred', reason: 'sender_pending' } });
    const msgs = await tenantRows(biz.businessId, `select 1 from messages where kind = 'review_request'`);
    expect(msgs).toHaveLength(0);
  });

  it('no consent means no message at all', async () => {
    const biz = await readyBusiness();
    const customer = await addCustomer(biz, { phone: '+12125550108' });
    const result = await sendNow(biz.businessId, biz.userId, customer, 'none', NOON_NY);
    expect(result).toMatchObject({ ok: true, outcome: { kind: 'suppressed', reason: 'no_basis' } });
  });

  it('quiet hours defer to 08:00 the next morning, not drop the request', async () => {
    const biz = await readyBusiness();
    const customer = await addCustomer(biz, { phone: '+12125550109', smsSource: 'Form' });
    const at = new Date('2026-11-10T04:00:00.000Z'); // 23:00 on the 9th in New York
    const result = await sendNow(biz.businessId, biz.userId, customer, 'late', at);
    expect(result).toMatchObject({ ok: true, outcome: { kind: 'deferred', reason: 'quiet_hours' } });
    const [req] = await requestsFor(biz.businessId, customer);
    expect(req.status).toBe('deferred');
    expect(req.next_attempt_at.toISOString()).toBe('2026-11-10T13:00:00.000Z');
  });

  it('a template that fails lint is held back and the owner is told', async () => {
    const biz = await readyBusiness();
    const customer = await addCustomer(biz, { phone: '+12125550110', smsSource: 'Form' });
    // Simulate a stored template that no longer passes lint.
    await withTenant(biz.businessId, (tx) =>
      tx.query(`update templates set body = 'Give us 5 stars {review_link} {business_name}' where channel = 'sms' and kind = 'service' and language = 'en'`),
    );
    const result = await sendNow(biz.businessId, biz.userId, customer, 'bad-template', NOON_NY);
    expect(result).toMatchObject({ ok: true, outcome: { kind: 'suppressed', reason: 'template_invalid' } });
    const notices = await tenantRows(biz.businessId, `select kind from messages where kind = 'owner_notice'`);
    expect(notices.length).toBeGreaterThanOrEqual(1);
  });

  it('an owner cannot save wording that fails lint', async () => {
    const biz = await readyBusiness();
    const rows = await tenantRows<{ id: string }>(biz.businessId, `select id from templates where channel = 'sms' and kind = 'service' and language = 'en'`);
    const result = await updateTemplate(biz.businessId, biz.userId, rows[0].id, { subject: '', body: 'Rate us {review_link} {business_name}' });
    expect(result.ok).toBe(false);
  });

  it('an expired request is not sent', async () => {
    const biz = await readyBusiness();
    const customer = await addCustomer(biz, { phone: '+12125550111', smsSource: 'Form' });
    const requestId = randomUUID();
    await withTenant(biz.businessId, (tx) =>
      tx.query(
        `insert into review_requests (id, business_id, customer_id, source, idempotency_key, status, due_at, next_attempt_at)
         values ($1, $2, $3, 'automation', $4, 'queued', $5, $5)`,
        [requestId, biz.businessId, customer, `old:${requestId}`, new Date(NOON_NY.getTime() - 3 * 86_400_000)],
      ),
    );
    expect(await processRequest(biz.businessId, requestId, NOON_NY)).toEqual({ kind: 'expired' });
  });
});

describe('sending failures', () => {
  it('retries a transient error up to three attempts, then fails for good', async () => {
    const biz = await readyBusiness();
    const customer = await addCustomer(biz, { phone: '+12125550112', smsSource: 'Form' });
    queueSandboxFault('sms', 'transient');
    queueSandboxFault('sms', 'transient');
    queueSandboxFault('sms', 'transient');
    const first = await sendNow(biz.businessId, biz.userId, customer, 'retry', NOON_NY);
    expect(first).toMatchObject({ ok: true, outcome: { kind: 'deferred', reason: 'retry_scheduled' } });
    const [req] = await requestsFor(biz.businessId, customer);
    const requestId = req.id;

    const second = await processRequest(biz.businessId, requestId, addMinutes(NOON_NY, 1));
    expect(second).toMatchObject({ kind: 'deferred', reason: 'retry_scheduled' });
    const third = await processRequest(biz.businessId, requestId, addMinutes(NOON_NY, 5));
    expect(third).toEqual({ kind: 'failed', reason: 'max_attempts' });
    const attempts = await tenantRows(biz.businessId, `select attempt, status from messages where review_request_id = $1 order by attempt`, [requestId]);
    expect(attempts.map((a) => a.attempt)).toEqual([1, 2, 3]);
  });

  it('an ambiguous outcome is never retried, so no duplicate text goes out', async () => {
    const biz = await readyBusiness();
    const customer = await addCustomer(biz, { phone: '+12125550113', smsSource: 'Form' });
    queueSandboxFault('sms', 'ambiguous');
    const result = await sendNow(biz.businessId, biz.userId, customer, 'amb', NOON_NY);
    expect(result).toMatchObject({ ok: true, outcome: { kind: 'failed', reason: 'ambiguous_outcome_not_retried' } });
    const [req] = await requestsFor(biz.businessId, customer);
    expect(await processRequest(biz.businessId, req.id, addMinutes(NOON_NY, 10))).toMatchObject({ kind: 'skipped' });
    const [msg] = await tenantRows<{ status: string }>(biz.businessId, `select status from messages where review_request_id = $1`, [req.id]);
    expect(msg.status).toBe('unknown');
  });

  it('a permanent invalid-number error suppresses the SMS channel for that contact', async () => {
    const biz = await readyBusiness();
    const customer = await addCustomer(biz, { phone: '+12125550114', smsSource: 'Form' });
    queueSandboxFault('sms', 'permanent');
    const first = await sendNow(biz.businessId, biz.userId, customer, 'bad-number', NOON_NY);
    expect(first).toMatchObject({ ok: true, outcome: { kind: 'failed' } });
    const suppressed = await tenantRows(biz.businessId, `select 1 from suppressions where channel = 'sms' and reason = 'invalid'`);
    expect(suppressed).toHaveLength(1);
    const second = await sendNow(biz.businessId, biz.userId, customer, 'again', NOON_NY);
    expect(second).toMatchObject({ outcome: { kind: 'suppressed', reason: 'no_basis' } });
  });

  it('an email bounce blocks further email to that address', async () => {
    const biz = await readyBusiness();
    const customer = await createCustomer(biz.businessId, biz.userId, {
      firstName: 'Ana',
      lastName: '',
      phone: '',
      email: 'ana@example.com',
      language: 'en',
      smsConsentSource: '',
      emailConsentSource: 'Newsletter signup',
    }, NOON_NY);
    if (!customer.ok) throw new Error(customer.error);
    const first = await sendNow(biz.businessId, biz.userId, customer.id, 'email-1', NOON_NY);
    expect(first).toMatchObject({ outcome: { kind: 'sent', channel: 'email' } });
    const [msg] = await tenantRows<{ provider_message_id: string }>(biz.businessId, `select provider_message_id from messages where channel = 'email' and kind = 'review_request'`);
    expect(await handleEmailEvent({ providerMessageId: msg.provider_message_id, type: 'bounced' }, NOON_NY)).toBe('processed');
    const second = await sendNow(biz.businessId, biz.userId, customer.id, 'email-2', NOON_NY);
    expect(second).toMatchObject({ outcome: { kind: 'suppressed', reason: 'no_basis' } });
  });
});

describe('deletion', () => {
  it('cancels pending requests now, removes personal data on the worker, and keeps the block', async () => {
    const biz = await readyBusiness();
    const customer = await addCustomer(biz, { phone: '+12125550115', smsSource: 'Form' });
    await addVisit(biz, customer, new Date(NOON_NY.getTime() - 60 * 60_000), 'service', NOON_NY);
    const [queued] = await requestsFor(biz.businessId, customer);
    expect(queued.status).toBe('queued');

    const del = await requestDeletion(biz.businessId, biz.userId, customer, NOON_NY);
    expect(del.ok).toBe(true);
    const [cancelled] = await requestsFor(biz.businessId, customer);
    expect(cancelled.status).toBe('cancelled');

    await tick(NOON_NY);
    const [row] = await tenantRows<{ phone_enc: string | null; deleted_at: Date | null }>(biz.businessId, 'select phone_enc, deleted_at from customers where id = $1', [customer]);
    expect(row.phone_enc).toBeNull();
    expect(row.deleted_at).not.toBeNull();
    const kept = await tenantRows(biz.businessId, `select 1 from suppressions where reason = 'deleted'`);
    expect(kept.length).toBeGreaterThanOrEqual(1);

    const csv = 'first_name,phone,service_or_purchase,visit_date\nMaria,(212) 555-0115,Cleaning,2026-11-08\n';
    const summary = await importCustomers(biz.businessId, biz.userId, 'back.csv', csv, NOON_NY);
    expect(summary).toMatchObject({ created: 0, skipped: 1 });
  });
});

describe('automations and the worker', () => {
  it('a visit in the last 7 days queues an automated request that the worker sends', async () => {
    const realNow = new Date();
    const biz = await readyBusiness({ timeZone: zoneWhereItIsNoon(realNow) });
    const customer = await addCustomer(biz, { phone: '+12125550116', smsSource: 'Form' });
    const requestId = await addVisit(biz, customer, new Date(realNow.getTime() - 4 * 3_600_000), 'service', realNow);
    expect(requestId).not.toBeNull();

    const result = await tick(realNow, 50);
    expect(result.processed).toBeGreaterThanOrEqual(1);
    const [req] = await requestsFor(biz.businessId, customer);
    expect(req.status).toBe('sent');
  });

  it('a visit older than 7 days is stored but does not queue a request', async () => {
    const biz = await readyBusiness();
    const customer = await addCustomer(biz, { phone: '+12125550117', smsSource: 'Form' });
    const requestId = await addVisit(biz, customer, new Date(NOON_NY.getTime() - 10 * 86_400_000), 'service', NOON_NY);
    expect(requestId).toBeNull();
    const visits = await tenantRows(biz.businessId, 'select 1 from visits');
    expect(visits).toHaveLength(1);
  });

  it('enqueueAutomation is idempotent for the same visit', async () => {
    const biz = await readyBusiness();
    const customer = await addCustomer(biz, { phone: '+12125550118', smsSource: 'Form' });
    const visitId = randomUUID();
    await withTenant(biz.businessId, (tx) =>
      tx.query(
        `insert into visits (id, business_id, customer_id, service_name, visit_type, completed_at, source) values ($1, $2, $3, 'Cut', 'service', $4, 'manual')`,
        [visitId, biz.businessId, customer, NOON_NY],
      ),
    );
    const args = { businessId: biz.businessId, customerId: customer, visitId, visitKind: 'service' as const, completedAt: NOON_NY, at: NOON_NY };
    const first = await withTenant(biz.businessId, (tx) => enqueueAutomation(tx, args));
    const second = await withTenant(biz.businessId, (tx) => enqueueAutomation(tx, args));
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });
});

describe('send gate invariants', () => {
  it('the request-attempt uniqueness index blocks a second message for the same attempt', async () => {
    const biz = await readyBusiness();
    const customer = await addCustomer(biz, { phone: '+12125550119', smsSource: 'Form' });
    await sendNow(biz.businessId, biz.userId, customer, 'one', NOON_NY);
    const [req] = await requestsFor(biz.businessId, customer);
    await expect(
      withTenant(biz.businessId, (tx) =>
        tx.query(
          `insert into messages (business_id, review_request_id, kind, channel, client_ref, provider, attempt, status)
           values ($1, $2, 'review_request', 'sms', $3, 'sandbox-sms', 1, 'attempting')`,
          [biz.businessId, req.id, randomUUID()],
        ),
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

});
