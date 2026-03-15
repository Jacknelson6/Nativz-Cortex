import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/dashboard/overview
 *
 * Returns a comprehensive dashboard overview in a single call:
 * - Active client count
 * - Pipeline status distribution for current month
 * - Task summary (open, overdue, completed today)
 * - Upcoming shoots (next 7 days)
 * - Recent notifications (last 5 unread)
 * - Recent research searches (last 5)
 *
 * Use when: Building dashboard views, AI agent status checks,
 * or getting a quick pulse on agency operations.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const todayStr = now.toISOString().split('T')[0];
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const [
      clientsResult,
      pipelineResult,
      tasksResult,
      overdueResult,
      completedTodayResult,
      shootsResult,
      notificationsResult,
      searchesResult,
    ] = await Promise.all([
      // Active clients
      admin.from('clients').select('id', { count: 'exact', head: true }).eq('is_active', true),
      // Pipeline status distribution
      admin.from('content_pipeline').select('editing_status').eq('month_date', currentMonth),
      // Open tasks
      admin.from('tasks').select('id', { count: 'exact', head: true }).is('archived_at', null).neq('status', 'done'),
      // Overdue tasks
      admin.from('tasks').select('id', { count: 'exact', head: true }).is('archived_at', null).neq('status', 'done').lt('due_date', todayStr).not('due_date', 'is', null),
      // Completed today
      admin.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'done').gte('updated_at', `${todayStr}T00:00:00`),
      // Upcoming shoots
      admin.from('calendar_events').select('id, title, start_time, client_id, clients(name)').gte('start_time', todayStr).lte('start_time', weekFromNow).order('start_time', { ascending: true }).limit(5),
      // Unread notifications
      admin.from('notifications').select('id, title, type, created_at').eq('recipient_user_id', user.id).eq('is_read', false).order('created_at', { ascending: false }).limit(5),
      // Recent searches
      admin.from('topic_searches').select('id, query, status, created_at').order('created_at', { ascending: false }).limit(5),
    ]);

    // Compute pipeline distribution
    const pipelineItems = pipelineResult.data ?? [];
    const pipelineDistribution: Record<string, number> = {};
    for (const item of pipelineItems) {
      const status = item.editing_status ?? 'not_started';
      pipelineDistribution[status] = (pipelineDistribution[status] ?? 0) + 1;
    }

    return NextResponse.json({
      clients: { active: clientsResult.count ?? 0 },
      pipeline: {
        total: pipelineItems.length,
        distribution: pipelineDistribution,
      },
      tasks: {
        open: tasksResult.count ?? 0,
        overdue: overdueResult.count ?? 0,
        completedToday: completedTodayResult.count ?? 0,
      },
      upcomingShoots: shootsResult.data ?? [],
      unreadNotifications: notificationsResult.data ?? [],
      recentSearches: searchesResult.data ?? [],
    });
  } catch (error) {
    console.error('GET /api/dashboard/overview error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
