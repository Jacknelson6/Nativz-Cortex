import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/clients/assignments/strategists
 *
 * Returns a flat list of { client_id, strategist_name, strategist_id }
 * for all clients that have a team member assigned with role containing "Strategist".
 * Used by the calendar to show strategist names on events.
 */
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

    const { data: assignments, error } = await adminClient
      .from('client_assignments')
      .select('client_id, team_member_id, role, team_members(full_name)')
      .ilike('role', '%strategist%');

    if (error) {
      console.error('GET /api/clients/assignments/strategists error:', error);
      return NextResponse.json({ error: 'Failed to fetch strategists' }, { status: 500 });
    }

    const result = (assignments ?? []).map((a) => {
      const tm = a.team_members as unknown as { full_name: string } | null;
      return {
        client_id: a.client_id,
        strategist_id: a.team_member_id,
        strategist_name: tm?.full_name ?? 'Unknown',
      };
    });

    return NextResponse.json({ assignments: result });
  } catch (error) {
    console.error('GET /api/clients/assignments/strategists error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
