import { randomUUID } from 'node:crypto';
import { encryptField, hashContact } from '../crypto';
import { q, withTenant } from '../db';
import { validateImport, type ImportRowError } from '../import-rules';
import { now as clockNow } from '../clock';
import { audit } from './audit';
import { enqueueAutomation } from './pipeline';

export type ImportSummary =
  | { ok: false; error: string }
  | { ok: true; batchId: string; created: number; merged: number; skipped: number; errors: ImportRowError[] };

/**
 * Imports customers and visits from a CSV file. Each row is handled on its own.
 * Dedupe merges only on an exact phone match. An email-only match is flagged for the owner.
 * A merge never upgrades consent and never clears an opt-out (rule R5).
 */
export async function importCustomers(
  businessId: string,
  userId: string,
  filename: string,
  text: string,
  at: Date = clockNow(),
): Promise<ImportSummary> {
  const tz = await withTenant(businessId, async (tx) => {
    const rows = await q<{ time_zone: string }>(tx, 'select time_zone from businesses where id = $1', [businessId]);
    return rows[0]?.time_zone ?? 'UTC';
  });
  const validation = validateImport(text, { timeZone: tz, now: at });
  if (validation.fatal) return { ok: false, error: validation.fatal };

  return withTenant(businessId, async (tx) => {
    const batch = await q<{ id: string }>(
      tx,
      'insert into import_batches (business_id, filename, total_rows) values ($1, $2, $3) returning id',
      [businessId, filename.slice(0, 200), validation.totalRows],
    );
    const batchId = batch[0].id;
    const errors: ImportRowError[] = [...validation.errors];
    let created = 0;
    let merged = 0;

    for (const row of validation.rows) {
      const phoneHash = row.phone ? hashContact('phone', row.phone.e164) : null;
      const emailHash = row.email ? hashContact('email', row.email) : null;
      const hashes = [phoneHash, emailHash].filter((h): h is string => h !== null);

      const blocked = await q(tx, 'select 1 from suppressions where contact_hash = any($1::text[]) limit 1', [hashes]);
      if (blocked.length > 0) {
        errors.push({ line: row.line, message: 'Skipped: this contact opted out or asked to be deleted earlier.' });
        continue;
      }

      let customerId: string | null = null;
      if (phoneHash) {
        const match = await q<{ id: string }>(
          tx,
          'select id from customers where phone_hash = $1 and deleted_at is null',
          [phoneHash],
        );
        customerId = match[0]?.id ?? null;
      }
      if (!customerId && emailHash) {
        const emailMatch = await q(
          tx,
          'select 1 from customers where email_hash = $1 and deleted_at is null',
          [emailHash],
        );
        if (emailMatch.length > 0) {
          errors.push({ line: row.line, message: 'Skipped: this email belongs to another customer. Review it by hand.' });
          continue;
        }
      }

      let optedOut = false;
      if (customerId) {
        merged++;
        const oo = await q(tx, 'select 1 from opt_outs where customer_id = $1 limit 1', [customerId]);
        optedOut = oo.length > 0;
      } else {
        customerId = randomUUID();
        await tx.query(
          `insert into customers (id, business_id, first_name_enc, last_name_enc, phone_enc, phone_hash, email_enc, email_hash, language)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            customerId,
            businessId,
            encryptField(row.firstName || null),
            encryptField(row.lastName || null),
            encryptField(row.phone?.e164 ?? null),
            phoneHash,
            encryptField(row.email),
            emailHash,
            row.language,
          ],
        );
        created++;
      }

      const duplicateVisit = await q(
        tx,
        'select 1 from visits where customer_id = $1 and service_name = $2 and completed_at = $3',
        [customerId, row.serviceName, row.visitAt],
      );
      if (duplicateVisit.length > 0) {
        errors.push({ line: row.line, message: 'Skipped: this visit is already recorded.' });
        continue;
      }

      if (row.consent && !optedOut) {
        const channel = row.consent.type === 'sms_pew' ? 'sms' : 'email';
        const existing = await q(
          tx,
          `select 1 from consents where customer_id = $1 and type = $2 and source = $3 and revoked_at is null`,
          [customerId, row.consent.type, row.consent.source],
        );
        if (existing.length === 0) {
          await tx.query(
            `insert into consents (business_id, customer_id, channel, type, source, recorded_at, recorded_by)
             values ($1, $2, $3, $4, $5, $6, $7)`,
            [businessId, customerId, channel, row.consent.type, row.consent.source, row.consent.recordedAt, userId],
          );
        }
      }

      const visit = await q<{ id: string }>(
        tx,
        `insert into visits (business_id, customer_id, service_name, visit_type, completed_at, source, import_batch_id)
         values ($1, $2, $3, $4, $5, 'import', $6) returning id`,
        [businessId, customerId, row.serviceName, row.visitType, row.visitAt, batchId],
      );
      if (!optedOut) {
        await enqueueAutomation(tx, {
          businessId,
          customerId,
          visitId: visit[0].id,
          visitKind: row.visitType === 'sale' ? 'retail' : 'service',
          completedAt: row.visitAt,
          at,
        });
      }
    }

    const skipped = errors.length;
    errors.sort((a, b) => a.line - b.line);
    await tx.query(
      `update import_batches set created_rows = $2, merged_rows = $3, skipped_rows = $4, errors = $5::jsonb where id = $1`,
      [batchId, created, merged, skipped, JSON.stringify(errors.slice(0, 500))],
    );
    await audit(tx, businessId, `owner:${userId}`, 'import.completed', 'import_batch', batchId);
    return { ok: true as const, batchId, created, merged, skipped, errors };
  });
}
