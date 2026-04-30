/**
 * Format a scheduled post timestamp for inclusion in Google Chat messages.
 *
 * Renders in ET (the agency's working timezone) with a short, readable shape
 * like "Tue May 6 at 9:00 AM ET". Used in review/comment notifications so the
 * team can see *which* post the reviewer is acting on without opening the
 * share link.
 *
 * Returns null when the input doesn't parse — callers omit the line entirely
 * rather than emit a bad string.
 */
export function formatPostTimeForChat(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Intl.DateTimeFormat outputs slightly different parts in different runtimes;
  // we explicitly compose the parts we want so the output is stable.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = get('weekday');
  const month = get('month');
  const day = get('day');
  const hour = get('hour');
  const minute = get('minute');
  const dayPeriod = get('dayPeriod');
  return `${weekday} ${month} ${day} at ${hour}:${minute} ${dayPeriod} ET`;
}
