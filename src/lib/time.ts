export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Wall-clock parts of an instant in a time zone. */
export function localParts(date: Date, timeZone: string): LocalParts {
  const parts = formatter(timeZone).formatToParts(date);
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour') % 24,
    minute: read('minute'),
  };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** True when the local hour is in [startHour, endHour). */
export function isInSendWindow(date: Date, timeZone: string, startHour: number, endHour: number): boolean {
  const { hour } = localParts(date, timeZone);
  return hour >= startHour && hour < endHour;
}

/**
 * First instant strictly after `after` whose local time is HH:00 in the zone.
 * Scans in 15-minute steps, so half-hour and quarter-hour offsets resolve correctly.
 */
export function nextLocalHour(after: Date, timeZone: string, hour: number): Date {
  const step = 15 * 60 * 1000;
  const start = Math.floor(after.getTime() / step) * step + step;
  for (let i = 0; i < 4 * 24 * 4; i++) {
    const candidate = new Date(start + i * step);
    const parts = localParts(candidate, timeZone);
    if (parts.hour === hour && parts.minute === 0) return candidate;
  }
  throw new Error(`No ${hour}:00 found in ${timeZone} after ${after.toISOString()}`);
}

/** The instant whose local wall-clock time is y-m-d h:mi in the zone, or null if the time does not exist (DST gap). */
export function instantForLocal(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date | null {
  const approx = Date.UTC(year, month - 1, day, hour, minute);
  for (let offsetMinutes = -26 * 60; offsetMinutes <= 26 * 60; offsetMinutes += 15) {
    const candidate = new Date(approx + offsetMinutes * 60_000);
    const p = localParts(candidate, timeZone);
    if (p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute) {
      return candidate;
    }
  }
  return null;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
