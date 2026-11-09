import { describe, expect, it } from 'vitest';
import { evaluateDispatch, DISPATCH_INPUT_KEYS, type DispatchInput } from '@/lib/dispatch';
import { lintTemplate } from '@/lib/lint';
import { defaultTemplates, INDUSTRIES, renderMessage } from '@/lib/templates';
import { validateImport, IMPORT_HEADERS } from '@/lib/import-rules';
import { mapStripeEvent } from '@/lib/stripe-events';
import { verifySandboxSignature, verifyStripeSignature, verifySvixSignature, verifyTwilioSignature } from '@/lib/webhook-verify';
import { createHmac } from 'node:crypto';

const NOON_NY = new Date('2026-11-09T17:00:00.000Z'); // 12:00 in New York
const NIGHT_NY = new Date('2026-11-10T03:00:00.000Z'); // 22:00 on the 9th in New York

function base(overrides: Partial<DispatchInput> = {}): DispatchInput {
  return {
    now: NOON_NY,
    businessTimeZone: 'America/New_York',
    customerTimeZone: null,
    quietStartHour: 8,
    quietEndHour: 21,
    customerDeleted: false,
    optedOut: false,
    allContactSuppressed: false,
    smsSuppressed: false,
    emailSuppressed: false,
    hasSmsConsent: true,
    hasEmailConsent: false,
    hasPhone: true,
    phoneIsUS: true,
    hasEmail: false,
    senderApproved: true,
    recentSentCount: 0,
    templateLintPassed: true,
    ...overrides,
  };
}

describe('dispatch rules, in the order from the brief', () => {
  it('sends on a clean, consented, in-window request', () => {
    expect(evaluateDispatch(base())).toEqual({ action: 'send', channel: 'sms' });
  });

  it('check 1: opt-out beats everything else', () => {
    expect(evaluateDispatch(base({ optedOut: true, recentSentCount: 5 }))).toEqual({ action: 'suppress', reason: 'opted_out' });
  });

  it('check 2: deleted customers and contact-wide suppressions stop the request', () => {
    expect(evaluateDispatch(base({ customerDeleted: true }))).toEqual({ action: 'suppress', reason: 'contact_deleted' });
    expect(evaluateDispatch(base({ allContactSuppressed: true }))).toEqual({ action: 'suppress', reason: 'contact_suppressed' });
  });

  it('check 3: SMS needs written consent and a US number; email needs an opt-in', () => {
    expect(evaluateDispatch(base({ hasSmsConsent: false }))).toEqual({ action: 'suppress', reason: 'no_basis' });
    expect(evaluateDispatch(base({ phoneIsUS: false }))).toEqual({ action: 'suppress', reason: 'no_basis' });
    expect(
      evaluateDispatch(base({ hasSmsConsent: false, hasEmailConsent: true, hasEmail: true, hasPhone: false, phoneIsUS: false })),
    ).toEqual({ action: 'send', channel: 'email' });
  });

  it('check 3: a channel-specific suppression moves the request to the other channel', () => {
    const d = evaluateDispatch(base({ smsSuppressed: true, hasEmailConsent: true, hasEmail: true }));
    expect(d).toEqual({ action: 'send', channel: 'email' });
    expect(evaluateDispatch(base({ smsSuppressed: true }))).toEqual({ action: 'suppress', reason: 'no_basis' });
  });

  it('check 4: an unapproved SMS sender holds the request and never switches channel', () => {
    const d = evaluateDispatch(base({ senderApproved: false, hasEmailConsent: true, hasEmail: true }));
    expect(d.action).toBe('defer');
    expect(d).toMatchObject({ action: 'defer', reason: 'sender_pending' });
  });

  it('check 5: the frequency cap suppresses, whether the earlier request was manual or automated', () => {
    expect(evaluateDispatch(base({ recentSentCount: 1 }))).toEqual({ action: 'suppress', reason: 'frequency_cap' });
  });

  it('check 6: quiet hours defer to the next 08:00 in the customer time zone', () => {
    const d = evaluateDispatch(base({ now: NIGHT_NY, customerTimeZone: 'America/New_York' }));
    expect(d.action).toBe('defer');
    if (d.action !== 'defer') throw new Error('expected defer');
    expect(d.reason).toBe('quiet_hours');
    expect(d.until.toISOString()).toBe('2026-11-10T13:00:00.000Z'); // 08:00 EST on the 10th
  });

  it('check 6: a customer time zone overrides the business time zone', () => {
    // 12:00 in New York is 09:00 in Los Angeles. Inside the window either way.
    const d = evaluateDispatch(base({ customerTimeZone: 'America/Los_Angeles' }));
    expect(d).toEqual({ action: 'send', channel: 'sms' });
    // 22:00 in New York is 19:00 in Los Angeles: inside the window even though New York is not.
    expect(evaluateDispatch(base({ now: NIGHT_NY, customerTimeZone: 'America/Los_Angeles' }))).toEqual({ action: 'send', channel: 'sms' });
  });

  it('check 7: a template that fails lint suppresses the request', () => {
    expect(evaluateDispatch(base({ templateLintPassed: false }))).toEqual({ action: 'suppress', reason: 'template_invalid' });
  });

  it('rule R2: eligibility has no rating, review, feedback, sentiment, or complaint input', () => {
    for (const key of DISPATCH_INPUT_KEYS) {
      expect(key).not.toMatch(/rating|review|feedback|sentiment|complain/i);
    }
  });
});

describe('template lint (rule R3)', () => {
  const sms = (body: string) => lintTemplate({ body, channel: 'sms', industry: 'restaurant' });

  it('passes a clean request', () => {
    expect(sms('Hi {first_name}, thanks for visiting {business_name}! Share your experience: {review_link}').ok).toBe(true);
  });
  it('blocks rating language', () => {
    expect(sms('Give us 5 stars: {review_link} {business_name}').ok).toBe(false);
    expect(sms('Rate us: {review_link} {business_name}').ok).toBe(false);
  });
  it('blocks incentive words as whole words', () => {
    expect(sms('Get 10% off! {review_link} {business_name}').ok).toBe(false);
    expect(sms('A reward for you: {review_link} {business_name}').ok).toBe(false);
    expect(sms('Leave a review, you could win a prize: {review_link} {business_name}').ok).toBe(false);
  });
  it('blocks asking someone to change or remove a review', () => {
    expect(sms('Please update your review: {review_link} {business_name}').ok).toBe(false);
    expect(sms('Remove your review if it was bad: {review_link} {business_name}').ok).toBe(false);
  });
  it('blocks presenting the support link as a replacement for reviewing', () => {
    expect(sms('Contact us instead of leaving a review: {review_link} {business_name}').ok).toBe(false);
  });
  it('requires the review link and the business name in SMS', () => {
    expect(sms('Hi {first_name}').ok).toBe(false);
    expect(lintTemplate({ body: 'Hi {first_name} {review_link}', channel: 'sms', industry: 'restaurant' }).ok).toBe(false);
  });
  it('blocks {service} for dental and medical messages', () => {
    expect(lintTemplate({ body: 'Thanks for your {service}, {review_link}', channel: 'email', subject: 'Thanks', industry: 'dental_medical' }).ok).toBe(false);
    expect(lintTemplate({ body: 'Thanks for your {service}, {review_link}', channel: 'email', subject: 'Thanks', industry: 'salon' }).ok).toBe(true);
  });
  it('rejects unknown merge fields', () => {
    expect(sms('Hi {nickname} {review_link} {business_name}').ok).toBe(false);
  });
  it('requires a subject for email', () => {
    expect(lintTemplate({ body: 'Hi {review_link}', channel: 'email', industry: 'auto' }).ok).toBe(false);
  });
});

describe('default templates for every industry pass lint', () => {
  it.each(INDUSTRIES)('%s', (industry) => {
    for (const t of defaultTemplates(industry)) {
      const result = lintTemplate({ body: t.body, subject: t.subject, channel: t.channel, industry });
      expect(result.problems).toEqual([]);
      expect(result.ok).toBe(true);
    }
  });
  it('dental and medical defaults never use {service}', () => {
    for (const t of defaultTemplates('dental_medical')) expect(t.body).not.toContain('{service}');
  });
});

describe('rendering adds the support link, opt-out text, and email footer', () => {
  const common = {
    businessName: 'Harbor Street Kitchen',
    postalAddress: '100 Demo Street, Springfield, NY 10001',
    reviewLink: 'https://app.example/r/abc',
    supportLink: 'https://app.example/contact/abc',
    unsubscribeLink: 'https://app.example/unsubscribe/tok',
    service: 'Dinner for two',
    subject: null,
  };
  it('SMS gets the support link and STOP text when the template lacks them', () => {
    const { text } = renderMessage({
      ...common,
      channel: 'sms',
      language: 'en',
      firstName: 'Maria',
      body: 'Hi {first_name}, thanks! Share: {review_link}',
    });
    expect(text).toContain('https://app.example/r/abc');
    expect(text).toContain('Have a problem? Contact us: https://app.example/contact/abc');
    expect(text).toMatch(/Reply STOP to opt out\.$/);
  });
  it('email gets the postal address and unsubscribe footer', () => {
    const { text, subject } = renderMessage({
      ...common,
      channel: 'email',
      language: 'es',
      firstName: null,
      subject: 'Gracias, {business_name}',
      body: 'Hola {first_name}: {review_link}',
    });
    expect(subject).toBe('Gracias, Harbor Street Kitchen');
    expect(text).toContain('Hola there:');
    expect(text).toContain('100 Demo Street, Springfield, NY 10001');
    expect(text).toContain('Cancelar suscripción: https://app.example/unsubscribe/tok');
  });
});

describe('customer import rules', () => {
  const now = new Date('2026-11-09T17:00:00.000Z');
  const header = IMPORT_HEADERS.join(',');

  it('accepts a valid row and turns it into a visit and consent', () => {
    const csv = `${header}\nMaria,Lopez,(212) 555-0100,,Cleaning,2026-10-02,service,en,sms_pew,Intake form,2026-10-02\n`;
    const v = validateImport(csv, { timeZone: 'America/New_York', now });
    expect(v.fatal).toBeNull();
    expect(v.rows).toHaveLength(1);
    expect(v.rows[0].phone?.e164).toBe('+12125550100');
    expect(v.rows[0].consent?.type).toBe('sms_pew');
    expect(v.errors).toEqual([]);
  });

  it('reports row-level errors without stopping the other rows', () => {
    const csv = [
      header,
      'A,B,,,Cut,2026-10-02,service,en,,,',
      'C,D,(212) 555-0101,,Cut,2030-01-01,service,en,,,',
      'E,F,(212) 555-0102,,Cut,2026-10-02,service,en,sms_pew,,',
      'G,H,(212) 555-0103,,Cut,2026-10-02,service,en,,,',
    ].join('\n');
    const v = validateImport(csv, { timeZone: 'America/New_York', now });
    expect(v.rows.map((r) => r.line)).toEqual([5]);
    expect(v.errors.map((e) => e.line)).toEqual([2, 3, 4]);
  });

  it('refuses SMS consent for a non-US number', () => {
    const csv = `${header}\nA,B,+442079460958,,Cut,2026-10-02,service,en,sms_pew,Form,2026-10-02\n`;
    const v = validateImport(csv, { timeZone: 'America/New_York', now });
    expect(v.errors[0].message).toMatch(/US phone/);
  });

  it('fails the whole file when required columns are missing', () => {
    expect(validateImport('first_name\nA', { timeZone: 'UTC', now }).fatal).toMatch(/phone or email/);
  });

  it('caps a file at 5,000 rows', () => {
    const rows = Array.from({ length: 5001 }, (_, i) => `A,B,(212) 555-${String(i % 9000 + 1000)},,Cut,2026-10-02,service,en,,,`);
    const v = validateImport([header, ...rows].join('\n'), { timeZone: 'UTC', now });
    expect(v.fatal).toMatch(/5000/);
  });
});

describe('webhook signatures', () => {
  it('sandbox: accepts only the correct HMAC', () => {
    const body = '{"type":"inbound"}';
    const sig = createHmac('sha256', 'secret').update(body).digest('hex');
    expect(verifySandboxSignature(body, sig, 'secret')).toBe(true);
    expect(verifySandboxSignature(body, sig, 'other')).toBe(false);
    expect(verifySandboxSignature(body, null, 'secret')).toBe(false);
  });

  it('Stripe: checks the signature and the five-minute tolerance', () => {
    const body = '{"id":"evt_1"}';
    const t = 1_700_000_000;
    const sig = createHmac('sha256', 'whsec').update(`${t}.${body}`).digest('hex');
    const header = `t=${t},v1=${sig}`;
    expect(verifyStripeSignature(body, header, 'whsec', t + 10)).toBe(true);
    expect(verifyStripeSignature(body, header, 'whsec', t + 600)).toBe(false);
    expect(verifyStripeSignature(body + ' ', header, 'whsec', t + 10)).toBe(false);
  });

  it('Svix (Resend): verifies v1 signatures with the whsec key', () => {
    const secretBytes = Buffer.from('a-test-secret-key-of-some-length');
    const secret = `whsec_${secretBytes.toString('base64')}`;
    const body = '{"type":"email.delivered"}';
    const id = 'msg_1';
    const ts = '1700000000';
    const sig = createHmac('sha256', secretBytes).update(`${id}.${ts}.${body}`).digest('base64');
    expect(verifySvixSignature(body, { id, timestamp: ts, signature: `v1,${sig}` }, secret, 1_700_000_001)).toBe(true);
    expect(verifySvixSignature(body, { id, timestamp: ts, signature: 'v1,bogus' }, secret, 1_700_000_001)).toBe(false);
  });

  it('Twilio: verifies the URL-plus-params HMAC-SHA1', () => {
    const url = 'https://app.example/api/webhooks/sms';
    const params = { From: '+12125550100', Body: 'STOP', MessageSid: 'SM1' };
    const data = url + 'Body' + 'STOP' + 'From' + '+12125550100' + 'MessageSid' + 'SM1';
    const sig = createHmac('sha1', 'token').update(data).digest('base64');
    expect(verifyTwilioSignature(url, params, sig, 'token')).toBe(true);
    expect(verifyTwilioSignature(url, { ...params, Body: 'START' }, sig, 'token')).toBe(false);
  });
});

describe('Stripe event mapping', () => {
  it('maps checkout completion to the business', () => {
    const update = mapStripeEvent({
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'biz-1', customer: 'cus_1', subscription: 'sub_1' } },
    });
    expect(update).toEqual({ kind: 'checkout_completed', businessId: 'biz-1', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
  });
  it('maps cancel-at-period-end and deletion', () => {
    const cancelling = mapStripeEvent({
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: true, current_period_end: 1_800_000_000 } },
    });
    expect(cancelling).toMatchObject({ kind: 'subscription_changed', status: 'canceled_at_period_end' });
    const deleted = mapStripeEvent({
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', customer: 'cus_1', status: 'canceled' } },
    });
    expect(deleted).toMatchObject({ kind: 'subscription_changed', status: 'canceled' });
  });
  it('ignores unrelated events', () => {
    expect(mapStripeEvent({ type: 'invoice.paid', data: { object: {} } })).toEqual({ kind: 'ignored' });
  });
});
