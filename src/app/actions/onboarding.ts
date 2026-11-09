'use server';

import { requireSession } from '@/lib/auth';
import { confirmReviewLink, saveReviewLink, submitSenderRegistration } from '@/lib/services/accounts';
import { back, flag, text } from './_form';

export async function saveReviewLinkAction(form: FormData): Promise<void> {
  const s = await requireSession();
  const result = await saveReviewLink(s.businessId, s.userId, {
    url: text(form, 'url'),
    placeId: text(form, 'placeId'),
  });
  if (!result.ok) back('/onboarding', result.error);
  back('/onboarding', 'Review link saved. Open it and confirm the review box appears.', 'notice');
}

export async function confirmReviewLinkAction(form: FormData): Promise<void> {
  const s = await requireSession();
  if (!flag(form, 'confirmed')) back('/onboarding', 'Tick the box to confirm you opened the link.');
  const result = await confirmReviewLink(s.businessId, s.userId);
  if (!result.ok) back('/onboarding', result.error);
  back('/onboarding', 'Review link confirmed. Requests can now be sent.', 'notice');
}

export async function submitSenderAction(form: FormData): Promise<void> {
  const s = await requireSession();
  const result = await submitSenderRegistration(s.businessId, s.userId, {
    legalName: text(form, 'legalName'),
    website: text(form, 'website'),
    useCase: text(form, 'useCase'),
    sampleMessage: text(form, 'sampleMessage'),
    consentDescription: text(form, 'consentDescription'),
  });
  if (!result.ok) back('/onboarding', result.error);
  back('/onboarding', 'Sender registration submitted. It can take time to approve.', 'notice');
}
