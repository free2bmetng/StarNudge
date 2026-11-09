'use server';

import { requireSession } from '@/lib/auth';
import { cancelSubscription, startSubscription } from '@/lib/services/billing';
import { updateSettings } from '@/lib/services/accounts';
import { updateTemplate } from '@/lib/services/templates-admin';
import { back, flag, int, text } from './_form';

export async function updateSettingsAction(form: FormData): Promise<void> {
  const s = await requireSession();
  const result = await updateSettings(s.businessId, s.userId, {
    name: text(form, 'name'),
    postalAddress: text(form, 'postalAddress'),
    timeZone: text(form, 'timeZone'),
    quietStartHour: int(form, 'quietStartHour'),
    quietEndHour: int(form, 'quietEndHour'),
    frequencyWindowDays: int(form, 'frequencyWindowDays'),
    serviceDelayMinutes: int(form, 'serviceDelayMinutes'),
    retailDelayMinutes: int(form, 'retailDelayMinutes'),
    serviceEnabled: flag(form, 'serviceEnabled'),
    retailEnabled: flag(form, 'retailEnabled'),
  });
  if (!result.ok) back('/settings', result.error);
  back('/settings', 'Settings saved.', 'notice');
}

export async function startSubscriptionAction(): Promise<void> {
  const s = await requireSession();
  const result = await startSubscription(s.businessId, s.userId);
  if (!result.ok) back('/settings', result.error);
  if (result.kind === 'redirect') {
    const { redirect } = await import('next/navigation');
    redirect(result.url);
  }
  back('/settings', 'Subscription started.', 'notice');
}

export async function cancelSubscriptionAction(): Promise<void> {
  const s = await requireSession();
  const result = await cancelSubscription(s.businessId, s.userId);
  if (!result.ok) back('/settings', result.error);
  back('/settings', 'Your subscription will end at the close of the current paid period.', 'notice');
}

export async function updateTemplateAction(form: FormData): Promise<void> {
  const s = await requireSession();
  const id = text(form, 'id');
  const result = await updateTemplate(s.businessId, s.userId, id, {
    subject: text(form, 'subject'),
    body: text(form, 'body'),
  });
  if (!result.ok) back(`/templates/${id}`, result.error);
  back(`/templates/${id}`, 'Template saved and passed the wording check.', 'notice');
}
