/*
 * SMS encoding and segment counting, following the GSM 03.38 basic and extension
 * character sets. Extension characters take two septets. Verify against the
 * provider's documented rules before relying on exact counts (see docs/decisions.md).
 */
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENSION = '^{}\\[~]|€';

export type SmsEncoding = 'GSM-7' | 'UCS-2';

export function encodingOf(text: string): SmsEncoding {
  for (const ch of text) {
    if (!GSM_BASIC.includes(ch) && !GSM_EXTENSION.includes(ch)) return 'UCS-2';
  }
  return 'GSM-7';
}

export function countSegments(text: string): { encoding: SmsEncoding; units: number; segments: number } {
  const encoding = encodingOf(text);
  if (encoding === 'UCS-2') {
    const units = text.length;
    return { encoding, units, segments: units <= 70 ? 1 : Math.ceil(units / 67) };
  }
  let units = 0;
  for (const ch of text) units += GSM_EXTENSION.includes(ch) ? 2 : 1;
  return { encoding, units, segments: units <= 160 ? 1 : Math.ceil(units / 153) };
}
