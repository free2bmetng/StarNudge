import { cfg } from '../config';
import { sandboxBilling, sandboxEmail, sandboxSms } from './sandbox';
import { twilioSms } from './twilio';
import { resendEmail } from './resend';
import { stripeBilling } from './stripe';
import type { BillingAdapter, EmailAdapter, SmsAdapter } from './types';

/** Picks the sandbox or live adapter. Live adapters fail fast when their credentials are missing. */
export function getSmsAdapter(): SmsAdapter {
  const c = cfg();
  if (c.sandboxMode) return sandboxSms;
  if (!c.twilio.accountSid || !c.twilio.authToken) throw new Error('Twilio credentials are not configured');
  return twilioSms({
    accountSid: c.twilio.accountSid,
    authToken: c.twilio.authToken,
    statusCallbackUrl: `${c.appBaseUrl}/api/webhooks/sms`,
  });
}

export function getEmailAdapter(): EmailAdapter {
  const c = cfg();
  if (c.sandboxMode) return sandboxEmail;
  if (!c.resend.apiKey) throw new Error('Resend API key is not configured');
  return resendEmail({ apiKey: c.resend.apiKey });
}

export function getBillingAdapter(): BillingAdapter {
  const c = cfg();
  if (c.sandboxMode) return sandboxBilling;
  if (!c.stripe.secretKey || !c.stripe.priceId) throw new Error('Stripe credentials are not configured');
  return stripeBilling({ secretKey: c.stripe.secretKey, priceId: c.stripe.priceId, appBaseUrl: c.appBaseUrl });
}
