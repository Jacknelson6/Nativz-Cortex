import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Fetch upcoming shoot events with client names
    const { data: events, error } = await adminClient
      .from('shoot_events')
      .select(`
        *,
        clients(name, slug)
      `)
      .gte('shoot_date', new Date().toISOString())
      .order('shoot_date', { ascending: true })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }

    // Flatten the client name into the event
    const formatted = (events ?? []).map((e) => ({
      ...e,
      client_name: (e.clients as { name: string } | null)?.name ?? null,
      client_slug: (e.clients as { slug: string } | null)?.slug ?? null,
      clients: undefined,
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error('GET /api/calendar/events error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
