import { randomUUID } from 'node:crypto';
import { getSmsAdapter } from '../adapters';
import { SendError } from '../adapters/types';
import { encryptField, hashContact } from '../crypto';
import { pool, q, withTenant, type Queryable } from '../db';
import { normalizePhone } from '../phone';
import { classifyInbound } from '../keywords';
import { parseUnsubscribeToken } from '../unsubscribe';
import { now as clockNow } from '../clock';
import { cfg } from '../config';
import { audit } from './audit';
import { notifyOwner } from './notify';

/** Records an opt-out. It blocks every channel for the business (rule R5) and holds pending requests. */
export async function recordOptOut(
  tx: Queryable,
  businessId: string,
  customerId: string,
  channel: 'sms' | 'email' | 'web',
  source: string,
  contactHash: string | null,
  at: Date,
): Promise<void> {
  await tx.query(
    `insert into opt_outs (business_id, customer_id, channel, source) values ($1, $2, $3, $4)
     on conflict (business_id, customer_id, channel) do nothing`,
    [businessId, customerId, channel, source],
  );
  if (contactHash) {
    await tx.query(
      `insert into suppressions (business_id, customer_id, channel, contact_hash, reason)
       values ($1, $2, 'all', $3, 'opted_out')`,
      [businessId, customerId, contactHash],
    );
  }
  await tx.query(
    `update review_requests set status = 'suppressed', status_reason = 'opted_out', updated_at = $2
     where customer_id = $1 and status in ('queued', 'deferred')`,
    [customerId, at],
  );
  await audit(tx, businessId, 'customer', 'customer.opted_out', 'customer', customerId);
}

async function sendSystemSms(businessId: string, to: string, from: string, body: string): Promise<void> {
  const adapter = getSmsAdapter();
  const clientRef = randomUUID();
  let providerMessageId: string | null = null;
  let status: 'accepted' | 'failed' = 'accepted';
  let errorCode: string | null = null;
  try {
    const sent = await adapter.send({ to, from, body, clientRef });
    providerMessageId = sent.providerMessageId;
  } catch (err) {
    status = 'failed';
    errorCode = err instanceof SendError ? err.code : 'error';
  }
  await withTenant(businessId, (tx) =>
    tx.query(
      `insert into messages (business_id, kind, channel, client_ref, provider, provider_message_id, attempt, status, error_code, to_enc, body_enc)
       values ($1, 'auto_reply', 'sms', $2, $3, $4, 1, $5, $6, $7, $8)`,
      [businessId, clientRef, adapter.name, providerMessageId, status, errorCode, encryptField(to), encryptField(body)],
    ),
  );
}

export type InboundResult =
  | { status: 'processed'; keyword: string }
  | { status: 'duplicate' }
  | { status: 'unknown_sender' };

/**
 * Inbound SMS. Opt-out keywords block the business for this customer. START and UNSTOP are
 * logged but never re-subscribe. HELP gets an automatic reply. Anything else goes to the inbox.
 */
export async function handleInboundSms(
  input: { providerMessageId: string; from: string; to: string; body: string },
  at: Date = clockNow(),
): Promise<InboundResult> {
  const to = normalizePhone(input.to)?.e164;
  const from = normalizePhone(input.from)?.e164;
  if (!to || !from) return { status: 'unknown_sender' };
  const found = await q<{ business_id: string | null }>(pool(), 'select find_business_by_sender($1) as business_id', [to]);
  const businessId = found[0]?.business_id;
  if (!businessId) return { status: 'unknown_sender' };

  const keyword = classifyInbound(input.body);
  const outcome = await withTenant(businessId, async (tx) => {
    const fresh = await tx.query(
      `insert into webhook_events (provider, event_id) values ('sms-inbound', $1) on conflict do nothing returning 1`,
      [input.providerMessageId],
    );
    if (fresh.rowCount === 0) return { status: 'duplicate' as const };

    const customer = await q<{ id: string }>(
      tx,
      'select id from customers where phone_hash = $1 and deleted_at is null',
      [hashContact('phone', from)],
    );
    const customerId = customer[0]?.id ?? null;
    const inbound = await q<{ id: string }>(
      tx,
      `insert into inbound_messages (business_id, customer_id, channel, provider_message_id, keyword, body_enc)
       values ($1, $2, 'sms', $3, $4, $5) returning id`,
      [businessId, customerId, input.providerMessageId, keyword === 'other' ? 'other' : keyword, encryptField(input.body)],
    );

    if (keyword === 'stop') {
      if (customerId) {
        await recordOptOut(tx, businessId, customerId, 'sms', 'sms_stop', hashContact('phone', from), at);
      } else {
        // Unknown number: keep only the hashed suppression so a later import cannot re-message it.
        await tx.query(
          `insert into suppressions (business_id, channel, contact_hash, reason) values ($1, 'all', $2, 'opted_out')`,
          [businessId, hashContact('phone', from)],
        );
      }
    }

    let notify = false;
    if (keyword === 'other') {
      await tx.query(
        `insert into support_threads (business_id, customer_id, inbound_message_id, source, body_enc)
         values ($1, $2, $3, 'sms', $4)`,
        [businessId, customerId, inbound[0].id, encryptField(input.body)],
      );
      notify = true;
    }
    const sender = await q<{ sender_number: string | null }>(
      tx,
      'select sender_number from sender_registrations where business_id = $1',
      [businessId],
    );
    const link = await q<{ code: string }>(tx, 'select code from short_links where business_id = $1', [businessId]);
    return {
      status: 'processed' as const,
      keyword,
      notify,
      replyFrom: sender[0]?.sender_number ?? null,
      shortCode: link[0]?.code ?? null,
    };
  });

  if (outcome.status !== 'processed') return { status: outcome.status };
  if (outcome.keyword === 'help' && outcome.replyFrom) {
    const supportLink = outcome.shortCode ? `${cfg().appBaseUrl}/contact/${outcome.shortCode}` : cfg().appBaseUrl;
    await sendSystemSms(
      businessId,
      from,
      outcome.replyFrom,
      `StarNudge help for this business: ${supportLink} Reply STOP to opt out.`,
    );
  }
  if (outcome.notify) {
    await notifyOwner(businessId, 'New text message in StarNudge', 'A customer texted your review line. Open the inbox to read it and reply.');
  }
  return { status: 'processed', keyword: outcome.keyword };
}

/** Delivery receipts from the SMS provider. Undelivered numbers are suppressed for SMS. */
export async function handleSmsStatus(
  input: { providerMessageId: string; status: 'delivered' | 'undelivered' | 'failed'; errorCode?: string },
  at: Date = clockNow(),
): Promise<'processed' | 'duplicate' | 'unknown'> {
  const found = await q<{ business_id: string | null }>(pool(), 'select find_business_by_message($1) as business_id', [input.providerMessageId]);
  const businessId = found[0]?.business_id;
  if (!businessId) return 'unknown';
  return withTenant(businessId, async (tx) => {
    const fresh = await tx.query(
      `insert into webhook_events (provider, event_id) values ('sms-status', $1) on conflict do nothing returning 1`,
      [`${input.providerMessageId}:${input.status}`],
    );
    if (fresh.rowCount === 0) return 'duplicate' as const;
    const msg = await q<{ id: string; review_request_id: string | null }>(
      tx,
      'select id, review_request_id from messages where provider_message_id = $1',
      [input.providerMessageId],
    );
    if (!msg[0]) return 'unknown' as const;
    if (input.status === 'delivered') {
      await tx.query(`update messages set status = 'delivered', updated_at = $2 where id = $1`, [msg[0].id, at]);
      if (msg[0].review_request_id) {
        await tx.query(
          `update review_requests set status = 'delivered', delivered_at = $2, updated_at = $2
           where id = $1 and status = 'sent'`,
          [msg[0].review_request_id, at],
        );
      }
      return 'processed' as const;
    }
    await tx.query(`update messages set status = 'undelivered', error_code = $2, updated_at = $3 where id = $1`, [
      msg[0].id,
      input.errorCode ?? input.status,
      at,
    ]);
    if (msg[0].review_request_id) {
      const req = await q<{ customer_id: string; phone_hash: string | null }>(
        tx,
        `select r.customer_id, c.phone_hash from review_requests r join customers c on c.id = r.customer_id where r.id = $1`,
        [msg[0].review_request_id],
      );
      await tx.query(
        `update review_requests set status = 'failed', failure_reason = 'undelivered', updated_at = $2 where id = $1`,
        [msg[0].review_request_id, at],
      );
      if (req[0]?.phone_hash) {
        await tx.query(
          `insert into suppressions (business_id, customer_id, channel, contact_hash, reason)
           values ($1, $2, 'sms', $3, 'bounce')`,
          [businessId, req[0].customer_id, req[0].phone_hash],
        );
      }
    }
    return 'processed' as const;
  });
}

/** Email bounces, complaints, and deliveries from the email provider. */
export async function handleEmailEvent(
  input: { providerMessageId: string; type: 'delivered' | 'bounced' | 'complained' },
  at: Date = clockNow(),
): Promise<'processed' | 'duplicate' | 'unknown'> {
  const found = await q<{ business_id: string | null }>(pool(), 'select find_business_by_message($1) as business_id', [input.providerMessageId]);
  const businessId = found[0]?.business_id;
  if (!businessId) return 'unknown';
  return withTenant(businessId, async (tx) => {
    const fresh = await tx.query(
      `insert into webhook_events (provider, event_id) values ('email-event', $1) on conflict do nothing returning 1`,
      [`${input.providerMessageId}:${input.type}`],
    );
    if (fresh.rowCount === 0) return 'duplicate' as const;
    const msg = await q<{ id: string; review_request_id: string | null }>(
      tx,
      'select id, review_request_id from messages where provider_message_id = $1',
      [input.providerMessageId],
    );
    if (!msg[0]) return 'unknown' as const;
    if (input.type === 'delivered') {
      await tx.query(`update messages set status = 'delivered', updated_at = $2 where id = $1`, [msg[0].id, at]);
      if (msg[0].review_request_id) {
        await tx.query(
          `update review_requests set status = 'delivered', delivered_at = $2, updated_at = $2 where id = $1 and status = 'sent'`,
          [msg[0].review_request_id, at],
        );
      }
      return 'processed' as const;
    }
    const reason = input.type === 'bounced' ? 'bounce' : 'complaint';
    await tx.query(`update messages set status = 'undelivered', error_code = $2, updated_at = $3 where id = $1`, [
      msg[0].id,
      reason,
      at,
    ]);
    if (msg[0].review_request_id) {
      const req = await q<{ customer_id: string; email_hash: string | null }>(
        tx,
        `select r.customer_id, c.email_hash from review_requests r join customers c on c.id = r.customer_id where r.id = $1`,
        [msg[0].review_request_id],
      );
      await tx.query(
        `update review_requests set status = 'failed', failure_reason = $2, updated_at = $3 where id = $1`,
        [msg[0].review_request_id, reason === 'bounce' ? 'bounced' : 'complained', at],
      );
      if (req[0]?.email_hash) {
        await tx.query(
          `insert into suppressions (business_id, customer_id, channel, contact_hash, reason)
           values ($1, $2, 'email', $3, $4)`,
          [businessId, req[0].customer_id, req[0].email_hash, reason],
        );
      }
    }
    return 'processed' as const;
  });
}

/** Email unsubscribe (one-click or from the page). Business-wide, like an SMS STOP. */
export async function unsubscribeWithToken(token: string, at: Date = clockNow()): Promise<boolean> {
  const parsed = parseUnsubscribeToken(token);
  if (!parsed) return false;
  return withTenant(parsed.businessId, async (tx) => {
    const c = await q<{ email_hash: string | null }>(
      tx,
      'select email_hash from customers where id = $1 and deleted_at is null',
      [parsed.customerId],
    );
    if (!c[0]) return false;
    await recordOptOut(tx, parsed.businessId, parsed.customerId, 'email', 'email_unsubscribe', c[0].email_hash, at);
    return true;
  });
}

/** Support message from the public contact page (also reached from every message's footer). */
export async function submitContact(
  shortCode: string,
  message: string,
  replyTo: string,
  at: Date = clockNow(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = message.trim();
  if (text.length < 5) return { ok: false, error: 'Tell us a little more so we can help.' };
  if (text.length > 2000) return { ok: false, error: 'Please keep the message under 2,000 characters.' };
  const found = await q<{ business_id: string | null }>(pool(), 'select business_id from find_short_link($1)', [shortCode]);
  const businessId = found[0]?.business_id;
  if (!businessId) return { ok: false, error: 'This contact link is no longer valid.' };
  await withTenant(businessId, (tx) =>
    tx.query(
      `insert into support_threads (business_id, source, body_enc, reply_to_enc) values ($1, 'web', $2, $3)`,
      [businessId, encryptField(text), encryptField(replyTo.trim() || null)],
    ),
  );
  await notifyOwner(businessId, 'New message through your contact page', 'A customer sent a message. Open the inbox to read and reply.');
  void at;
  return { ok: true };
}
