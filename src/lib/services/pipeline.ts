import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getEmailAdapter, getSmsAdapter } from '../adapters';
import { SendError } from '../adapters/types';
import { cfg, LIMITS } from '../config';
import { decryptField, hashContact } from '../crypto';
import { encryptField } from '../crypto';
import { pool, q, withTenant, type Queryable } from '../db';
import { evaluateDispatch, type DispatchDecision, type DispatchInput } from '../dispatch';
import { lintTemplate } from '../lint';
import { normalizePhone } from '../phone';
import { renderMessage, type Channel, type Industry, type Kind, type Language } from '../templates';
import { makeUnsubscribeToken } from '../unsubscribe';
import { addDays, addMinutes } from '../time';
import { now as clockNow } from '../clock';
import { audit } from './audit';
import { notifyOwner } from './notify';
import { processDeletion } from './deletion';

export type ProcessOutcome =
  | { kind: 'sent'; channel: Channel }
  | { kind: 'deferred'; reason: string; until: Date }
  | { kind: 'suppressed'; reason: string }
  | { kind: 'expired' }
  | { kind: 'failed'; reason: string }
  | { kind: 'skipped'; status: string }
  | { kind: 'missing' };

interface RequestRow {
  request_id: string;
  business_id: string;
  status: string;
  due_at: Date;
  attempts: number;
  customer_id: string;
  deleted_at: Date | null;
  phone_enc: string | null;
  email_enc: string | null;
  first_name_enc: string | null;
  customer_tz: string | null;
  customer_lang: Language;
  business_name: string;
  industry: Industry;
  business_tz: string;
  quiet_start_hour: number;
  quiet_end_hour: number;
  frequency_window_days: number;
  postal_address: string;
  service_name: string | null;
  visit_type: 'service' | 'sale' | null;
  sender_status: string | null;
  sender_number: string | null;
  review_url: string | null;
  review_confirmed_at: Date | null;
  short_code: string | null;
}

const REQUEST_SQL = `
  select r.id as request_id, r.business_id, r.status, r.due_at, r.attempts, r.customer_id,
         c.deleted_at, c.phone_enc, c.email_enc, c.first_name_enc,
         c.time_zone as customer_tz, c.language as customer_lang,
         b.name as business_name, b.industry, b.time_zone as business_tz,
         b.quiet_start_hour, b.quiet_end_hour, b.frequency_window_days, b.postal_address,
         v.service_name, v.visit_type,
         sr.status as sender_status, sr.sender_number,
         rl.url as review_url, rl.confirmed_at as review_confirmed_at,
         sl.code as short_code
  from review_requests r
  join customers c on c.id = r.customer_id
  join businesses b on b.id = r.business_id
  left join visits v on v.id = r.visit_id
  left join sender_registrations sr on sr.business_id = r.business_id
  left join review_links rl on rl.business_id = r.business_id
  left join short_links sl on sl.business_id = r.business_id
  where r.id = $1`;

interface TemplateRow {
  id: string;
  version: number;
  lint_status: string;
  body: string;
  subject: string | null;
}

interface AttemptPlan {
  kind: 'attempt';
  requestId: string;
  businessId: string;
  customerId: string;
  messageId: string;
  attempt: number;
  channel: Channel;
  to: string;
  from: string | null;
  subject: string | null;
  text: string;
  headers: Record<string, string>;
  clientRef: string;
  contactHash: string;
}

type Plan = { kind: 'done'; outcome: ProcessOutcome; notifyTemplate: boolean } | AttemptPlan;

type AttemptResult = { ok: true; providerMessageId: string; segments: number } | { ok: false; error: unknown };

function done(outcome: ProcessOutcome, notifyTemplate = false): Plan {
  return { kind: 'done', outcome, notifyTemplate };
}

async function pickTemplate(
  tx: Queryable,
  industry: Industry,
  language: Language,
  channel: Channel,
  kind: Kind,
): Promise<TemplateRow | null> {
  const rows = await q<TemplateRow>(
    tx,
    `select id, version, lint_status, body, subject from templates
     where industry = $1 and language = $2 and channel = $3 and kind = $4`,
    [industry, language, channel, kind],
  );
  if (rows[0]) return rows[0];
  if (language !== 'en') return pickTemplate(tx, industry, 'en', channel, kind);
  return null;
}

async function deferRequest(tx: Queryable, requestId: string, reason: string, until: Date, at: Date): Promise<void> {
  await tx.query(
    `update review_requests set status = 'deferred', status_reason = $2, next_attempt_at = $3, updated_at = $4 where id = $1`,
    [requestId, reason, until, at],
  );
}

/**
 * Re-runs every check against current data. The request is claimed (status sending, plus one
 * message row in 'attempting') in the same transaction, so a crash can never send twice silently.
 */
async function planRequest(tx: PoolClient, businessId: string, requestId: string, at: Date): Promise<Plan> {
  const r = (await q<RequestRow>(tx, REQUEST_SQL, [requestId]))[0];
  if (!r) return done({ kind: 'missing' });

  if (r.status === 'sending') {
    const inflight = await q(
      tx,
      `select id from messages where review_request_id = $1 and status = 'attempting'`,
      [requestId],
    );
    if (inflight.length > 0) {
      await tx.query(
        `update messages set status = 'unknown', updated_at = $2 where review_request_id = $1 and status = 'attempting'`,
        [requestId, at],
      );
      await tx.query(
        `update review_requests set status = 'failed', failure_reason = 'interrupted_attempt_not_retried', updated_at = $2 where id = $1`,
        [requestId, at],
      );
      await audit(tx, businessId, 'system', 'request.interrupted', 'review_request', requestId);
      return done({ kind: 'failed', reason: 'interrupted_attempt_not_retried' });
    }
  } else if (r.status !== 'queued' && r.status !== 'deferred') {
    return done({ kind: 'skipped', status: r.status });
  }

  if (at.getTime() > r.due_at.getTime() + LIMITS.requestExpiryHours * 3_600_000) {
    await tx.query(
      `update review_requests set status = 'expired', status_reason = 'expired_unsent', updated_at = $2 where id = $1`,
      [requestId, at],
    );
    await audit(tx, businessId, 'system', 'request.expired', 'review_request', requestId);
    return done({ kind: 'expired' });
  }

  if (!r.review_url || !r.review_confirmed_at) {
    const until = addMinutes(at, LIMITS.senderHoldMinutes);
    await deferRequest(tx, requestId, 'review_link_unconfirmed', until, at);
    return done({ kind: 'deferred', reason: 'review_link_unconfirmed', until });
  }

  const consents = await q<{ type: string }>(
    tx,
    'select type from consents where customer_id = $1 and revoked_at is null',
    [r.customer_id],
  );
  const optedOut = await q(tx, 'select 1 from opt_outs where customer_id = $1 limit 1', [r.customer_id]);
  const suppressions = await q<{ channel: string }>(
    tx,
    'select channel from suppressions where customer_id = $1',
    [r.customer_id],
  );
  const recent = await q<{ n: number }>(
    tx,
    `select count(*)::int as n from review_requests
     where customer_id = $1 and id <> $2
       and ((sent_at is not null and sent_at > $3::timestamptz - make_interval(days => $4::int)) or status = 'sending')`,
    [r.customer_id, requestId, at, r.frequency_window_days],
  );

  const phoneRaw = decryptField(r.phone_enc);
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const email = decryptField(r.email_enc);

  const input: DispatchInput = {
    now: at,
    businessTimeZone: r.business_tz,
    customerTimeZone: r.customer_tz,
    quietStartHour: r.quiet_start_hour,
    quietEndHour: r.quiet_end_hour,
    customerDeleted: r.deleted_at !== null,
    optedOut: optedOut.length > 0,
    allContactSuppressed: suppressions.some((s) => s.channel === 'all'),
    smsSuppressed: suppressions.some((s) => s.channel === 'sms'),
    emailSuppressed: suppressions.some((s) => s.channel === 'email'),
    hasSmsConsent: consents.some((c) => c.type === 'sms_pew'),
    hasEmailConsent: consents.some((c) => c.type === 'email_opt_in'),
    hasPhone: phone !== null,
    phoneIsUS: phone?.isUS ?? false,
    hasEmail: email !== null,
    senderApproved: r.sender_status === 'approved' && r.sender_number !== null,
    recentSentCount: recent[0]?.n ?? 0,
    templateLintPassed: true,
  };

  const kind: Kind = r.visit_type === 'sale' ? 'retail' : 'service';
  let decision: DispatchDecision = evaluateDispatch(input);
  let template: TemplateRow | null = null;
  if (decision.action === 'send') {
    template = await pickTemplate(tx, r.industry, r.customer_lang, decision.channel, kind);
    const lintOk =
      template !== null &&
      template.lint_status === 'passed' &&
      lintTemplate({ body: template.body, subject: template.subject, channel: decision.channel, industry: r.industry }).ok;
    if (!lintOk) decision = evaluateDispatch({ ...input, templateLintPassed: false });
  }

  if (decision.action === 'suppress') {
    await tx.query(
      `update review_requests set status = 'suppressed', status_reason = $2, updated_at = $3 where id = $1`,
      [requestId, decision.reason, at],
    );
    await audit(tx, businessId, 'system', `request.suppressed.${decision.reason}`, 'review_request', requestId);
    return done({ kind: 'suppressed', reason: decision.reason }, decision.reason === 'template_invalid');
  }
  if (decision.action === 'defer') {
    await deferRequest(tx, requestId, decision.reason, decision.until, at);
    return done({ kind: 'deferred', reason: decision.reason, until: decision.until });
  }

  // decision.action === 'send'
  if (!template || !r.short_code) throw new Error('Template or short link is missing for this business');
  const channel = decision.channel;
  if (channel === 'sms' && (!phone || !phone.isUS || !r.sender_number)) throw new Error('SMS send without a valid recipient');
  if (channel === 'email' && !email) throw new Error('Email send without an address');

  const base = cfg().appBaseUrl;
  const token = makeUnsubscribeToken(businessId, r.customer_id);
  const rendered = renderMessage({
    channel,
    language: r.customer_lang,
    subject: template.subject,
    body: template.body,
    firstName: decryptField(r.first_name_enc),
    businessName: r.business_name,
    service: r.service_name,
    reviewLink: `${base}/r/${r.short_code}`,
    supportLink: `${base}/contact/${r.short_code}`,
    postalAddress: r.postal_address,
    unsubscribeLink: `${base}/unsubscribe/${token}`,
  });

  const attempt = r.attempts + 1;
  const clientRef = randomUUID();
  const to = channel === 'sms' ? (phone as { e164: string }).e164 : (email as string);
  const provider = channel === 'sms' ? getSmsAdapter().name : getEmailAdapter().name;
  const inserted = await q<{ id: string }>(
    tx,
    `insert into messages (business_id, review_request_id, kind, channel, client_ref, provider, attempt, status,
                           to_enc, body_enc, subject, template_id, template_version)
     values ($1, $2, 'review_request', $3, $4, $5, $6, 'attempting', $7, $8, $9, $10, $11)
     returning id`,
    [
      businessId,
      requestId,
      channel,
      clientRef,
      provider,
      attempt,
      encryptField(to),
      encryptField(rendered.text),
      rendered.subject,
      template.id,
      template.version,
    ],
  );
  await tx.query(
    `update review_requests set status = 'sending', channel = $2, template_id = $3, attempts = $4,
            next_attempt_at = $5, updated_at = $6 where id = $1`,
    [requestId, channel, template.id, attempt, addMinutes(at, LIMITS.leaseMinutes), at],
  );
  await audit(tx, businessId, 'system', 'request.attempt', 'review_request', requestId);

  return {
    kind: 'attempt',
    requestId,
    businessId,
    customerId: r.customer_id,
    messageId: inserted[0].id,
    attempt,
    channel,
    to,
    from: channel === 'sms' ? r.sender_number : null,
    subject: rendered.subject,
    text: rendered.text,
    headers:
      channel === 'email'
        ? {
            'List-Unsubscribe': `<${base}/api/unsubscribe?token=${token}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          }
        : {},
    clientRef,
    contactHash: channel === 'sms' ? hashContact('phone', to) : hashContact('email', to),
  };
}

async function finalize(tx: PoolClient, plan: AttemptPlan, result: AttemptResult, at: Date): Promise<ProcessOutcome> {
  if (result.ok) {
    await tx.query(
      `update messages set status = 'accepted', provider_message_id = $2, segments = $3, updated_at = $4 where id = $1`,
      [plan.messageId, result.providerMessageId, result.segments, at],
    );
    await tx.query(
      `update review_requests set status = 'sent', sent_at = $2, status_reason = null, failure_reason = null, updated_at = $2 where id = $1`,
      [plan.requestId, at],
    );
    await audit(tx, plan.businessId, 'system', 'request.sent', 'review_request', plan.requestId);
    return { kind: 'sent', channel: plan.channel };
  }

  const error = result.error;
  const sendError =
    error instanceof SendError
      ? error
      : new SendError(error instanceof Error ? error.message : 'Unknown error', 'ambiguous', 'unknown');

  if (sendError.kind === 'transient') {
    await tx.query(`update messages set status = 'failed', error_code = $2, updated_at = $3 where id = $1`, [
      plan.messageId,
      sendError.code,
      at,
    ]);
    if (plan.attempt >= LIMITS.maxSendAttempts) {
      await tx.query(
        `update review_requests set status = 'failed', failure_reason = 'max_attempts', updated_at = $2 where id = $1`,
        [plan.requestId, at],
      );
      await audit(tx, plan.businessId, 'system', 'request.failed.max_attempts', 'review_request', plan.requestId);
      return { kind: 'failed', reason: 'max_attempts' };
    }
    const retryAt = new Date(at.getTime() + LIMITS.retryBaseSeconds * 2 ** (plan.attempt - 1) * 1000);
    await tx.query(
      `update review_requests set status = 'queued', status_reason = 'retry_scheduled', next_attempt_at = $2, updated_at = $3 where id = $1`,
      [plan.requestId, retryAt, at],
    );
    return { kind: 'deferred', reason: 'retry_scheduled', until: retryAt };
  }

  if (sendError.kind === 'ambiguous') {
    // The provider may have accepted the message. Retrying could send a duplicate, so we do not.
    await tx.query(`update messages set status = 'unknown', error_code = $2, updated_at = $3 where id = $1`, [
      plan.messageId,
      sendError.code,
      at,
    ]);
    await tx.query(
      `update review_requests set status = 'failed', failure_reason = 'ambiguous_outcome_not_retried', updated_at = $2 where id = $1`,
      [plan.requestId, at],
    );
    await audit(tx, plan.businessId, 'system', 'request.failed.ambiguous', 'review_request', plan.requestId);
    return { kind: 'failed', reason: 'ambiguous_outcome_not_retried' };
  }

  await tx.query(`update messages set status = 'failed', error_code = $2, updated_at = $3 where id = $1`, [
    plan.messageId,
    sendError.code,
    at,
  ]);
  await tx.query(
    `update review_requests set status = 'failed', failure_reason = $2, updated_at = $3 where id = $1`,
    [plan.requestId, `permanent_error:${sendError.code}`, at],
  );
  if (sendError.contactInvalid) {
    await tx.query(
      `insert into suppressions (business_id, customer_id, channel, contact_hash, reason) values ($1, $2, $3, $4, 'invalid')`,
      [plan.businessId, plan.customerId, plan.channel, plan.contactHash],
    );
  }
  await audit(tx, plan.businessId, 'system', 'request.failed.permanent', 'review_request', plan.requestId);
  return { kind: 'failed', reason: `permanent_error:${sendError.code}` };
}

/**
 * Processes one review request end to end: plan (short transaction), provider call
 * (no transaction open), then finalize (short transaction).
 */
export async function processRequest(businessId: string, requestId: string, at: Date = clockNow()): Promise<ProcessOutcome> {
  const plan = await withTenant(businessId, (tx) => planRequest(tx, businessId, requestId, at));
  if (plan.kind === 'done') {
    if (plan.notifyTemplate) {
      await notifyOwner(
        businessId,
        'A review request was not sent',
        'A review request was held because its message template did not pass the wording check. Open Templates in StarNudge to fix the wording.',
      );
    }
    return plan.outcome;
  }

  let result: AttemptResult;
  try {
    if (plan.channel === 'sms') {
      const sent = await getSmsAdapter().send({
        to: plan.to,
        from: plan.from ?? '',
        body: plan.text,
        clientRef: plan.clientRef,
      });
      result = { ok: true, providerMessageId: sent.providerMessageId, segments: sent.segments };
    } else {
      const sent = await getEmailAdapter().send({
        to: plan.to,
        from: cfg().notifyFromEmail,
        subject: plan.subject ?? '',
        text: plan.text,
        headers: plan.headers,
        clientRef: plan.clientRef,
      });
      result = { ok: true, providerMessageId: sent.providerMessageId, segments: 0 };
    }
  } catch (error) {
    result = { ok: false, error };
  }
  return withTenant(businessId, (tx) => finalize(tx, plan, result, at));
}

/** Queues an automated request for a completed visit. Only visits inside the recency window qualify. */
export async function enqueueAutomation(
  tx: Queryable,
  args: { businessId: string; customerId: string; visitId: string; visitKind: Kind; completedAt: Date; at: Date },
): Promise<string | null> {
  const rules = await q<{ delay_minutes: number; enabled: boolean }>(
    tx,
    'select delay_minutes, enabled from automation_rules where visit_kind = $1',
    [args.visitKind],
  );
  const rule = rules[0];
  if (!rule || !rule.enabled) return null;
  if (args.completedAt.getTime() < addDays(args.at, -LIMITS.automationRecencyDays).getTime()) return null;
  const dueAt = new Date(Math.max(args.at.getTime(), args.completedAt.getTime() + rule.delay_minutes * 60_000));
  const rows = await q<{ id: string }>(
    tx,
    `insert into review_requests (business_id, customer_id, visit_id, source, idempotency_key, status, due_at, next_attempt_at)
     values ($1, $2, $3, 'automation', $4, 'queued', $5, $5)
     on conflict (business_id, idempotency_key) do nothing
     returning id`,
    [args.businessId, args.customerId, args.visitId, `${args.businessId}:${args.customerId}:${args.visitId}`, dueAt],
  );
  return rows[0]?.id ?? null;
}

/** Creates a manual request. The nonce comes from the form, so a double submit creates one request. */
export async function enqueueManual(
  tx: Queryable,
  args: { businessId: string; customerId: string; nonce: string; at: Date },
): Promise<string> {
  const rows = await q<{ id: string }>(
    tx,
    `insert into review_requests (business_id, customer_id, source, idempotency_key, status, due_at, next_attempt_at)
     values ($1, $2, 'manual', $3, 'queued', $4, $4)
     on conflict (business_id, idempotency_key) do update set updated_at = excluded.updated_at
     returning id`,
    [args.businessId, args.customerId, `${args.businessId}:${args.customerId}:manual:${args.nonce}`, args.at],
  );
  return rows[0].id;
}

/**
 * One worker tick: process pending deletions, then claim and process due requests.
 * Each request is handled independently, so one failure never stops the batch.
 */
export async function tick(at: Date = clockNow(), limit = 50): Promise<{ deletions: number; processed: number }> {
  const deletions = await q<{ deletion_id: string; business_id: string; customer_id: string }>(
    pool(),
    'select * from claim_pending_deletions($1)',
    [20],
  );
  for (const d of deletions) {
    await processDeletion(d.business_id, d.deletion_id, d.customer_id, at);
  }
  const claimed = await q<{ request_id: string; business_id: string }>(
    pool(),
    'select * from claim_due_review_requests($1)',
    [limit],
  );
  for (const c of claimed) {
    try {
      await processRequest(c.business_id, c.request_id, at);
    } catch (err) {
      console.error(`request ${c.request_id} failed to process`, err);
    }
  }
  return { deletions: deletions.length, processed: claimed.length };
}
