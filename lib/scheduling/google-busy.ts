/**
 * Google Calendar freeBusy fetcher (service-account / DWD path).
 *
 * Wraps the freebusy.query endpoint
 * (https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query)
 * using domain-wide delegation: we impersonate the workspace user by email and
 * query their primary calendar. No per-user OAuth required.
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

export interface BusyRange {
  start: Date;
  end: Date;
}

export interface FetchBusyResult {
  busy: BusyRange[];
  ok: boolean;
  error?: string;
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

  let res: Response;
  try {
    res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: email }],
      }),
    });
  } catch (err) {
    return {
      busy: [],
      ok: false,
      error: err instanceof Error ? err.message : 'Network error calling freeBusy',
    };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return {
      busy: [],
      ok: false,
      error: `freeBusy ${res.status}: ${body.slice(0, 240)}`,
    };
  }

  const json = (await res.json()) as {
    calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: { reason: string }[] }>;
  };

  const calendar = json.calendars?.[email];
  if (calendar?.errors?.length) {
    return {
      busy: [],
      ok: false,
      error: `Calendar errors: ${calendar.errors.map((e) => e.reason).join(', ')}`,
    };
  }

  const busy: BusyRange[] = (calendar?.busy ?? []).map((b) => ({
    start: new Date(b.start),
    end: new Date(b.end),
  }));

  return { busy, ok: true };
}
