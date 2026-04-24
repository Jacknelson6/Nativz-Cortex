import type { DateRange } from '@/lib/types/reporting';

/**
 * Default admin timezone. Jack confirmed all Cortex admins are in Central
 * (America/Chicago) as of 2026-04-24. If this ever needs to be per-user,
 * read it from a `users.timezone` column and pass it through to the
 * range helpers below.
 */
export const ADMIN_TIMEZONE = 'America/Chicago';

/**
 * Convert a picker DateRange ({start, end} as local YYYY-MM-DD) into UTC
 * ISO strings suitable for Supabase timestamptz comparisons.
 *
 *   start → 00:00:00.000 local
 *   end   → 23:59:59.999 local
 *
 * Background: the DateRangePicker returns YYYY-MM-DD strings that the
 * user reads as *local* dates. Naive parsing — `new Date("2026-04-24")`
 * — runs in the Node process's timezone. On Vercel that's UTC, so a
 * Central admin's "last 7 days" query window shifts 5-6h (~one full
 * night of activity depending on DST). This helper pins the conversion
 * to the given tz so the window matches what the user picked, regardless
 * of where the server is running.
 *
 * DST transitions are handled because the offset is computed at the
 * guessed instant via Intl.DateTimeFormat (IANA TZ data).
 */
export function rangeToUtcIso(
  range: DateRange,
  tz: string = ADMIN_TIMEZONE,
): { startIso: string; endIso: string } {
  return {
    startIso: localDateTimeToUtcIso(range.start, '00:00:00.000', tz),
    endIso: localDateTimeToUtcIso(range.end, '23:59:59.999', tz),
  };
}

function localDateTimeToUtcIso(dateStr: string, time: string, tz: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hms, msPart = '0'] = time.split('.');
  const [h, mi, s] = hms.split(':').map(Number);
  const ms = Number(msPart.padEnd(3, '0').slice(0, 3));

  // Treat the naive components as if they were UTC. Then ask Intl for the
  // wall-clock reading of that instant in `tz` and measure the delta —
  // that delta IS the tz offset at the guessed moment. Subtracting it
  // flips the naive UTC guess into the real UTC instant that corresponds
  // to the wall-clock the user typed.
  const guessMs = Date.UTC(y, m - 1, d, h, mi, s, ms);
  const offset = tzOffsetMsAt(tz, guessMs);
  return new Date(guessMs - offset).toISOString();
}

function tzOffsetMsAt(tz: string, atMs: number): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = fmt.formatToParts(new Date(atMs));
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  // `hour12: false` formats midnight as '24' in some locales; clamp.
  const hour = map.hour === '24' ? 0 : Number(map.hour);
  const asIfInTz = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asIfInTz - atMs;
}
