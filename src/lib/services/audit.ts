import type { Queryable } from '../db';

/** Writes one audit row. Every state change in the app calls this inside its transaction. */
export async function audit(
  tx: Queryable,
  businessId: string,
  actor: string,
  action: string,
  entity: string,
  entityId: string | null = null,
): Promise<void> {
  await tx.query(
    'insert into audit_log (business_id, actor, action, entity, entity_id) values ($1, $2, $3, $4, $5)',
    [businessId, actor, action, entity, entityId],
  );
}
