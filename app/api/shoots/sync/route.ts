import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchCalendarEventsViaNango, isNangoConfigured } from '@/lib/nango/client';

/**
 * POST /api/shoots/sync
 * Fetches upcoming Google Calendar events via Nango, filters for shoot-related
 * events, and upserts into shoot_events matching on google_event_id.
 */
export async function POST() {
  try {
    if (!isNangoConfigured()) {
      return NextResponse.json(
        { error: 'Nango is not configured' },
        { status: 503 },
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role, nango_connection_id')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    if (!userData.nango_connection_id) {
      return NextResponse.json(
        { error: 'Google Calendar not connected. Connect in Settings first.' },
        { status: 400 },
      );
    }

    // Fetch upcoming events from Google Calendar
    const events = await fetchCalendarEventsViaNango(userData.nango_connection_id, 90);

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
