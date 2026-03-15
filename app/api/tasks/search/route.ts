import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/tasks/search
 *
 * Full-text search across tasks by title and description. Supports filtering
 * by status, priority, assignee, client, task_type, and date range.
 *
 * Query params:
 *   q          - Search query (searches title and description, case-insensitive)
 *   status     - Filter by status (backlog, in_progress, review, done)
 *   priority   - Filter by priority (low, medium, high, urgent)
 *   assignee   - Filter by assignee team_member ID
 *   client     - Filter by client ID
 *   task_type  - Filter by type (content, shoot, edit, paid_media, strategy, other)
 *   due_before - Filter tasks due on or before this date (YYYY-MM-DD)
 *   due_after  - Filter tasks due on or after this date (YYYY-MM-DD)
 *   limit      - Max results (default 50, max 200)
 *
 * Use when: Finding tasks matching specific criteria, building filtered
 * views, or AI agents searching for relevant tasks.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const assignee = searchParams.get('assignee');
    const client = searchParams.get('client');
    const taskType = searchParams.get('task_type');
    const dueBefore = searchParams.get('due_before');
    const dueAfter = searchParams.get('due_after');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);

    let query = admin
      .from('tasks')
      .select('*, clients(id, name, slug), team_members(id, full_name, avatar_url)')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (q) {
      query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
    }
    if (status) query = query.eq('status', status);
    if (priority) query = query.eq('priority', priority);
    if (assignee) query = query.eq('assignee_id', assignee);
    if (client) query = query.eq('client_id', client);
    if (taskType) query = query.eq('task_type', taskType);
    if (dueBefore) query = query.lte('due_date', dueBefore);
    if (dueAfter) query = query.gte('due_date', dueAfter);

    const { data: tasks, error } = await query;

    if (error) {
      console.error('GET /api/tasks/search error:', error);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    return NextResponse.json({ tasks: tasks ?? [], count: (tasks ?? []).length });
  } catch (error) {
    console.error('GET /api/tasks/search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
