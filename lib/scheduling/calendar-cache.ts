/**
 * Calendar-events cache. Wraps `fetchEventsForPerson` with Next.js
 * `unstable_cache` so the per-person Google Calendar fetch survives across
 * Fluid Compute instances. Cached for 24h by default — admins can manually
 * invalidate via the Refresh button on /admin/scheduling, which calls
 * `revalidateTag(CALENDAR_EVENTS_CACHE_TAG)`.
 *
 * Why daily: Google Calendar is the source of truth, so we accept a small
 * propagation delay for new events created outside the app in exchange for
 * sub-second page loads. The Refresh button is the escape hatch when an
 * admin knows they just added something.
 */
import { unstable_cache } from 'next/cache';
import { fetchEventsForPerson, type PersonEventsResult } from './google-events';

export const CALENDAR_EVENTS_CACHE_TAG = 'scheduling-calendar-events';
const CACHE_REVALIDATE_SECONDS = 24 * 60 * 60;

/**
 * Return events for one person + window. Args are positional so the
 * cache-key hash is stable; emails are joined with `|` after lower-casing
 * so reorderings don't trigger a miss.
 */
export const fetchEventsForPersonCached = unstable_cache(
  async (
    personId: string,
    emailsKey: string,
    startISO: string,
    endISO: string,
  ): Promise<PersonEventsResult> => {
    return fetchEventsForPerson({
      personId,
      emails: emailsKey.split('|').filter(Boolean),
      timeMin: new Date(startISO),
      timeMax: new Date(endISO),
    });
  },
  ['scheduling-calendar-events-v1'],
  { tags: [CALENDAR_EVENTS_CACHE_TAG], revalidate: CACHE_REVALIDATE_SECONDS },
);

/** Canonicalize an email list into a stable cache-key fragment. */
export function emailsCacheKey(emails: string[]): string {
  return [...emails].map((e) => e.toLowerCase().trim()).sort().join('|');
}
