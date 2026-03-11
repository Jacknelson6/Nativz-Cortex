import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchCalendarEventsViaNango } from '@/lib/nango/client';
import { identifyShootEvents, matchShootToClient } from '@/lib/google/calendar';

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

    // Get user's calendar connection
    const { data: connection, error: connError } = await adminClient
      .from('calendar_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { error: 'No Google Calendar connection found. Connect your calendar first.' },
        { status: 404 },
      );
    }

    if (!connection.nango_connection_id) {
      return NextResponse.json(
        { error: 'Calendar connection needs to be re-authorized via Nango.' },
        { status: 400 },
      );
    }

    // Fetch upcoming calendar events via Nango proxy (next 60 days)
    const events = await fetchCalendarEventsViaNango(connection.nango_connection_id, 60);
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
          calendar_connection_id: connection.id,
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

      // Also check for cancelled events — fetch with showDeleted
      // For now, match existing meetings against fetched events
      for (const meeting of cortexMeetings) {
        if (!meeting.google_event_id) continue;

        const gcalEvent = gcalEventMap.get(meeting.google_event_id);

        if (!gcalEvent) {
          // Event no longer in Google Calendar (possibly cancelled or past range)
          // Only mark as cancelled if it was scheduled (not already cancelled)
          if (meeting.status === 'scheduled') {
            // Don't auto-cancel — the event might just be outside the 60-day window
            // Only cancel if the meeting is in the future
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

        // Check if start time changed (more than 1 minute difference)
        const timeDiff = Math.abs(gcalStartDate.getTime() - cortexStartDate.getTime());
        const titleChanged = gcalEvent.summary !== meeting.title;

        if (timeDiff > 60000 || titleChanged) {
          const updates: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
          };

          if (timeDiff > 60000) {
            updates.scheduled_at = gcalStartDate.toISOString();
            // Recompute duration if end time is available
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
    await adminClient
      .from('calendar_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', connection.id);

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
