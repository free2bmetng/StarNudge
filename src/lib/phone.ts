export interface NormalizedPhone {
  e164: string;
  isUS: boolean;
}

/**
 * Normalizes to E.164. A bare 10-digit or 11-digit (leading 1) number is treated as US.
 * Anything with a leading + is taken as written. Returns null when the input cannot be a phone number.
 */
export function normalizePhone(input: string): NormalizedPhone | null {
  const raw = input.trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  let e164: string;
  if (raw.startsWith('+')) {
    if (digits.length < 8 || digits.length > 15) return null;
    e164 = `+${digits}`;
  } else if (digits.length === 10) {
    e164 = `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    e164 = `+${digits}`;
  } else {
    return null;
  }
  return { e164, isUS: /^\+1[2-9]\d{9}$/.test(e164) };
}

/** Shows only the last four digits, for lists. */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  return `•••${e164.slice(-4)}`;
}
