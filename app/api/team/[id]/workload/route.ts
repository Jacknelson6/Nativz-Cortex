import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/team/[id]/workload
 *
 * Returns a team member's current workload:
 * - Their client assignments (with roles)
 * - Open task count (total + overdue)
 * - Pipeline items they're assigned to this month (by role)
 * - Upcoming shoots they're involved in
 *
 * Use when: Checking capacity before assigning new work, building
 * team dashboards, or balancing workload across the team.
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

    // Get team member info
    const { data: member, error: memberError } = await admin
      .from('team_members')
      .select('id, full_name, role, avatar_url, is_active, user_id')
      .eq('id', id)
      .single();

    if (memberError || !member) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const todayStr = now.toISOString().split('T')[0];

    const [assignmentsResult, tasksResult, pipelineResult] = await Promise.all([
      // Client assignments
      admin
        .from('client_assignments')
        .select('role, is_lead, clients(id, name, slug, agency)')
        .eq('team_member_id', id),
      // Open tasks assigned to this member
      admin
        .from('tasks')
        .select('id, title, status, priority, due_date, clients(id, name)')
        .eq('assignee_id', id)
        .is('archived_at', null)
        .neq('status', 'done')
        .order('due_date', { ascending: true, nullsFirst: false }),
      // Pipeline items where this member is assigned (current month)
      admin
        .from('content_pipeline')
        .select('id, client_name, editing_status, assignment_status, raws_status, client_approval_status, boosting_status, shoot_date, editor, smm, videographer, strategist, editing_manager')
        .eq('month_date', currentMonth)
        .or(`editor.eq.${member.full_name},smm.eq.${member.full_name},videographer.eq.${member.full_name},strategist.eq.${member.full_name},editing_manager.eq.${member.full_name}`),
    ]);

    const tasks = tasksResult.data ?? [];
    const overdueTasks = tasks.filter((t) => t.due_date && t.due_date < todayStr);

    return NextResponse.json({
      member,
      assignments: (assignmentsResult.data ?? []).map((a) => ({
        role: a.role,
        isLead: a.is_lead,
        client: a.clients,
      })),
      tasks: {
        open: tasks.length,
        overdue: overdueTasks.length,
        items: tasks.slice(0, 10),
      },
      pipeline: {
        count: (pipelineResult.data ?? []).length,
        items: pipelineResult.data ?? [],
      },
    });
  } catch (error) {
    console.error('GET /api/team/[id]/workload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
