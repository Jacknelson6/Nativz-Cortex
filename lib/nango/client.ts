/**
 * Nango SDK wrapper for Google Calendar OAuth.
 *
 * Required env vars:
 * - NANGO_SECRET_KEY
 * - NEXT_PUBLIC_NANGO_PUBLIC_KEY (unused server-side, but checked for completeness)
 */

import { Nango } from '@nangohq/node';

const PROVIDER_CONFIG_KEY = 'google-calendar';

let _nango: Nango | null = null;

function getNango(): Nango {
  if (!_nango) {
    const secretKey = process.env.NANGO_SECRET_KEY;
    if (!secretKey) throw new Error('NANGO_SECRET_KEY not set');
    _nango = new Nango({ secretKey });
  }
  return _nango;
}

export function isNangoConfigured(): boolean {
  return !!process.env.NANGO_SECRET_KEY;
}

/**
 * Create a connect session for the frontend OAuth popup.
 * Returns a session token the frontend uses with `new Nango({ connectSessionToken })`.
 */
export async function createConnectSession(userId: string) {
  const nango = getNango();
  const { data } = await nango.createConnectSession({
    tags: { end_user_id: userId },
    allowed_integrations: [PROVIDER_CONFIG_KEY],
  });
  return data;
}

interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  status: string;
}

interface CalendarEventsResponse {
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
}

/**
 * Fetch upcoming calendar events via Nango's proxy.
 * Nango handles token refresh transparently.
 */
export async function fetchCalendarEventsViaNango(
  nangoConnectionId: string,
  daysAhead: number = 60,
): Promise<GoogleCalendarEvent[]> {
  const nango = getNango();

  const now = new Date().toISOString();
  const future = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

  const response = await nango.get<CalendarEventsResponse>({
    endpoint: '/calendar/v3/calendars/primary/events',
    providerConfigKey: PROVIDER_CONFIG_KEY,
    connectionId: nangoConnectionId,
    params: {
      timeMin: now,
      timeMax: future,
      maxResults: '100',
      singleEvents: 'true',
      orderBy: 'startTime',
    },
  });

  return (response.data?.items ?? []).filter((e) => e.status !== 'cancelled');
}

/**
 * Create a Google Calendar event via Nango's proxy.
 */
export async function createCalendarEventViaNango(
  nangoConnectionId: string,
  event: {
    summary: string;
    description?: string;
    location?: string;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
    attendees?: Array<{ email: string }>;
  },
): Promise<{ id: string; htmlLink: string }> {
  const nango = getNango();

  const response = await nango.post<{ id: string; htmlLink: string }>({
    endpoint: '/calendar/v3/calendars/primary/events',
    providerConfigKey: PROVIDER_CONFIG_KEY,
    connectionId: nangoConnectionId,
    params: { sendUpdates: 'all' },
    data: event,
  });

  return response.data;
}
