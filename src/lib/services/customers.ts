import { randomUUID } from 'node:crypto';
import { decryptField, encryptField, hashContact } from '../crypto';
import { q, withTenant, type Queryable } from '../db';
import { normalizeEmail } from '../email';
import { normalizePhone, maskPhone } from '../phone';
import { maskEmail } from '../email';
import { addMinutes } from '../time';
import { now as clockNow } from '../clock';
import type { Kind, Language } from '../templates';
import { audit } from './audit';
import { enqueueAutomation, enqueueManual, processRequest, type ProcessOutcome } from './pipeline';

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface CustomerInput {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  language: Language;
  smsConsentSource: string;
  emailConsentSource: string;
}

/** Adds one customer by hand. Blocks duplicates and anyone who opted out or asked to be deleted. */
export async function createCustomer(
  businessId: string,
  userId: string,
  input: CustomerInput,
  at: Date = clockNow(),
): Promise<Result<{ id: string }>> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName) return { ok: false, error: 'Enter the customer’s first name.' };

  const phoneInput = input.phone.trim();
  const emailInput = input.email.trim();
  const phone = phoneInput ? normalizePhone(phoneInput) : null;
  if (phoneInput && !phone) return { ok: false, error: 'That phone number does not look right.' };
  const email = emailInput ? normalizeEmail(emailInput) : null;
  if (emailInput && !email) return { ok: false, error: 'That email address does not look right.' };
  if (!phone && !email) return { ok: false, error: 'Enter a phone number, an email address, or both.' };
  if (input.smsConsentSource.trim() && !(phone && phone.isUS)) {
    return { ok: false, error: 'Text consent needs a US phone number.' };
  }
  if (input.emailConsentSource.trim() && !email) {
    return { ok: false, error: 'Email consent needs an email address.' };
  }

  const phoneHash = phone ? hashContact('phone', phone.e164) : null;
  const emailHash = email ? hashContact('email', email) : null;

  return withTenant(businessId, async (tx) => {
    const hashes = [phoneHash, emailHash].filter((h): h is string => h !== null);
    const blocked = await q(tx, 'select 1 from suppressions where contact_hash = any($1::text[]) limit 1', [hashes]);
    if (blocked.length > 0) {
      return { ok: false as const, error: 'This contact opted out or asked to be deleted, so it cannot be added again.' };
    }
    if (phoneHash) {
      const dup = await q(tx, 'select 1 from customers where phone_hash = $1 and deleted_at is null', [phoneHash]);
      if (dup.length > 0) return { ok: false as const, error: 'A customer with this phone number already exists.' };
    }
    if (emailHash) {
      const dup = await q(tx, 'select 1 from customers where email_hash = $1 and deleted_at is null', [emailHash]);
      if (dup.length > 0) return { ok: false as const, error: 'A customer with this email address already exists.' };
    }

    const id = randomUUID();
    await tx.query(
      `insert into customers (id, business_id, first_name_enc, last_name_enc, phone_enc, phone_hash, email_enc, email_hash, language)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        businessId,
        encryptField(firstName),
        encryptField(lastName || null),
        encryptField(phone?.e164 ?? null),
        phoneHash,
        encryptField(email),
        emailHash,
        input.language,
      ],
    );
    if (input.smsConsentSource.trim()) {
      await addConsentRow(tx, businessId, userId, id, 'sms', 'sms_pew', input.smsConsentSource.trim(), at);
    }
    if (input.emailConsentSource.trim()) {
      await addConsentRow(tx, businessId, userId, id, 'email', 'email_opt_in', input.emailConsentSource.trim(), at);
    }
    await audit(tx, businessId, `owner:${userId}`, 'customer.created', 'customer', id);
    return { ok: true as const, id };
  });
}

async function addConsentRow(
  tx: Queryable,
  businessId: string,
  userId: string | null,
  customerId: string,
  channel: 'sms' | 'email',
  type: 'sms_pew' | 'email_opt_in',
  source: string,
  recordedAt: Date,
): Promise<void> {
  await tx.query(
    `insert into consents (business_id, customer_id, channel, type, source, recorded_at, recorded_by)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [businessId, customerId, channel, type, source, recordedAt, userId],
  );
}

export async function addConsent(
  businessId: string,
  userId: string,
  customerId: string,
  channel: 'sms' | 'email',
  source: string,
  at: Date = clockNow(),
): Promise<Result> {
  const type = channel === 'sms' ? 'sms_pew' : 'email_opt_in';
  if (!source.trim()) return { ok: false, error: 'Write down where the customer gave permission.' };
  return withTenant(businessId, async (tx) => {
    const c = await q<{ phone_enc: string | null; email_enc: string | null; deleted_at: Date | null }>(
      tx,
      'select phone_enc, email_enc, deleted_at from customers where id = $1',
      [customerId],
    );
    if (!c[0] || c[0].deleted_at) return { ok: false as const, error: 'Customer not found.' };
    const phone = normalizePhone(decryptField(c[0].phone_enc) ?? '');
    if (channel === 'sms' && !(phone && phone.isUS)) return { ok: false as const, error: 'Text consent needs a US phone number.' };
    if (channel === 'email' && !c[0].email_enc) return { ok: false as const, error: 'Email consent needs an email address.' };
    await addConsentRow(tx, businessId, userId, customerId, channel, type, source.trim(), at);
    await audit(tx, businessId, `owner:${userId}`, 'consent.recorded', 'customer', customerId);
    return { ok: true as const };
  });
}

export async function recordVisit(
  businessId: string,
  userId: string,
  customerId: string,
  input: { serviceName: string; visitType: 'service' | 'sale'; completedAt: Date },
  at: Date = clockNow(),
): Promise<Result<{ requestId: string | null }>> {
  const serviceName = input.serviceName.trim();
  if (!serviceName) return { ok: false, error: 'Enter what the customer bought or booked.' };
  if (input.completedAt.getTime() > addMinutes(at, 5).getTime()) {
    return { ok: false, error: 'The visit time is in the future.' };
  }
  return withTenant(businessId, async (tx) => {
    const c = await q(tx, 'select 1 from customers where id = $1 and deleted_at is null', [customerId]);
    if (c.length === 0) return { ok: false as const, error: 'Customer not found.' };
    const visit = await q<{ id: string }>(
      tx,
      `insert into visits (business_id, customer_id, service_name, visit_type, completed_at, source)
       values ($1, $2, $3, $4, $5, 'manual') returning id`,
      [businessId, customerId, serviceName, input.visitType, input.completedAt],
    );
    const visitKind: Kind = input.visitType === 'sale' ? 'retail' : 'service';
    const requestId = await enqueueAutomation(tx, {
      businessId,
      customerId,
      visitId: visit[0].id,
      visitKind,
      completedAt: input.completedAt,
      at,
    });
    await audit(tx, businessId, `owner:${userId}`, 'visit.recorded', 'visit', visit[0].id);
    return { ok: true as const, requestId };
  });
}

/** Owner-triggered send. Runs the same checks as an automated send, right away. */
export async function sendNow(
  businessId: string,
  userId: string,
  customerId: string,
  nonce: string,
  at: Date = clockNow(),
): Promise<Result<{ outcome: ProcessOutcome }>> {
  if (!nonce.trim()) return { ok: false, error: 'Reload the page and try again.' };
  const requestId = await withTenant(businessId, async (tx) => {
    const c = await q(tx, 'select 1 from customers where id = $1 and deleted_at is null', [customerId]);
    if (c.length === 0) return null;
    const id = await enqueueManual(tx, { businessId, customerId, nonce, at });
    await audit(tx, businessId, `owner:${userId}`, 'request.manual', 'review_request', id);
    return id;
  });
  if (!requestId) return { ok: false, error: 'Customer not found.' };
  const outcome = await processRequest(businessId, requestId, at);
  return { ok: true, outcome };
}

export async function logOwnerReview(
  businessId: string,
  userId: string,
  customerId: string | null,
  note: string,
): Promise<Result> {
  return withTenant(businessId, async (tx) => {
    await tx.query(
      'insert into owner_logged_reviews (business_id, customer_id, note) values ($1, $2, $3)',
      [businessId, customerId, note.trim() || null],
    );
    await audit(tx, businessId, `owner:${userId}`, 'review.owner_logged', 'customer', customerId);
    return { ok: true as const };
  });
}

/** Stops every pending request right away, then queues the deletion for the worker. */
export async function requestDeletion(
  businessId: string,
  userId: string,
  customerId: string,
  at: Date = clockNow(),
): Promise<Result<{ deletionId: string }>> {
  return withTenant(businessId, async (tx) => {
    const rows = await q<{ phone_hash: string | null; email_hash: string | null; deleted_at: Date | null }>(
      tx,
      'select phone_hash, email_hash, deleted_at from customers where id = $1',
      [customerId],
    );
    const c = rows[0];
    if (!c || c.deleted_at) return { ok: false as const, error: 'Customer not found.' };
    const deletion = await q<{ id: string }>(
      tx,
      `insert into deletion_requests (business_id, customer_id) values ($1, $2) returning id`,
      [businessId, customerId],
    );
    await tx.query(
      `update review_requests set status = 'cancelled', status_reason = 'customer_deleted', updated_at = $2
       where customer_id = $1 and status in ('queued', 'deferred')`,
      [customerId, at],
    );
    for (const hash of [c.phone_hash, c.email_hash]) {
      if (hash) {
        await tx.query(
          `insert into suppressions (business_id, customer_id, channel, contact_hash, reason)
           values ($1, $2, 'all', $3, 'deleted')`,
          [businessId, customerId, hash],
        );
      }
    }
    await audit(tx, businessId, `owner:${userId}`, 'customer.deletion_requested', 'customer', customerId);
    return { ok: true as const, deletionId: deletion[0].id };
  });
}

export interface CustomerListRow {
  id: string;
  firstName: string;
  lastName: string;
  phoneMasked: string;
  emailMasked: string;
  smsConsent: boolean;
  optedOut: boolean;
  lastVisit: Date | null;
}

export async function listCustomers(businessId: string): Promise<CustomerListRow[]> {
  const rows = await withTenant(businessId, (tx) =>
    q<{
      id: string;
      first_name_enc: string | null;
      last_name_enc: string | null;
      phone_enc: string | null;
      email_enc: string | null;
      sms_consent: boolean;
      opted_out: boolean;
      last_visit: Date | null;
    }>(
      tx,
      `select c.id, c.first_name_enc, c.last_name_enc, c.phone_enc, c.email_enc,
              exists(select 1 from consents k where k.customer_id = c.id and k.type = 'sms_pew' and k.revoked_at is null) as sms_consent,
              exists(select 1 from opt_outs o where o.customer_id = c.id) as opted_out,
              (select max(v.completed_at) from visits v where v.customer_id = c.id) as last_visit
       from customers c
       where c.deleted_at is null
       order by c.created_at desc
       limit 500`,
    ),
  );
  return rows.map((r) => ({
    id: r.id,
    firstName: decryptField(r.first_name_enc) ?? '',
    lastName: decryptField(r.last_name_enc) ?? '',
    phoneMasked: maskPhone(decryptField(r.phone_enc)),
    emailMasked: maskEmail(decryptField(r.email_enc)),
    smsConsent: r.sms_consent,
    optedOut: r.opted_out,
    lastVisit: r.last_visit,
  }));
}

export async function getCustomerDetail(businessId: string, customerId: string) {
  return withTenant(businessId, async (tx) => {
    const rows = await q<{
      id: string;
      first_name_enc: string | null;
      last_name_enc: string | null;
      phone_enc: string | null;
      email_enc: string | null;
      language: Language;
      deleted_at: Date | null;
    }>(
      tx,
      'select id, first_name_enc, last_name_enc, phone_enc, email_enc, language, deleted_at from customers where id = $1',
      [customerId],
    );
    const c = rows[0];
    if (!c || c.deleted_at) return null;
    const consents = await q<{ id: string; channel: string; type: string; source: string; recorded_at: Date; revoked_at: Date | null }>(
      tx,
      'select id, channel, type, source, recorded_at, revoked_at from consents where customer_id = $1 order by recorded_at desc',
      [customerId],
    );
    const visits = await q<{ id: string; service_name: string; visit_type: string; completed_at: Date; source: string }>(
      tx,
      'select id, service_name, visit_type, completed_at, source from visits where customer_id = $1 order by completed_at desc limit 50',
      [customerId],
    );
    const requests = await q<{ id: string; status: string; status_reason: string | null; source: string; channel: string | null; sent_at: Date | null; created_at: Date; failure_reason: string | null }>(
      tx,
      `select id, status, status_reason, source, channel, sent_at, created_at, failure_reason
       from review_requests where customer_id = $1 order by created_at desc limit 50`,
      [customerId],
    );
    const optOut = await q<{ channel: string; created_at: Date }>(
      tx,
      'select channel, created_at from opt_outs where customer_id = $1 order by created_at limit 1',
      [customerId],
    );
    const pendingDeletion = await q(
      tx,
      `select 1 from deletion_requests where customer_id = $1 and status = 'pending'`,
      [customerId],
    );
    return {
      id: c.id,
      firstName: decryptField(c.first_name_enc) ?? '',
      lastName: decryptField(c.last_name_enc) ?? '',
      phone: decryptField(c.phone_enc) ?? '',
      email: decryptField(c.email_enc) ?? '',
      language: c.language,
      consents,
      visits,
      requests,
      optOut: optOut[0] ?? null,
      deletionPending: pendingDeletion.length > 0,
    };
  });
}

/** Everything the business holds about one customer, decrypted, for the export download. */
export async function exportCustomer(businessId: string, customerId: string) {
  const detail = await getCustomerDetail(businessId, customerId);
  if (!detail) return null;
  return {
    exportedAt: new Date().toISOString(),
    customer: {
      firstName: detail.firstName,
      lastName: detail.lastName,
      phone: detail.phone,
      email: detail.email,
      language: detail.language,
    },
    consents: detail.consents,
    visits: detail.visits,
    reviewRequests: detail.requests,
    optOut: detail.optOut,
  };
}
