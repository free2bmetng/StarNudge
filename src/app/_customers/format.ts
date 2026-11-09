import type { IconName } from '@/app/_components/icons';

/** Badge tones from ui.tsx. Its BadgeTone type is not exported, so the same union is repeated here. */
export type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'crit';

export const CONSENT_TYPE_LABEL: Record<string, string> = {
  sms_pew: 'Text messages',
  email_opt_in: 'Email',
};

export const VISIT_TYPE_LABEL: Record<string, string> = {
  service: 'Service',
  sale: 'Retail sale',
};

export const VISIT_SOURCE_LABEL: Record<string, string> = {
  manual: 'Recorded by hand',
  import: 'Imported from a file',
};

/** Request status labels are the same words the page has always used. Tone and icon carry the state too. */
export const REQUEST_STATUS: Record<string, { label: string; tone: Tone; icon: IconName }> = {
  queued: { label: 'Queued', tone: 'neutral', icon: 'clock' },
  deferred: { label: 'Held', tone: 'warn', icon: 'clock' },
  suppressed: { label: 'Not sent', tone: 'warn', icon: 'alert' },
  sending: { label: 'Sending', tone: 'neutral', icon: 'send' },
  sent: { label: 'Sent', tone: 'good', icon: 'send' },
  delivered: { label: 'Delivered', tone: 'good', icon: 'check' },
  failed: { label: 'Failed', tone: 'crit', icon: 'xcircle' },
  expired: { label: 'Expired', tone: 'neutral', icon: 'clock' },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: 'close' },
};

export function requestStatus(status: string): { label: string; tone: Tone; icon: IconName } {
  return REQUEST_STATUS[status] ?? { label: status.replace(/_/g, ' '), tone: 'neutral', icon: 'info' };
}

/** Two letters for the avatar. Decorative, because the full name sits beside it. */
export function initialsOf(first: string, last: string): string {
  const letters = `${first.trim().charAt(0)}${last.trim().charAt(0)}`;
  return letters ? letters.toLocaleUpperCase('en-US') : '?';
}

export function formatDay(value: Date | string): string {
  return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(value: Date | string): string {
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export function isoTime(value: Date | string): string {
  return new Date(value).toISOString();
}
