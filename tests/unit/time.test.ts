import { describe, expect, it } from 'vitest';
import { instantForLocal, isInSendWindow, localParts, nextLocalHour } from '@/lib/time';

describe('time zones and quiet hours', () => {
  it('reads wall-clock parts in a zone', () => {
    expect(localParts(new Date('2026-11-09T17:00:00Z'), 'America/New_York')).toMatchObject({ hour: 12, minute: 0, day: 9 });
    expect(localParts(new Date('2026-11-09T17:00:00Z'), 'America/Los_Angeles')).toMatchObject({ hour: 9 });
  });

  it('send window is [start, end)', () => {
    const tz = 'America/New_York';
    expect(isInSendWindow(new Date('2026-11-09T13:00:00Z'), tz, 8, 21)).toBe(true); // 08:00
    expect(isInSendWindow(new Date('2026-11-09T12:59:00Z'), tz, 8, 21)).toBe(false); // 07:59
    expect(isInSendWindow(new Date('2026-11-10T01:59:00Z'), tz, 8, 21)).toBe(true); // 20:59
    expect(isInSendWindow(new Date('2026-11-10T02:00:00Z'), tz, 8, 21)).toBe(false); // 21:00
  });

  it('finds the next 08:00 across a daylight-saving change', () => {
    // US clocks go back on 2026-11-01. Ask for 08:00 on a day after the change.
    const after = new Date('2026-11-09T03:00:00Z'); // 22:00 EST on the 8th
    const next = nextLocalHour(after, 'America/New_York', 8);
    expect(localParts(next, 'America/New_York')).toMatchObject({ hour: 8, minute: 0, day: 9 });
    expect(next.toISOString()).toBe('2026-11-09T13:00:00.000Z');
  });

  it('handles a half-hour offset zone', () => {
    const next = nextLocalHour(new Date('2026-11-09T00:00:00Z'), 'Asia/Kolkata', 8);
    expect(localParts(next, 'Asia/Kolkata')).toMatchObject({ hour: 8, minute: 0 });
  });

  it('turns a wall-clock time into an instant, and returns null for a skipped DST hour', () => {
    const t = instantForLocal('America/New_York', 2026, 11, 9, 12, 0);
    expect(t?.toISOString()).toBe('2026-11-09T17:00:00.000Z');
    // 2026-03-08 02:30 does not exist in New York (clocks jump forward).
    expect(instantForLocal('America/New_York', 2026, 3, 8, 2, 30)).toBeNull();
  });
});
