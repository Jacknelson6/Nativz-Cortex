import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getValidToken } from '@/lib/google/auth';
import { identifyShootEvents, matchShootToClient } from '@/lib/google/calendar';

// ─── Google Calendar fetch helper ─────────────────────────────────────────────

interface GoogleCalendarEvent {
  id: string;
  summary: string;
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
 * POST /api/calendar/sync
 *
 * Sync the authenticated admin's Google Calendar with Cortex. Fetches upcoming events (60 days)
 * via Google OAuth, identifies shoot events and creates/updates shoot_events records, and pulls
 * changes to Cortex meetings (time shifts, title changes, cancellations).
 *
 * @auth Required (admin)
 * @returns {{ totalEvents, shoots: { found, created, updated, matched }, meetings: { synced, updated, cancelled } }}
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

    // Get a valid Google OAuth token for the user
    const accessToken = await getValidToken(user.id);
    if (!accessToken) {
      return NextResponse.json(
        { error: 'No Google Calendar connection found. Connect your calendar in Settings first.' },
        { status: 404 },
      );
    }

    // Fetch upcoming calendar events via Google Calendar API (next 60 days)
    const events = await fetchCalendarEvents(accessToken, 60);
    const shootEvents = identifyShootEvents(events);

    // Get all clients for matching
    const { data: clients } = await adminClient
      .from('clients')
      .select('id, name, slug')
      .eq('is_active', true);

    // ── Sync shoots ──────────────────────────────────────────────────────────
    let shootsCreated = 0;
    let shootsUpdated = 0;
    let shootsMatched = 0;

    // Get the user's calendar connection (if any) for linking shoot events
    const { data: connection } = await adminClient
      .from('calendar_connections')
      .select('id')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .single();

    for (const shoot of shootEvents) {
      const clientId = clients ? matchShootToClient(shoot, clients) : null;
      if (clientId) shootsMatched++;

      const { data: existing } = await adminClient
        .from('shoot_events')
        .select('id')
        .eq('google_event_id', shoot.googleEventId)
        .single();

      if (existing) {
        await adminClient
          .from('shoot_events')
          .update({
            title: shoot.title,
            shoot_date: shoot.shootDate,
            location: shoot.location,
            notes: shoot.notes,
            client_id: clientId,
          })
          .eq('id', existing.id);
        shootsUpdated++;
      } else {
        await adminClient.from('shoot_events').insert({
          calendar_connection_id: connection?.id ?? null,
          google_event_id: shoot.googleEventId,
          client_id: clientId,
          title: shoot.title,
          shoot_date: shoot.shootDate,
          location: shoot.location,
          notes: shoot.notes,
          plan_status: 'pending',
        });
        shootsCreated++;
      }
    }

    // ── Sync meetings (pull changes from Google Calendar) ─────────────────────
    // Find all meetings with a google_event_id created by this user
    const { data: cortexMeetings } = await adminClient
      .from('meetings')
      .select('id, google_event_id, scheduled_at, duration_minutes, title, status')
      .not('google_event_id', 'is', null)
      .eq('created_by', user.id);

    let meetingsUpdated = 0;
    let meetingsCancelled = 0;

    if (cortexMeetings && cortexMeetings.length > 0) {
      // Build a map of Google Calendar events by ID for quick lookup
      const gcalEventMap = new Map<string, typeof events[number]>();
      for (const e of events) {
        gcalEventMap.set(e.id, e);
      }

      for (const meeting of cortexMeetings) {
        if (!meeting.google_event_id) continue;

        const gcalEvent = gcalEventMap.get(meeting.google_event_id);

        if (!gcalEvent) {
          if (meeting.status === 'scheduled') {
            const meetingDate = new Date(meeting.scheduled_at);
            if (meetingDate > new Date()) {
              await adminClient
                .from('meetings')
                .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                .eq('id', meeting.id);
              meetingsCancelled++;
            }
          }
          continue;
        }

        // Event exists — check if time changed
        const gcalStart = gcalEvent.start.dateTime ?? gcalEvent.start.date;
        if (!gcalStart) continue;

        const gcalStartDate = new Date(gcalStart);
        const cortexStartDate = new Date(meeting.scheduled_at);

        const timeDiff = Math.abs(gcalStartDate.getTime() - cortexStartDate.getTime());
        const titleChanged = gcalEvent.summary !== meeting.title;

        if (timeDiff > 60000 || titleChanged) {
          const updates: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
          };

          if (timeDiff > 60000) {
            updates.scheduled_at = gcalStartDate.toISOString();
            if (gcalEvent.end.dateTime) {
              const gcalEnd = new Date(gcalEvent.end.dateTime);
              updates.duration_minutes = Math.round((gcalEnd.getTime() - gcalStartDate.getTime()) / 60000);
            }
          }

          if (titleChanged) {
            updates.title = gcalEvent.summary;
          }

          if (gcalEvent.location) {
            updates.location = gcalEvent.location;
          }

          await adminClient.from('meetings').update(updates).eq('id', meeting.id);
          meetingsUpdated++;
        }
      }
    }

    // Update last synced
    if (connection) {
      await adminClient
        .from('calendar_connections')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', connection.id);
    }

    return NextResponse.json({
      totalEvents: events.length,
      shoots: {
        found: shootEvents.length,
        created: shootsCreated,
        updated: shootsUpdated,
        matched: shootsMatched,
      },
      meetings: {
        synced: cortexMeetings?.length ?? 0,
        updated: meetingsUpdated,
        cancelled: meetingsCancelled,
      },
    });
  } catch (error) {
    console.error('POST /api/calendar/sync error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
