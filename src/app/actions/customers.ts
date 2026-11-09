'use server';

import { requireSession } from '@/lib/auth';
import { instantForLocal } from '@/lib/time';
import { addConsent, createCustomer, logOwnerReview, requestDeletion, recordVisit, sendNow } from '@/lib/services/customers';
import { getBusinessTimeZone } from '@/lib/services/views';
import { importCustomers } from '@/lib/services/imports';
import { back, flag, text } from './_form';

export async function createCustomerAction(form: FormData): Promise<void> {
  const s = await requireSession();
  const smsOn = flag(form, 'smsConsent');
  const emailOn = flag(form, 'emailConsent');
  const result = await createCustomer(s.businessId, s.userId, {
    firstName: text(form, 'firstName'),
    lastName: text(form, 'lastName'),
    phone: text(form, 'phone'),
    email: text(form, 'email'),
    language: text(form, 'language') === 'es' ? 'es' : 'en',
    smsConsentSource: smsOn ? text(form, 'smsConsentSource') : '',
    emailConsentSource: emailOn ? text(form, 'emailConsentSource') : '',
  });
  if (!result.ok) back('/customers', result.error);
  back(`/customers/${result.id}`, 'Customer added.', 'notice');
}

export async function recordVisitAction(form: FormData): Promise<void> {
  const s = await requireSession();
  const customerId = text(form, 'customerId');
  const when = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(text(form, 'completedAt'));
  if (!when) back(`/customers/${customerId}`, 'Enter the visit date and time.');
  const tz = await getBusinessTimeZone(s.businessId);
  const completedAt = instantForLocal(tz, Number(when[1]), Number(when[2]), Number(when[3]), Number(when[4]), Number(when[5]));
  if (!completedAt) back(`/customers/${customerId}`, 'That local time does not exist (daylight saving change). Pick another time.');
  const visitType = text(form, 'visitType') === 'sale' ? 'sale' : 'service';
  const result = await recordVisit(s.businessId, s.userId, customerId, {
    serviceName: text(form, 'serviceName'),
    visitType,
    completedAt,
  });
  if (!result.ok) back(`/customers/${customerId}`, result.error);
  const note = result.requestId
    ? 'Visit recorded. A review request is queued for it.'
    : 'Visit recorded. Automations are off or the visit is outside the 7-day window.';
  back(`/customers/${customerId}`, note, 'notice');
}

export async function addConsentAction(form: FormData): Promise<void> {
  const s = await requireSession();
  const customerId = text(form, 'customerId');
  if (!flag(form, 'confirmed')) back(`/customers/${customerId}`, 'Tick the box to confirm the customer gave permission.');
  const channel = text(form, 'channel') === 'email' ? 'email' : 'sms';
  const result = await addConsent(s.businessId, s.userId, customerId, channel, text(form, 'source'));
  if (!result.ok) back(`/customers/${customerId}`, result.error);
  back(`/customers/${customerId}`, 'Permission recorded.', 'notice');
}

export async function sendNowAction(form: FormData): Promise<void> {
  const s = await requireSession();
  const customerId = text(form, 'customerId');
  const result = await sendNow(s.businessId, s.userId, customerId, text(form, 'nonce'));
  if (!result.ok) back(`/customers/${customerId}`, result.error);
  const o = result.outcome;
  const message =
    o.kind === 'sent'
      ? `Sent by ${o.channel === 'sms' ? 'text' : 'email'}.`
      : o.kind === 'deferred'
        ? `Held: ${o.reason.replace(/_/g, ' ')}. It will go out when the hold clears.`
        : o.kind === 'suppressed'
          ? `Not sent: ${o.reason.replace(/_/g, ' ')}.`
          : `Not sent: ${o.kind}.`;
  back(`/customers/${customerId}`, message, o.kind === 'sent' ? 'notice' : 'error');
}

export async function logReviewAction(form: FormData): Promise<void> {
  const s = await requireSession();
  const customerId = text(form, 'customerId') || null;
  const result = await logOwnerReview(s.businessId, s.userId, customerId, text(form, 'note'));
  if (!result.ok) back(customerId ? `/customers/${customerId}` : '/dashboard', result.error);
  back(customerId ? `/customers/${customerId}` : '/dashboard', 'Logged as an owner-reported review.', 'notice');
}

export async function requestDeletionAction(form: FormData): Promise<void> {
  const s = await requireSession();
  const customerId = text(form, 'customerId');
  if (!flag(form, 'confirmed')) back(`/customers/${customerId}`, 'Tick the box to confirm deletion.');
  const result = await requestDeletion(s.businessId, s.userId, customerId);
  if (!result.ok) back(`/customers/${customerId}`, result.error);
  back('/customers', 'Deletion requested. Pending requests were cancelled and personal data will be removed shortly.', 'notice');
}

export async function importCsvAction(form: FormData): Promise<void> {
  const s = await requireSession();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) back('/customers/import', 'Choose a CSV file to upload.');
  if (file.size > 2_000_000) back('/customers/import', 'The file is larger than 2 MB. Split it into smaller files.');
  const result = await importCustomers(s.businessId, s.userId, file.name, await file.text());
  if (!result.ok) back('/customers/import', result.error);
  back(
    `/customers/import?batch=${result.batchId}`,
    `Imported: ${result.created} new, ${result.merged} matched to existing customers, ${result.skipped} skipped.`,
    'notice',
  );
}
