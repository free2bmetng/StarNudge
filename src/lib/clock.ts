import { cfg } from './config';

/**
 * Current time. In sandbox mode only, STARNUDGE_SANDBOX_NOW pins the clock so quiet-hour
 * and frequency checks are deterministic in end-to-end tests. Ignored in live mode.
 */
export function now(): Date {
  const pinned = process.env.STARNUDGE_SANDBOX_NOW;
  if (pinned && cfg().sandboxMode) return new Date(pinned);
  return new Date();
}
