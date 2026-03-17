import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateApiKey } from '@/lib/api-keys/validate';
import { getValidToken } from '@/lib/google/auth';

// ─── Google Calendar helpers ──────────────────────────────────────────────────

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

async function fetchCalendarEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string,
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Calendar API error: ${err}`);
  }

  const data = await res.json();
  return data.items ?? [];
}

interface CalendarEventInput {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string };
  end: { dateTime: string };
  attendees?: { email: string }[];
}

async function createCalendarEvent(
  accessToken: string,
  eventData: CalendarEventInput,
): Promise<{ id: string }> {
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventData),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Calendar create failed: ${err}`);
  }

  return res.json();
}

const createEventSchema = z.object({
  summary: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  start: z.string(),
  end: z.string(),
  attendees: z.array(z.object({ email: z.string().email() })).optional(),
});

/**
 * GET /api/v1/calendar/events
 *
 * Fetch Google Calendar events for the authenticated API key's user via
 * Google OAuth. Returns events normalized to { id, title, start, end, is_all_day }.
 *
 * @auth API key (Bearer token via Authorization header)
 * @query start - ISO 8601 date/time lower bound (required)
 * @query end - ISO 8601 date/time upper bound (required)
 * @returns {{ events: CalendarEvent[] }}
 */
export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  if (!start || !end) {
    return NextResponse.json({ error: 'start and end query params are required' }, { status: 400 });
  }

  const accessToken = await getValidToken(auth.ctx.userId);
  if (!accessToken) {
    return NextResponse.json({ error: 'No calendar connected for this user' }, { status: 404 });
  }

  try {
    const rawEvents = await fetchCalendarEvents(accessToken, start, end);

    const events = rawEvents.map((e) => ({
      id: e.id,
      title: e.summary ?? 'Untitled',
      start: e.start.dateTime ?? e.start.date ?? start,
      end: e.end.dateTime ?? e.end.date ?? end,
      is_all_day: !e.start.dateTime,
    }));

    return NextResponse.json({ events });
  } catch (err) {
    console.error('V1 calendar events error:', err);
    return NextResponse.json({ error: 'Failed to fetch calendar events' }, { status: 500 });
  }
}

/**
 * POST /api/v1/calendar/events
 *
 * Create a Google Calendar event via Google OAuth for the API key owner.
 *
 * @auth API key (Bearer token via Authorization header)
 * @body summary - Event title (required)
 * @body description - Event description (optional)
 * @body location - Event location (optional)
 * @body start - ISO 8601 start dateTime (required)
 * @body end - ISO 8601 end dateTime (required)
 * @body attendees - Array of { email } objects (optional)
 * @returns {{ event: { id, summary } }}
 */
export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const accessToken = await getValidToken(auth.ctx.userId);
  if (!accessToken) {
    return NextResponse.json({ error: 'No calendar connected for this user' }, { status: 404 });
  }

  try {
    const event = await createCalendarEvent(accessToken, {
      summary: parsed.data.summary,
      description: parsed.data.description,
      location: parsed.data.location,
      start: { dateTime: parsed.data.start },
      end: { dateTime: parsed.data.end },
      attendees: parsed.data.attendees,
    });

    return NextResponse.json({ event: { id: event.id, summary: parsed.data.summary } }, { status: 201 });
  } catch (err) {
    console.error('V1 calendar create error:', err);
    return NextResponse.json({ error: 'Failed to create calendar event' }, { status: 500 });
  }
}
