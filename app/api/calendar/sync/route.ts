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

    // Upsert shoot events
    let created = 0;
    let updated = 0;
    let matched = 0;

    for (const shoot of shootEvents) {
      const clientId = clients ? matchShootToClient(shoot, clients) : null;
      if (clientId) matched++;

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
        updated++;
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
        created++;
      }
    }

    // Update last synced
    await adminClient
      .from('calendar_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', connection.id);

    return NextResponse.json({
      totalEvents: events.length,
      shootsFound: shootEvents.length,
      created,
      updated,
      matched,
    });
  } catch (error) {
    console.error('POST /api/calendar/sync error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
