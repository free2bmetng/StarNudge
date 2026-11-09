import { randomUUID } from 'node:crypto';
import { getEmailAdapter } from '../adapters';
import { SendError } from '../adapters/types';
import { cfg } from '../config';
import { encryptField } from '../crypto';
import { q, withTenant } from '../db';

/**
 * Emails the business owner. Never throws: a failed notice must not fail the request that
 * triggered it, and the attempt is recorded in messages either way.
 */
export async function notifyOwner(businessId: string, subject: string, text: string): Promise<void> {
  try {
    const rows = await withTenant(businessId, (tx) =>
      q<{ email: string }>(
        tx,
        `select u.email from memberships m join users u on u.id = m.user_id
         where m.business_id = $1 order by m.created_at limit 1`,
        [businessId],
      ),
    );
    const to = rows[0]?.email;
    if (!to) return;
    const adapter = getEmailAdapter();
    const clientRef = randomUUID();
    let providerMessageId: string | null = null;
    let status: 'accepted' | 'failed' = 'accepted';
    let errorCode: string | null = null;
    try {
      const sent = await adapter.send({
        to,
        from: cfg().notifyFromEmail,
        subject,
        text,
        headers: {},
        clientRef,
      });
      providerMessageId = sent.providerMessageId;
    } catch (err) {
      status = 'failed';
      errorCode = err instanceof SendError ? err.code : 'error';
    }
    await withTenant(businessId, (tx) =>
      tx.query(
        `insert into messages (business_id, kind, channel, client_ref, provider, provider_message_id, attempt, status, error_code, to_enc, body_enc, subject)
         values ($1, 'owner_notice', 'email', $2, $3, $4, 1, $5, $6, $7, $8, $9)`,
        [businessId, clientRef, adapter.name, providerMessageId, status, errorCode, encryptField(to), encryptField(text), subject],
      ),
    );
  } catch (err) {
    console.error('owner notice failed', err);
  }
}
