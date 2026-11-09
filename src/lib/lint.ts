import { INCENTIVE_WORDS, LIMITS } from './config';

/** Merge fields an owner may use in a template body. */
export const EDITABLE_TOKENS = ['first_name', 'business_name', 'service', 'review_link', 'support_link'] as const;

const RATING_PATTERNS: RegExp[] = [
  /\b\d(\.\d)?\s*-?\s*stars?\b/i,
  /\bfive[- ]star\b/i,
  /[★⭐]/u,
  /\b(rate|rating)\s+(us|your|our)\b/i,
];

const REVIEW_CHANGE_PATTERNS: RegExp[] = [
  /\b(change|remove|delete|edit|update|revise|modify|retract|withdraw|take back)\b[^.!?\n]{0,40}\breviews?\b/i,
  /\b(improve|raise|upgrade|revise)\b[^.!?\n]{0,25}\b(rating|stars?)\b/i,
];

const SUPPORT_REPLACES_REVIEW = /\b(instead|rather than|in place of)\b[^.!?\n]{0,40}\breview/i;

export interface LintInput {
  body: string;
  subject?: string | null;
  channel: 'sms' | 'email';
  industry: string;
}

export interface LintResult {
  ok: boolean;
  problems: string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Lint for review-request copy (rule R3, plus the template rules in the brief).
 * Runs on save and again before each send, so a stored template cannot bypass it.
 */
export function lintTemplate(input: LintInput): LintResult {
  const problems: string[] = [];
  const body = input.body;
  const text = `${input.subject ?? ''}\n${body}`;

  for (const match of body.matchAll(/\{([a-z_]+)\}/g)) {
    if (!(EDITABLE_TOKENS as readonly string[]).includes(match[1])) {
      problems.push(`Unknown merge field {${match[1]}}`);
    }
  }
  if (/\{service\}/.test(body) && input.industry === 'dental_medical') {
    problems.push('{service} is not allowed in dental or medical messages');
  }
  if (!/\{review_link\}/.test(body)) problems.push('The message must include {review_link}');
  if (input.channel === 'sms' && !/\{business_name\}/.test(body)) {
    problems.push('An SMS must include {business_name}');
  }
  if (input.channel === 'email' && !(input.subject && input.subject.trim())) {
    problems.push('An email needs a subject line');
  }
  if (body.length > 1000) problems.push('The message is longer than 1000 characters');

  if (RATING_PATTERNS.some((re) => re.test(text))) {
    problems.push('Rating or star language is not allowed in review requests');
  }
  for (const word of INCENTIVE_WORDS) {
    if (new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i').test(text)) {
      problems.push(`Incentive wording is not allowed: "${word}"`);
    }
  }
  if (/\b\d+\s?%\s?off\b/i.test(text)) problems.push('Discount wording is not allowed');
  if (REVIEW_CHANGE_PATTERNS.some((re) => re.test(text))) {
    problems.push('Asking someone to change, remove, or revise a review is not allowed');
  }
  if (SUPPORT_REPLACES_REVIEW.test(text)) {
    problems.push('The support link must not be presented as a replacement for leaving a review');
  }
  void LIMITS;
  return { ok: problems.length === 0, problems };
}
