export type InboundKeyword = 'stop' | 'start' | 'help' | 'other';

const STOP_WORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const START_WORDS = new Set(['START', 'UNSTOP']);
const HELP_WORDS = new Set(['HELP', 'INFO']);

/**
 * Classifies an inbound SMS body. Only the bare keyword counts ("stop." counts,
 * "please stop texting" does not). START and UNSTOP are logged but never re-subscribe.
 */
export function classifyInbound(body: string): InboundKeyword {
  const word = body.trim().replace(/[^\p{L}]/gu, '').toUpperCase();
  if (STOP_WORDS.has(word)) return 'stop';
  if (START_WORDS.has(word)) return 'start';
  if (HELP_WORDS.has(word)) return 'help';
  return 'other';
}
