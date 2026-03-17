import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getValidToken } from '@/lib/google/auth';

// ─── Google Calendar fetch helper ─────────────────────────────────────────────

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  status: string;
}

async function fetchCalendarEvents(
  accessToken: string,
  daysAhead: number,
): Promise<GoogleCalendarEvent[]> {
  const now = new Date();
  const future = new Date();
  future.setDate(now.getDate() + daysAhead);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: future.toISOString(),
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

/**
 * POST /api/shoots/sync
 *
 * Fetch upcoming Google Calendar events (next 90 days) via the user's Google OAuth token,
 * filter for shoot-related events by keyword (shoot, film, content day, production),
 * and upsert into shoot_events matching on google_event_id. Client names are inferred
 * from the event title by fuzzy matching against active Cortex clients.
 *
 * @auth Required (admin with Google Calendar connected)
 * @returns {{ synced: number, skipped: number, total_calendar_events: number, shoot_events_found: number }}
 */
export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const accessToken = await getValidToken(user.id);
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Google Calendar not connected. Connect in Settings first.' },
        { status: 400 },
      );
    }

    // Fetch upcoming events from Google Calendar
    const events = await fetchCalendarEvents(accessToken, 90);

    // Filter for shoot-related events
    const SHOOT_KEYWORDS = ['shoot', 'film', 'content day', 'production'];
    const shootEvents = events.filter((e) => {
      const title = (e.summary ?? '').toLowerCase();
      return SHOOT_KEYWORDS.some((kw) => title.includes(kw));
    });

    if (shootEvents.length === 0) {
      return NextResponse.json({ synced: 0, message: 'No shoot-related events found' });
    }

    // Try to match client names from event titles
    const { data: clients } = await adminClient
      .from('clients')
      .select('id, name')
      .eq('is_active', true);

    const clientMap = new Map<string, string>();
    for (const c of clients ?? []) {
      clientMap.set(c.name.toLowerCase(), c.id);
    }

    function matchClient(summary: string): string | null {
      const lower = summary.toLowerCase();
      for (const [name, id] of clientMap) {
        if (lower.includes(name)) return id;
      }
      return null;
    }

    // Upsert shoot events
    let synced = 0;
    let skipped = 0;

    for (const event of shootEvents) {
      const googleEventId = event.id;

      // Determine shoot date from event start
      const startStr = event.start.dateTime ?? event.start.date ?? null;
      if (!startStr) {
        skipped++;
        continue;
      }

      const shootDate = new Date(startStr);
      const clientId = matchClient(event.summary ?? '');

      // Check if this event already exists
      const { data: existing } = await adminClient
        .from('shoot_events')
        .select('id')
        .eq('google_event_id', googleEventId)
        .maybeSingle();

      if (existing) {
        // Update existing record
        await adminClient
          .from('shoot_events')
          .update({
            title: event.summary ?? 'Untitled shoot',
            shoot_date: shootDate.toISOString(),
            location: event.location ?? null,
            notes: event.description ?? null,
            ...(clientId ? { client_id: clientId } : {}),
          })
          .eq('id', existing.id);
      } else {
        // Insert new record
        await adminClient
          .from('shoot_events')
          .insert({
            title: event.summary ?? 'Untitled shoot',
            shoot_date: shootDate.toISOString(),
            location: event.location ?? null,
            notes: event.description ?? null,
            client_id: clientId,
            google_event_id: googleEventId,
            google_calendar_event_created: true,
            scheduled_status: 'scheduled',
            created_by: user.id,
          });
      }

      synced++;
    }

    return NextResponse.json({
      synced,
      skipped,
      total_calendar_events: events.length,
      shoot_events_found: shootEvents.length,
    });
  } catch (error) {
    console.error('POST /api/shoots/sync error:', error);
    return NextResponse.json({ error: 'Failed to sync calendar events' }, { status: 500 });
  }
}
