import { randomUUID } from 'node:crypto';
import { decryptField } from '../crypto';
import { q, withTenant } from '../db';
import { normalizePhone } from '../phone';
import { now as clockNow } from '../clock';
import { audit } from './audit';
import { handleEmailEvent, handleInboundSms, handleSmsStatus, unsubscribeWithToken } from './inbound';
import { makeUnsubscribeToken } from '../unsubscribe';
import { tick } from './pipeline';
import type { Outcome } from './accounts';

/*
 * Sandbox-only simulations. Each one drives the same code path a real provider webhook would,
 * minus the signature check. Callers must check cfg().sandboxMode first.
 */

export async function approveSender(businessId: string, userId: string): Promise<Outcome> {
  return withTenant(businessId, async (tx) => {
    const rows = await q<{ status: string; sender_number: string | null }>(
      tx,
      'select status, sender_number from sender_registrations where business_id = $1',
      [businessId],
    );
    const row = rows[0];
    if (!row) return { ok: false as const, error: 'No sender registration found.' };
    if (row.status === 'approved') return { ok: true as const };
    if (row.status !== 'submitted' && row.status !== 'pending') {
      return { ok: false as const, error: 'Submit the sender registration first.' };
    }
    let number = row.sender_number;
    if (!number) {
      const seq = await q<{ n: string }>(tx, `select nextval('sandbox_sender_seq')::text as n`);
      number = `+1212555${seq[0].n.padStart(4, '0')}`;
    }
    await tx.query(
      `update sender_registrations set status = 'approved', sender_number = $2, updated_at = now() where business_id = $1`,
      [businessId, number],
    );
    await audit(tx, businessId, `owner:${userId}`, 'sandbox.sender_approved', 'sender_registration', businessId);
    return { ok: true as const };
  });
}

export async function simulateReply(
  businessId: string,
  customerId: string,
  body: string,
  at: Date = clockNow(),
): Promise<Outcome> {
  const rows = await withTenant(businessId, async (tx) => {
    const c = await q<{ phone_enc: string | null }>(tx, 'select phone_enc from customers where id = $1', [customerId]);
    const sender = await q<{ sender_number: string | null }>(tx, 'select sender_number from sender_registrations where business_id = $1', [businessId]);
    return { phone: decryptField(c[0]?.phone_enc ?? null), to: sender[0]?.sender_number ?? null };
  });
  const from = rows.phone ? normalizePhone(rows.phone)?.e164 : null;
  if (!from || !rows.to) return { ok: false, error: 'This customer has no phone number, or the sender is not set up.' };
  const result = await handleInboundSms({ providerMessageId: `SBXIN${randomUUID().replace(/-/g, '')}`, from, to: rows.to, body }, at);
  if (result.status === 'unknown_sender') return { ok: false, error: 'Unknown sender number.' };
  return { ok: true };
}

export async function simulateReceipt(
  businessId: string,
  providerMessageId: string,
  status: 'delivered' | 'undelivered',
  at: Date = clockNow(),
): Promise<Outcome> {
  void businessId;
  const result = await handleSmsStatus({ providerMessageId, status, errorCode: status === 'undelivered' ? 'sandbox_undelivered' : undefined }, at);
  if (result === 'unknown') return { ok: false, error: 'Message not found.' };
  return { ok: true };
}

export async function simulateEmailEvent(
  providerMessageId: string,
  type: 'delivered' | 'bounced' | 'complained',
  at: Date = clockNow(),
): Promise<Outcome> {
  const result = await handleEmailEvent({ providerMessageId, type }, at);
  if (result === 'unknown') return { ok: false, error: 'Message not found.' };
  return { ok: true };
}

export async function simulateEmailUnsubscribe(businessId: string, customerId: string, at: Date = clockNow()): Promise<Outcome> {
  const ok = await unsubscribeWithToken(makeUnsubscribeToken(businessId, customerId), at);
  return ok ? { ok: true } : { ok: false, error: 'Customer not found.' };
}

export async function runDispatchNow(at: Date = clockNow()): Promise<{ deletions: number; processed: number }> {
  return tick(at, 100);
}

export interface SandboxMessageRow {
  id: string;
  kind: string;
  channel: string;
  status: string;
  to: string;
  body: string;
  subject: string | null;
  providerMessageId: string | null;
  createdAt: Date;
  errorCode: string | null;
}

export async function listSandboxMessages(businessId: string): Promise<SandboxMessageRow[]> {
  const rows = await withTenant(businessId, (tx) =>
    q<{
      id: string;
      kind: string;
      channel: string;
      status: string;
      to_enc: string | null;
      body_enc: string | null;
      subject: string | null;
      provider_message_id: string | null;
      created_at: Date;
      error_code: string | null;
    }>(
      tx,
      `select id, kind, channel, status, to_enc, body_enc, subject, provider_message_id, created_at, error_code
       from messages order by created_at desc limit 100`,
    ),
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    channel: r.channel,
    status: r.status,
    to: decryptField(r.to_enc) ?? '',
    body: decryptField(r.body_enc) ?? '',
    subject: r.subject,
    providerMessageId: r.provider_message_id,
    createdAt: r.created_at,
    errorCode: r.error_code,
  }));
}

export async function customerPhoneLabel(businessId: string, customerId: string): Promise<string | null> {
  const rows = await withTenant(businessId, (tx) =>
    q<{ phone_enc: string | null }>(tx, 'select phone_enc from customers where id = $1', [customerId]),
  );
  return decryptField(rows[0]?.phone_enc ?? null);
}

