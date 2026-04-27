/**
 * Google Calendar busy-range fetcher (service-account / DWD path).
 *
 * Wraps events.list (https://developers.google.com/workspace/calendar/api/v3/reference/events/list)
 * rather than freebusy.query so we can read titles. We need titles to honor the
 * project's soft-block rules — events whose summary matches a pattern in
 * `soft-block-rules.ts` (e.g. "shoot") are visible in the calendar but do NOT
 * gate slot availability. freebusy.query strips summaries entirely so the rule
 * couldn't be enforced from there.
 *
 * Only nativz.io and andersoncollaborative.com workspaces are authorized for
 * impersonation — `isImpersonateAllowed()` enforces this in front of the API
 * call so a typo or misconfigured event member can't trip a 401 retry storm.
 */
import {
  getServiceAccountCalendarToken,
  isImpersonateAllowed,
  ALLOWED_IMPERSONATE_DOMAINS,
} from '@/lib/google/service-account';
import { isSoftBlockedTitle } from './soft-block-rules';

export interface BusyRange {
  start: Date;
  end: Date;
}

export interface FetchBusyResult {
  busy: BusyRange[];
  ok: boolean;
  error?: string;
}

interface GoogleEventItem {
  status?: string;
  transparency?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email?: string; responseStatus?: string; self?: boolean }[];
}

/**
 * Fetch busy ranges for one workspace user between `timeMin` and `timeMax`.
 * The user must belong to a workspace whose admin has authorized this service
 * account's Client ID with the `calendar.readonly` scope.
 */
export async function fetchBusyForEmail({
  email,
  timeMin,
  timeMax,
}: {
  email: string;
  timeMin: Date;
  timeMax: Date;
}): Promise<FetchBusyResult> {
  if (!isImpersonateAllowed(email)) {
    return {
      busy: [],
      ok: false,
      error: `${email} is outside authorized workspaces (${ALLOWED_IMPERSONATE_DOMAINS.join(', ')})`,
    };
  }

  let token: string;
  try {
    token = await getServiceAccountCalendarToken(email);
  } catch (err) {
    return {
      busy: [],
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to mint calendar access token',
    };
  }

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    showDeleted: 'false',
    orderBy: 'startTime',
    maxResults: '2500',
    fields: 'items(status,transparency,summary,start,end,attendees(email,responseStatus,self))',
  });

  let res: Response;
  try {
    res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
    );
  } catch (err) {
    return {
      busy: [],
      ok: false,
      error: err instanceof Error ? err.message : 'Network error calling events.list',
    };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return {
      busy: [],
      ok: false,
      error: `events.list ${res.status}: ${body.slice(0, 240)}`,
    };
  }

  const json = (await res.json()) as { items?: GoogleEventItem[] };
  const items = json.items ?? [];

  const busy: BusyRange[] = [];
  for (const ev of items) {
    if (ev.status === 'cancelled') continue;
    if (ev.transparency === 'transparent') continue;
    if (isSoftBlockedTitle(ev.summary)) continue;
    const self = ev.attendees?.find((a) => a.self === true);
    if (self?.responseStatus === 'declined') continue;

    const startStr = ev.start?.dateTime ?? ev.start?.date;
    const endStr = ev.end?.dateTime ?? ev.end?.date;
    if (!startStr || !endStr) continue;

    busy.push({ start: new Date(startStr), end: new Date(endStr) });
  }

  return { busy, ok: true };
}
