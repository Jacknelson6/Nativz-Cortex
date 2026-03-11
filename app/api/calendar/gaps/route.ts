import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/calendar/gaps
 *
 * Returns active clients that are missing:
 * 1. Their monthly shoot (no shoot_events record with shoot_date in the current month)
 * 2. Their next biweekly meeting (no future meeting, or last meeting was >16 days ago)
 *
 * Each entry includes the assigned strategist from client_assignments.
 */

interface ClientGap {
  client_id: string;
  client_name: string;
  client_slug: string;
  strategist_name: string | null;
  strategist_id: string | null;
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Verify admin
    const { data: userData } = await adminClient.from('users').select('role').eq('id', user.id).single();
    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get all active clients
    const { data: clients } = await adminClient
      .from('clients')
      .select('id, name, slug')
      .eq('is_active', true)
      .order('name');

    if (!clients || clients.length === 0) {
      return NextResponse.json({ needs_shoot: [], needs_meeting: [], day_of_month: new Date().getDate() });
    }

    const clientIds = clients.map((c) => c.id);

    // Get strategist assignments for all clients
    const { data: assignments } = await adminClient
      .from('client_assignments')
      .select('client_id, team_member_id, role, team_members(full_name)')
      .in('client_id', clientIds)
      .ilike('role', '%strategist%');

    const strategistMap = new Map<string, { name: string; id: string }>();
    for (const a of assignments ?? []) {
      const tm = a.team_members as unknown as { full_name: string } | null;
      if (tm?.full_name) {
        strategistMap.set(a.client_id, { name: tm.full_name, id: a.team_member_id });
      }
    }

    // ── Check shoots this month ───────────────────────────────────────────────
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
    ).padStart(2, '0')}`;

    const { data: shootsThisMonth } = await adminClient
      .from('shoot_events')
      .select('client_id')
      .gte('shoot_date', monthStart)
      .lte('shoot_date', monthEnd)
      .neq('scheduled_status', 'cancelled');

    const clientsWithShoots = new Set((shootsThisMonth ?? []).map((s) => s.client_id));

    const needsShoot: ClientGap[] = clients
      .filter((c) => !clientsWithShoots.has(c.id))
      .map((c) => {
        const strategist = strategistMap.get(c.id);
        return {
          client_id: c.id,
          client_name: c.name,
          client_slug: c.slug,
          strategist_name: strategist?.name ?? null,
          strategist_id: strategist?.id ?? null,
        };
      });

    // ── Check biweekly meetings ───────────────────────────────────────────────
    // A client "needs a meeting" if:
    // - They have no future meeting scheduled (status = 'scheduled')
    // - OR their last meeting was more than 16 days ago with no future one

    const { data: futureMeetings } = await adminClient
      .from('meetings')
      .select('client_id')
      .gte('scheduled_at', now.toISOString())
      .eq('status', 'scheduled');

    const clientsWithFutureMeeting = new Set((futureMeetings ?? []).map((m) => m.client_id));

    // For clients without future meetings, check when their last meeting was
    const clientsWithoutFuture = clientIds.filter((id) => !clientsWithFutureMeeting.has(id));

    const needsMeeting: ClientGap[] = [];

    if (clientsWithoutFuture.length > 0) {
      // Get last meeting for each of these clients
      const { data: lastMeetings } = await adminClient
        .from('meetings')
        .select('client_id, scheduled_at')
        .in('client_id', clientsWithoutFuture)
        .eq('status', 'scheduled')
        .order('scheduled_at', { ascending: false });

      // Group by client — take the most recent
      const lastMeetingMap = new Map<string, string>();
      for (const m of lastMeetings ?? []) {
        if (!lastMeetingMap.has(m.client_id)) {
          lastMeetingMap.set(m.client_id, m.scheduled_at);
        }
      }

      const sixteenDaysAgo = new Date(now.getTime() - 16 * 24 * 60 * 60 * 1000);

      for (const clientId of clientsWithoutFuture) {
        const lastMeeting = lastMeetingMap.get(clientId);
        // Needs meeting if: no meetings ever, or last one was >16 days ago
        if (!lastMeeting || new Date(lastMeeting) < sixteenDaysAgo) {
          const client = clients.find((c) => c.id === clientId);
          if (client) {
            const strategist = strategistMap.get(clientId);
            needsMeeting.push({
              client_id: client.id,
              client_name: client.name,
              client_slug: client.slug,
              strategist_name: strategist?.name ?? null,
              strategist_id: strategist?.id ?? null,
            });
          }
        }
      }
    }

    return NextResponse.json({
      needs_shoot: needsShoot,
      needs_meeting: needsMeeting,
      day_of_month: now.getDate(),
      month_name: now.toLocaleString('en-US', { month: 'long' }),
    });
  } catch (error) {
    console.error('GET /api/calendar/gaps error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
