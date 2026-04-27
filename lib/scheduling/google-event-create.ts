/**
 * Insert a Google Calendar event on the organizer's primary calendar with a
 * Meet conference attached. Used by the public scheduling picker — when a
 * client picks a slot we want a real calendar invite to land on every required
 * teammate's calendar plus the picker's email, with a Meet link in the body.
 *
 * Auth: service-account / domain-wide-delegation, impersonating the organizer
 * email. The organizer must live inside an authorized workspace
 * (`isImpersonateAllowed`) AND the workspace admin must have allowlisted the SA
 * Client ID with `calendar.events` scope. If the scope isn't authorized this
 * call returns `{ ok: false, error: ... }` — callers must treat event creation
 * as best-effort and never block the pick on it.
 */
import {
  getServiceAccountCalendarEventsToken,
  isImpersonateAllowed,
  ALLOWED_IMPERSONATE_DOMAINS,
} from '@/lib/google/service-account';

export interface CreateSchedulingEventInput {
  organizerEmail: string;
  summary: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  attendees: Array<{ email: string; displayName?: string | null; optional?: boolean }>;
  timezone?: string;
}

export interface CreateSchedulingEventResult {
  ok: boolean;
  eventId?: string;
  htmlLink?: string;
  meetLink?: string | null;
  error?: string;
}

interface GoogleEventResponse {
  id?: string;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
  };
}

export async function createSchedulingCalendarEvent({
  organizerEmail,
  summary,
  description,
  startAt,
  endAt,
  attendees,
  timezone = 'America/New_York',
}: CreateSchedulingEventInput): Promise<CreateSchedulingEventResult> {
  if (!isImpersonateAllowed(organizerEmail)) {
    return {
      ok: false,
      error: `${organizerEmail} outside authorized workspaces (${ALLOWED_IMPERSONATE_DOMAINS.join(', ')})`,
    };
  }

  let token: string;
  try {
    token = await getServiceAccountCalendarEventsToken(organizerEmail);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to mint calendar.events token',
    };
  }

  const requestId = `nz-sched-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const body = {
    summary,
    description,
    start: { dateTime: startAt.toISOString(), timeZone: timezone },
    end: { dateTime: endAt.toISOString(), timeZone: timezone },
    attendees: attendees.map((a) => ({
      email: a.email,
      displayName: a.displayName ?? undefined,
      optional: a.optional ?? false,
    })),
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    reminders: { useDefault: true },
    guestsCanModify: false,
    guestsCanInviteOthers: false,
  };

  let res: Response;
  try {
    res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(organizerEmail)}/events?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error calling events.insert',
    };
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    return { ok: false, error: `events.insert ${res.status}: ${errBody.slice(0, 240)}` };
  }

  const json = (await res.json()) as GoogleEventResponse;
  const meetEntry = json.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video');
  return {
    ok: true,
    eventId: json.id,
    htmlLink: json.htmlLink,
    meetLink: meetEntry?.uri ?? json.hangoutLink ?? null,
  };
}
