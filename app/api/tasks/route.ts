import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { pushTaskToTodoist } from '@/lib/todoist/sync';

const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().nullable().optional(),
  status: z.enum(['backlog', 'in_progress', 'review', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  client_id: z.string().uuid().nullable().optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  due_date: z.string().nullable().optional(),
  task_type: z.enum(['content', 'shoot', 'edit', 'paid_media', 'strategy', 'other']).optional(),
  shoot_date: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  monday_item_id: z.string().nullable().optional(),
  monday_board_id: z.string().nullable().optional(),
  recurrence: z.string().nullable().optional(),
  recurrence_from_completion: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role, is_owner')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id');
    const assigneeId = searchParams.get('assignee_id');
    const status = searchParams.get('status');
    const taskType = searchParams.get('task_type');
    const dueDateFrom = searchParams.get('due_date_from');
    const dueDateTo = searchParams.get('due_date_to');

    // Look up current user's team member record
    const { data: myTeamMember } = await adminClient
      .from('team_members')
      .select('id')
      .eq('user_id', user.id)
      .single();
    const myTeamMemberId = myTeamMember?.id ?? null;

    let query = adminClient
      .from('tasks')
      .select('*, clients(id, name, slug), team_members(id, full_name, avatar_url)')
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    // Non-owners only see tasks assigned to them or created by them
    if (!userData.is_owner) {
      if (myTeamMemberId) {
        query = query.or(`assignee_id.eq.${myTeamMemberId},created_by.eq.${user.id}`);
      } else {
        query = query.eq('created_by', user.id);
      }
    }

    if (clientId) query = query.eq('client_id', clientId);
    if (assigneeId) query = query.eq('assignee_id', assigneeId);
    if (status) query = query.eq('status', status);
    if (taskType) query = query.eq('task_type', taskType);
    if (dueDateFrom) query = query.gte('due_date', dueDateFrom);
    if (dueDateTo) query = query.lte('due_date', dueDateTo);

    const { data: tasks, error } = await query;

    if (error) {
      console.error('GET /api/tasks error:', error);
      return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
    }

    // Check if user has Todoist connected (so frontend can skip sync call)
    const { data: todoistData } = await adminClient
      .from('users')
      .select('todoist_api_key')
      .eq('id', user.id)
      .single();

    return NextResponse.json({
      tasks,
      is_owner: !!userData.is_owner,
      my_team_member_id: myTeamMemberId,
      todoist_connected: !!todoistData?.todoist_api_key,
    });
  } catch (error) {
    console.error('GET /api/tasks error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // Auto-assign to creator if no assignee specified
    let assigneeId = data.assignee_id ?? null;
    if (!assigneeId) {
      const { data: teamMember } = await adminClient
        .from('team_members')
        .select('id')
        .eq('user_id', user.id)
        .single();
      assigneeId = teamMember?.id ?? null;
    }

    const { data: task, error } = await adminClient
      .from('tasks')
      .insert({
        title: data.title,
        description: data.description ?? null,
        status: data.status ?? 'backlog',
        priority: data.priority ?? 'low',
        client_id: data.client_id ?? null,
        assignee_id: assigneeId,
        created_by: user.id,
        due_date: data.due_date ?? null,
        task_type: data.task_type ?? 'other',
        shoot_date: data.shoot_date ?? null,
        tags: data.tags ?? [],
        monday_item_id: data.monday_item_id ?? null,
        monday_board_id: data.monday_board_id ?? null,
        recurrence: data.recurrence ?? null,
        recurrence_from_completion: data.recurrence_from_completion ?? false,
      })
      .select('*, clients(id, name, slug), team_members(id, full_name, avatar_url)')
      .single();

    if (error) {
      console.error('POST /api/tasks error:', error);
      return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
    }

    // Push to Todoist for all connected users involved (creator + assignee)
    if (task) {
      // Find user IDs to push to: creator always, plus assignee if different
      const userIdsToPush = new Set<string>([user.id]);

      if (assigneeId && assigneeId !== user.id) {
        // Look up the assignee's auth user ID from team_members
        const { data: assigneeMember } = await adminClient
          .from('team_members')
          .select('user_id')
          .eq('id', assigneeId)
          .single();
        if (assigneeMember?.user_id) {
          userIdsToPush.add(assigneeMember.user_id);
        }
      }

      // Push to each connected user's Todoist
      for (const uid of userIdsToPush) {
        const { data: todoistUser } = await adminClient
          .from('users')
          .select('todoist_api_key, todoist_project_id')
          .eq('id', uid)
          .single();

        if (todoistUser?.todoist_api_key) {
          try {
            const todoistId = await pushTaskToTodoist(
              todoistUser.todoist_api_key,
              {
                id: task.id,
                title: task.title,
                description: task.description,
                status: task.status,
                priority: task.priority,
                due_date: task.due_date,
                todoist_task_id: null,
                recurrence: task.recurrence ?? null,
                tags: task.tags ?? [],
              },
              todoistUser.todoist_project_id ?? undefined,
            );
            if (todoistId && uid === user.id) {
              await adminClient.from('tasks').update({ todoist_task_id: todoistId }).eq('id', task.id);
            }
          } catch (todoistErr) {
            console.error('Todoist push error (non-blocking):', todoistErr);
          }
        }
      }
    }

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error('POST /api/tasks error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
