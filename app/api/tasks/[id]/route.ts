import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordTaskActivity } from '@/lib/task-activity';
import { createNotification } from '@/lib/notifications';
import { getNextRecurrenceDate } from '@/components/tasks/natural-date';
import { pushTaskToTodoist, deleteFromTodoist, toggleTodoistCompletion } from '@/lib/todoist/sync';

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
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
});

async function verifyAdmin(userId: string) {
  const adminClient = createAdminClient();
  const { data } = await adminClient
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();
  return data?.role === 'admin';
}

/**
 * GET /api/tasks/[id]
 *
 * Fetch a single non-archived task by ID, including associated client and assignee details.
 *
 * @auth Required (admin)
 * @param id - Task UUID
 * @returns {Task} Task with client and team_member relations
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await verifyAdmin(user.id))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const { data: task, error } = await adminClient
      .from('tasks')
      .select('*, clients(id, name, slug), team_members(id, full_name, avatar_url)')
      .eq('id', id)
      .is('archived_at', null)
      .single();

    if (error || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error('GET /api/tasks/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/tasks/[id]
 *
 * Update a task. Non-owners can only update tasks they created or are assigned to.
 * Completing a recurring task advances the due date instead of marking it done.
 * Field changes are recorded in task activity, new assignees are notified,
 * and changes are synced to Todoist for connected users.
 *
 * @auth Required (admin)
 * @param id - Task UUID
 * @body title - Updated title
 * @body description - Updated description
 * @body status - New status (backlog | in_progress | review | done)
 * @body priority - New priority (low | medium | high | urgent)
 * @body client_id - Updated client UUID
 * @body assignee_id - Updated assignee team member UUID
 * @body due_date - Updated due date (YYYY-MM-DD)
 * @body task_type - Updated type (content | shoot | edit | paid_media | strategy | other)
 * @body shoot_date - Updated shoot date (YYYY-MM-DD)
 * @body tags - Updated array of tags
 * @body monday_item_id - Updated Monday.com item ID
 * @body monday_board_id - Updated Monday.com board ID
 * @returns {Task} Updated task with client and team_member relations
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await verifyAdmin(user.id))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const adminClient = createAdminClient();

    // Check ownership for access control
    const { data: userData } = await adminClient
      .from('users')
      .select('is_owner')
      .eq('id', user.id)
      .single();

    // Fetch current task state before updating
    let oldTaskQuery = adminClient
      .from('tasks')
      .select('*')
      .eq('id', id)
      .is('archived_at', null);

    // Non-owners can only update tasks they created or are assigned to
    if (!userData?.is_owner) {
      const { data: teamMember } = await adminClient
        .from('team_members')
        .select('id')
        .eq('user_id', user.id)
        .single();

      const teamMemberId = teamMember?.id;
      if (teamMemberId) {
        oldTaskQuery = oldTaskQuery.or(`assignee_id.eq.${teamMemberId},created_by.eq.${user.id}`);
      } else {
        oldTaskQuery = oldTaskQuery.eq('created_by', user.id);
      }
    }

    const { data: oldTask } = await oldTaskQuery.single();

    if (!oldTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Handle recurring task completion: instead of marking done, advance due date
    const isCompletingRecurring =
      parsed.data.status === 'done' &&
      oldTask.status !== 'done' &&
      oldTask.recurrence;

    let updatePayload: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };

    if (isCompletingRecurring) {
      const baseDateStr = oldTask.recurrence_from_completion
        ? new Date().toISOString().slice(0, 10) // today
        : oldTask.due_date ?? new Date().toISOString().slice(0, 10);
      const nextDate = getNextRecurrenceDate(oldTask.recurrence, baseDateStr);
      if (nextDate) {
        // Reset to backlog with the next due date instead of completing
        updatePayload = {
          ...updatePayload,
          status: 'backlog',
          due_date: nextDate,
        };
      }
    }

    const { data: task, error } = await adminClient
      .from('tasks')
      .update(updatePayload)
      .eq('id', id)
      .is('archived_at', null)
      .select('*, clients(id, name, slug), team_members(id, full_name, avatar_url)')
      .single();

    if (error) {
      console.error('PATCH /api/tasks/[id] error:', error);
      return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
    }

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Record activity for each changed field
    const trackedFields = [
      'status', 'priority', 'assignee_id', 'client_id',
      'due_date', 'title', 'description', 'task_type',
    ] as const;

    const actionMap: Record<string, string> = {
      status: 'status_changed',
      priority: 'priority_changed',
      assignee_id: 'assignee_changed',
      client_id: 'client_changed',
      due_date: 'due_date_changed',
      title: 'title_changed',
      description: 'description_changed',
      task_type: 'task_type_changed',
    };

    for (const field of trackedFields) {
      if (parsed.data[field] !== undefined && oldTask[field] !== parsed.data[field]) {
        await recordTaskActivity({
          taskId: id,
          userId: user.id,
          action: actionMap[field],
          details: { from: oldTask[field] ?? null, to: parsed.data[field] ?? null },
        });
      }
    }

    // Notify new assignee when assignment changes
    if (
      parsed.data.assignee_id !== undefined &&
      parsed.data.assignee_id !== null &&
      parsed.data.assignee_id !== oldTask.assignee_id
    ) {
      await createNotification({
        userId: parsed.data.assignee_id,
        type: 'task_assigned',
        title: `You were assigned to "${task.title}"`,
        taskId: id,
      });
    }

    // Sync to Todoist in background (non-blocking)
    const todoistTaskId = task.todoist_task_id ?? oldTask.todoist_task_id;
    const { data: todoistUser } = await adminClient
      .from('users')
      .select('todoist_api_key, todoist_project_id')
      .eq('id', user.id)
      .single();

    if (todoistUser?.todoist_api_key) {
      try {
        if (todoistTaskId) {
          // Status change: close/reopen in Todoist
          if (parsed.data.status && !isCompletingRecurring) {
            const isDone = task.status === 'done';
            const wasDone = oldTask.status === 'done';
            if (isDone !== wasDone) {
              await toggleTodoistCompletion(todoistUser.todoist_api_key, todoistTaskId, isDone);
            }
          }

          // Push field changes (title, description, priority, due_date, recurrence)
          const hasFieldChanges = ['title', 'description', 'priority', 'due_date'].some(
            (f) => parsed.data[f as keyof typeof parsed.data] !== undefined,
          );
          if (hasFieldChanges || isCompletingRecurring) {
            await pushTaskToTodoist(todoistUser.todoist_api_key, {
              id: task.id,
              title: task.title,
              description: task.description,
              status: task.status,
              priority: task.priority,
              due_date: task.due_date,
              todoist_task_id: todoistTaskId,
              recurrence: task.recurrence ?? null,
              tags: task.tags ?? [],
            });
          }
        } else {
          // Task not yet pushed to Todoist — push it now
          const newTodoistId = await pushTaskToTodoist(
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
          if (newTodoistId) {
            await adminClient.from('tasks').update({ todoist_task_id: newTodoistId }).eq('id', task.id);
          }
        }
      } catch (todoistErr) {
        console.error('Todoist sync error (non-blocking):', todoistErr);
      }
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error('PATCH /api/tasks/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/tasks/[id]
 *
 * Soft-delete (archive) a task by setting archived_at. Non-owners can only delete tasks
 * they created. If the task has a linked Todoist task, it is also deleted from Todoist.
 *
 * @auth Required (admin)
 * @param id - Task UUID
 * @returns {{ success: true }}
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await verifyAdmin(user.id))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const adminClient = createAdminClient();

    // Non-owners can only delete tasks they created
    const { data: userData } = await adminClient
      .from('users')
      .select('is_owner')
      .eq('id', user.id)
      .single();

    let deleteQuery = adminClient
      .from('tasks')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id)
      .is('archived_at', null);

    if (!userData?.is_owner) {
      deleteQuery = deleteQuery.eq('created_by', user.id);
    }

    const { data, error } = await deleteQuery.select('id, todoist_task_id').maybeSingle();

    if (error) {
      console.error('DELETE /api/tasks/[id] error:', error);
      return NextResponse.json({ error: 'Failed to archive task' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Task not found or not authorized to delete' }, { status: 403 });
    }

    // Delete from Todoist
    if (data.todoist_task_id) {
      const { data: todoistUser } = await adminClient
        .from('users')
        .select('todoist_api_key')
        .eq('id', user.id)
        .single();

      if (todoistUser?.todoist_api_key) {
        try {
          await deleteFromTodoist(todoistUser.todoist_api_key, data.todoist_task_id);
        } catch (todoistErr) {
          console.error('Todoist delete error (non-blocking):', todoistErr);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/tasks/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
