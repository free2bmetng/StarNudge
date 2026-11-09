import { addMinutes, isInSendWindow, nextLocalHour } from './time';
import { LIMITS } from './config';

export type SuppressReason =
  | 'contact_deleted'
  | 'opted_out'
  | 'contact_suppressed'
  | 'no_basis'
  | 'frequency_cap'
  | 'template_invalid';

export type DispatchDecision =
  | { action: 'send'; channel: 'sms' | 'email' }
  | { action: 'suppress'; reason: SuppressReason }
  | { action: 'defer'; reason: 'sender_pending' | 'quiet_hours'; until: Date };

/**
 * Everything the dispatch decision may look at. Deliberately has no review, rating,
 * feedback, or sentiment field: eligibility can never depend on them (rule R2).
 */
export interface DispatchInput {
  now: Date;
  businessTimeZone: string;
  customerTimeZone: string | null;
  quietStartHour: number;
  quietEndHour: number;
  customerDeleted: boolean;
  optedOut: boolean;
  allContactSuppressed: boolean;
  smsSuppressed: boolean;
  emailSuppressed: boolean;
  hasSmsConsent: boolean;
  hasEmailConsent: boolean;
  hasPhone: boolean;
  phoneIsUS: boolean;
  hasEmail: boolean;
  senderApproved: boolean;
  recentSentCount: number;
  templateLintPassed: boolean;
}

/**
 * Checks 1 to 7 from the brief, in order. The first failure decides.
 * Check 8 (idempotency) is enforced by the database: one message per request attempt.
 */
export function evaluateDispatch(i: DispatchInput): DispatchDecision {
  // 1. Opt-out. Business-wide and immediate (rule R5).
  if (i.optedOut) return { action: 'suppress', reason: 'opted_out' };
  // 2. Contact status. Deleted customers, and suppressions that apply to every channel.
  if (i.customerDeleted) return { action: 'suppress', reason: 'contact_deleted' };
  if (i.allContactSuppressed) return { action: 'suppress', reason: 'contact_suppressed' };
  // 3. Channel. SMS needs written consent and a US number. Email needs an opt-in.
  const smsOk = i.hasSmsConsent && i.hasPhone && i.phoneIsUS && !i.smsSuppressed;
  const emailOk = i.hasEmailConsent && i.hasEmail && !i.emailSuppressed;
  if (!smsOk && !emailOk) return { action: 'suppress', reason: 'no_basis' };
  const channel: 'sms' | 'email' = smsOk ? 'sms' : 'email';
  // 4. Sender. An unapproved SMS sender holds the request. It never switches channel.
  if (channel === 'sms' && !i.senderApproved) {
    return { action: 'defer', reason: 'sender_pending', until: addMinutes(i.now, LIMITS.senderHoldMinutes) };
  }
  // 5. Frequency cap. Manual and automated requests both count.
  if (i.recentSentCount > 0) return { action: 'suppress', reason: 'frequency_cap' };
  // 6. Quiet hours, in the customer's time zone when known.
  const tz = i.customerTimeZone ?? i.businessTimeZone;
  if (!isInSendWindow(i.now, tz, i.quietStartHour, i.quietEndHour)) {
    return { action: 'defer', reason: 'quiet_hours', until: nextLocalHour(i.now, tz, i.quietStartHour) };
  }
  // 7. Template must pass lint.
  if (!i.templateLintPassed) return { action: 'suppress', reason: 'template_invalid' };
  return { action: 'send', channel };
}

/** Field names of DispatchInput, kept in one list so a test can check the rule R2 boundary. */
export const DISPATCH_INPUT_KEYS = [
  'now',
  'businessTimeZone',
  'customerTimeZone',
  'quietStartHour',
  'quietEndHour',
  'customerDeleted',
  'optedOut',
  'allContactSuppressed',
  'smsSuppressed',
  'emailSuppressed',
  'hasSmsConsent',
  'hasEmailConsent',
  'hasPhone',
  'phoneIsUS',
  'hasEmail',
  'senderApproved',
  'recentSentCount',
  'templateLintPassed',
] as const satisfies readonly (keyof DispatchInput)[];
