/**
 * Google Calendar events.list fetcher (service-account / DWD path).
 *
 * Returns full event objects (title, start, end) for an impersonated workspace
 * user's primary calendar. Distinct from `google-busy.ts` which calls the
 * coarse-grained freeBusy endpoint — this one is used by the unified calendar
 * overlay where admins want to see the actual meeting titles.
 */
import {
  getServiceAccountCalendarToken,
  isImpersonateAllowed,
  ALLOWED_IMPERSONATE_DOMAINS,
} from '@/lib/google/service-account';

export interface CalendarEventDTO {
  id: string;
  title: string;
  start: string; // ISO datetime or date
  end: string;   // ISO datetime or date
  isAllDay: boolean;
}

export interface FetchEventsResult {
  events: CalendarEventDTO[];
  ok: boolean;
  error?: string;
}

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  status?: string;
  transparency?: string;
}

/**
 * Fetch event objects for one workspace user's primary calendar in [timeMin, timeMax].
 * Filters out cancelled events. Keeps `transparent` (free) events because the
 * overlay UI is informational — admins want to see all entries on the calendar
 * even if Google considers them non-blocking.
 */
export async function fetchEventsForEmail({
  email,
  timeMin,
  timeMax,
}: {
  email: string;
  timeMin: Date;
  timeMax: Date;
}): Promise<FetchEventsResult> {
  if (!isImpersonateAllowed(email)) {
    return {
      events: [],
      ok: false,
      error: `${email} outside authorized workspaces (${ALLOWED_IMPERSONATE_DOMAINS.join(', ')})`,
    };
  }

  let token: string;
  try {
    token = await getServiceAccountCalendarToken(email);
  } catch (err) {
    return {
      events: [],
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to mint calendar access token',
    };
  }

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });

  let res: Response;
  try {
    res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(email)}/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  } catch (err) {
    return {
      events: [],
      ok: false,
      error: err instanceof Error ? err.message : 'Network error calling events.list',
    };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return {
      events: [],
      ok: false,
      error: `events.list ${res.status}: ${body.slice(0, 240)}`,
    };
  }

  const json = (await res.json()) as { items?: GoogleCalendarEvent[] };
  const items = json.items ?? [];

  const events: CalendarEventDTO[] = items
    .filter((e) => e.status !== 'cancelled' && (e.start.dateTime || e.start.date))
    .map((e) => {
      const isAllDay = !e.start.dateTime;
      const start = e.start.dateTime ?? e.start.date ?? '';
      const end = e.end.dateTime ?? e.end.date ?? start;
      return {
        id: e.id,
        title: e.summary ?? '(no title)',
        start,
        end,
        isAllDay,
      };
    });

  return { events, ok: true };
}

export interface PersonEventsResult {
  personId: string;
  events: CalendarEventDTO[];
  errors: { email: string; error: string }[];
}

/**
 * Fetch events for every email tied to a person, dedupe by event id (same
 * meeting on both workspace accounts only counts once), and return one
 * collated list. Per-email failures are surfaced in `errors` but do not abort
 * the whole fetch — a person whose AC mailbox doesn't exist still returns
 * their nativz.io events.
 */
export async function fetchEventsForPerson({
  personId,
  emails,
  timeMin,
  timeMax,
}: {
  personId: string;
  emails: string[];
  timeMin: Date;
  timeMax: Date;
}): Promise<PersonEventsResult> {
  const results = await Promise.all(
    emails.map(async (email) => ({
      email,
      result: await fetchEventsForEmail({ email, timeMin, timeMax }),
    })),
  );

  const seen = new Set<string>();
  const events: CalendarEventDTO[] = [];
  const errors: { email: string; error: string }[] = [];

  for (const { email, result } of results) {
    if (!result.ok) {
      errors.push({ email, error: result.error ?? 'Unknown error' });
      continue;
    }
    for (const ev of result.events) {
      // Dedupe by Google event id; the same meeting on jake@nativz.io and
      // jake@andersoncollaborative.com shares an iCalUID but has different
      // ids per calendar — fall back to (start|title) for cross-account dedupe.
      const key = `${ev.start}|${ev.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(ev);
    }
  }

  events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return { personId, events, errors };
}
