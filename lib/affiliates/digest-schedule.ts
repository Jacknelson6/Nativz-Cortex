import { getISOWeek, getISOWeekYear } from 'date-fns';

/** YYYY-MM-DD for the calendar date in `timeZone` at instant `date` (UTC). */
export function formatDateInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Local weekday and clock time in `timeZone` at instant `date`.
 * `dayOfWeek`: 0 Sunday … 6 Saturday (aligned with JavaScript getDay).
 */
export function getZonedDayAndTime(
  date: Date,
  timeZone: string,
): { dayOfWeek: number; hour: number; minute: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  });
  const parts = dtf.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPart['type']) =>
    parts.find((p) => p.type === type)?.value ?? '0';
  const wd = get('weekday');
  const hour = Number.parseInt(get('hour'), 10);
  const minute = Number.parseInt(get('minute'), 10);
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayOfWeek = dayMap[wd] ?? 0;
  return {
    dayOfWeek,
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

/** ISO week label for the zoned calendar date of `instant` (for deduping one send per week). */
export function isoWeekKeyForInstantInTimeZone(instant: Date, timeZone: string): string {
  const ymd = formatDateInTimeZone(instant, timeZone);
  const [y, m, d] = ymd.split('-').map((n) => Number.parseInt(n, 10));
  if (!y || !m || !d) return '';
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return `${getISOWeekYear(anchor)}-W${String(getISOWeek(anchor)).padStart(2, '0')}`;
}

export function isValidIanaTimeZone(tz: string): boolean {
  const t = tz?.trim();
  if (!t) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: t });
    return true;
  } catch {
    return false;
  }
}

/**
 * True when local time in `timeZone` falls in the same 15-minute bucket as the configured send time
 * on the configured weekday.
 */
export function matchesAffiliateDigestSchedule(
  now: Date,
  timeZone: string,
  sendDayOfWeek: number,
  sendHour: number,
  sendMinute: number,
): boolean {
  const z = getZonedDayAndTime(now, timeZone);
  if (z.dayOfWeek !== sendDayOfWeek) return false;
  if (z.hour !== sendHour) return false;
  return Math.floor(z.minute / 15) === Math.floor(sendMinute / 15);
}
