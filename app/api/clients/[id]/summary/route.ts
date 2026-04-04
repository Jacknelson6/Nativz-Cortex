import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertUserCanAccessClient } from '@/lib/api/client-access';

/**
 * GET /api/clients/[id]/summary
 *
 * Returns an aggregated summary of a client's current state:
 * - Basic info (name, industry, agency, services)
 * - Team assignments (who's working on this client)
 * - Pipeline status for the current month
 * - Upcoming shoots
 * - Recent task counts (open, overdue, done)
 * - Latest research searches
 * - Idea generation count
 *
 * Use when: You need a full picture of a client in one call — dashboards,
 * AI agent context building, or client profile pages.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    const access = await assertUserCanAccessClient(admin, user.id, id);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    // Fetch everything in parallel
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const todayStr = now.toISOString().split('T')[0];

    const [
      clientResult,
      teamResult,
      pipelineResult,
      shootsResult,
      tasksResult,
      searchesResult,
      ideasResult,
    ] = await Promise.all([
      // Client info
      admin
        .from('clients')
        .select('id, name, slug, industry, agency, services, is_active, logo_url, website_url, organization_id, created_at')
        .eq('id', id)
        .single(),
      // Team assignments
      admin
        .from('client_assignments')
        .select('role, is_lead, team_members(id, full_name, avatar_url, role)')
        .eq('client_id', id),
      // Current month pipeline
      admin
        .from('content_pipeline')
        .select('assignment_status, raws_status, editing_status, client_approval_status, boosting_status, shoot_date, editor, smm, videographer, strategist, editing_manager')
        .eq('client_id', id)
        .eq('month_date', currentMonth)
        .single(),
      // Upcoming shoots (next 30 days)
      admin
        .from('calendar_events')
        .select('id, title, start_time, location')
        .eq('client_id', id)
        .gte('start_time', todayStr)
        .order('start_time', { ascending: true })
        .limit(5),
      // Task counts
      admin
        .from('tasks')
        .select('status', { count: 'exact' })
        .eq('client_id', id)
        .is('archived_at', null),
      // Recent searches
      admin
        .from('topic_searches')
        .select('id, query, status, created_at')
        .eq('client_id', id)
        .order('created_at', { ascending: false })
        .limit(3),
      // Idea generation count
      admin
        .from('idea_generations')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', id)
        .eq('status', 'completed'),
    ]);

    if (clientResult.error || !clientResult.data) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Compute task stats
    const allTasks = tasksResult.data ?? [];
    const taskStats = {
      total: allTasks.length,
      open: allTasks.filter((t) => t.status !== 'done').length,
      done: allTasks.filter((t) => t.status === 'done').length,
    };

    return NextResponse.json({
      client: clientResult.data,
      team: (teamResult.data ?? []).map((a) => ({
        role: a.role,
        isLead: a.is_lead,
        member: a.team_members,
      })),
      pipeline: pipelineResult.data ?? null,
      upcomingShoots: shootsResult.data ?? [],
      taskStats,
      recentSearches: searchesResult.data ?? [],
      ideaGenerations: ideasResult.count ?? 0,
    });
  } catch (error) {
    console.error('GET /api/clients/[id]/summary error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
