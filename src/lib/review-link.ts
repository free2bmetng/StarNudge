import { randomBytes } from 'node:crypto';
import { ALLOWED_REVIEW_HOSTS } from './config';

export const PLACE_ID_RE = /^[A-Za-z0-9_-]{15,}$/;

export type ReviewLinkCheck = { ok: true; url: string } | { ok: false; error: string };

export function buildWriteReviewUrl(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

/**
 * Accepts only https links on an allowlisted host, in one of two shapes:
 * a writereview link with a Place ID, or a g.page short review link.
 * The writereview format is an unverified assumption (see docs/decisions.md).
 */
export function checkReviewUrl(raw: string): ReviewLinkCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: 'That does not look like a web address.' };
  }
  if (url.protocol !== 'https:') return { ok: false, error: 'The review link must start with https://' };
  if (!ALLOWED_REVIEW_HOSTS.includes(url.hostname)) {
    return { ok: false, error: `${url.hostname} is not a Google review host.` };
  }
  const writeReview =
    url.hostname === 'search.google.com' &&
    url.pathname === '/local/writereview' &&
    PLACE_ID_RE.test(url.searchParams.get('placeid') ?? '');
  const shortReview = url.hostname === 'g.page' && /^\/r\/[A-Za-z0-9_-]+(\/review)?\/?$/.test(url.pathname);
  if (!writeReview && !shortReview) {
    return { ok: false, error: 'Use the "Get more reviews" link from your Google Business Profile, or a Place ID.' };
  }
  return { ok: true, url: url.toString() };
}

export function resolveReviewInput(input: { url?: string; placeId?: string }): ReviewLinkCheck {
  if (input.url && input.url.trim()) return checkReviewUrl(input.url);
  if (input.placeId && input.placeId.trim()) {
    const id = input.placeId.trim();
    if (!PLACE_ID_RE.test(id)) return { ok: false, error: 'That Place ID does not look right.' };
    return { ok: true, url: buildWriteReviewUrl(id) };
  }
  return { ok: false, error: 'Paste your review link or your Place ID.' };
}

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Random short code. The alphabet has 32 symbols, so byte % 32 introduces no bias. */
export function newShortCode(length = 8): string {
  return [...randomBytes(length)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
