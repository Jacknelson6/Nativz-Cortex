/**
 * Google Calendar freeBusy fetcher.
 *
 * Wraps the freebusy.query endpoint
 * (https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query)
 * for a single user. We only need the union of busy ranges across that user's
 * primary calendar — when team-availability scheduler computes overlap, it merges
 * busy ranges across N users and subtracts them from each day's working window.
 *
 * Auth re-uses the existing `lib/google/auth.ts` token store. The user must have
 * granted `calendar.readonly` (added in the SCOPES list of that file). Existing
 * connections from before that scope was added will return 403 on freebusy until
 * the user re-consents.
 */
import { getValidToken } from '@/lib/google/auth';

export interface BusyRange {
  start: Date;
  end: Date;
}

export interface FetchBusyResult {
  busy: BusyRange[];
  /** True when the freebusy call succeeded — useful when callers want to
   *  distinguish "no events" from "couldn't reach Google". */
  ok: boolean;
  /** Populated when `ok === false`: human-readable diagnosis. */
  error?: string;
}

/**
 * Fetch busy ranges for one user between `timeMin` and `timeMax`. Returns
 * `{ ok: false, error }` when the user has no Google connection or the API
 * call fails — callers should surface this in the team scheduler UI so admins
 * know which member is blocking slot computation.
 */
export async function fetchBusyForUser({
  userId,
  timeMin,
  timeMax,
}: {
  userId: string;
  timeMin: Date;
  timeMax: Date;
}): Promise<FetchBusyResult> {
  const token = await getValidToken(userId);
  if (!token) {
    return { busy: [], ok: false, error: 'Google not connected (or refresh token revoked)' };
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
        items: [{ id: 'primary' }],
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

  const primary = json.calendars?.primary;
  if (primary?.errors?.length) {
    return {
      busy: [],
      ok: false,
      error: `Calendar errors: ${primary.errors.map((e) => e.reason).join(', ')}`,
    };
  }

  const busy: BusyRange[] = (primary?.busy ?? []).map((b) => ({
    start: new Date(b.start),
    end: new Date(b.end),
  }));

  return { busy, ok: true };
}
