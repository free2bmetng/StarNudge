import { withTenant } from '../db';
import { audit } from './audit';

/**
 * Removes a customer's personal fields and message bodies. Keeps the hashed suppression
 * record (so a re-import cannot re-message them), consent evidence, and visit history.
 */
export async function processDeletion(
  businessId: string,
  deletionId: string,
  customerId: string,
  at: Date,
): Promise<void> {
  await withTenant(businessId, async (tx) => {
    await tx.query(
      `update customers
         set first_name_enc = null, last_name_enc = null, phone_enc = null, phone_hash = null,
             email_enc = null, email_hash = null, deleted_at = $2, updated_at = $2
       where id = $1 and deleted_at is null`,
      [customerId, at],
    );
    await tx.query(
      `update messages set to_enc = null, body_enc = null
       where review_request_id in (select id from review_requests where customer_id = $1)`,
      [customerId],
    );
    await tx.query('update inbound_messages set body_enc = null, customer_id = null where customer_id = $1', [customerId]);
    await tx.query('update support_threads set body_enc = null, reply_to_enc = null where customer_id = $1', [customerId]);
    await tx.query(`update deletion_requests set status = 'completed', completed_at = $2 where id = $1`, [deletionId, at]);
    await audit(tx, businessId, 'system', 'customer.deletion_completed', 'customer', customerId);
  });
}
