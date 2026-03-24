/**
 * Todoist ↔ Cortex task sync.
 *
 * Two-way sync:
 * - Push: When Cortex tasks change, push to Todoist
 * - Pull: Manual sync fetches all Todoist tasks and reconciles
 */

import { createAdminClient } from '@/lib/supabase/admin';
import {
  getTodoistTasks,
  createTodoistTask,
  updateTodoistTask,
  closeTodoistTask,
  reopenTodoistTask,
  deleteTodoistTask,
  cortexPriorityToTodoist,
  todoistPriorityToCortex,
  type TodoistTask,
} from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SyncResult {
  pulled: number;
  pushed: number;
  errors: string[];
}

interface CortexTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  todoist_task_id: string | null;
  recurrence: string | null;
  tags: string[];
  /** Present when loaded for Todoist-linked rows (including archived). */
  archived_at?: string | null;
}

// ---------------------------------------------------------------------------
// Push a single Cortex task to Todoist
// ---------------------------------------------------------------------------

export type PushTaskToTodoistResult = { id: string | null; error?: string };

export async function pushTaskToTodoist(
  apiKey: string,
  task: CortexTask,
  projectId?: string,
): Promise<PushTaskToTodoistResult> {
  try {
    // Build due string — prefer recurrence pattern, then date
    let dueString: string | undefined;
    let dueDate: string | undefined;
    if (task.recurrence) {
      dueString = task.recurrence;
    } else if (task.due_date) {
      dueDate = task.due_date;
    }

    if (task.todoist_task_id) {
      // Update existing
      await updateTodoistTask(apiKey, task.todoist_task_id, {
        content: task.title,
        description: task.description ?? '',
        priority: cortexPriorityToTodoist(task.priority),
        ...(dueString ? { due_string: dueString } : dueDate ? { due_date: dueDate } : {}),
        labels: task.tags.length > 0 ? task.tags : undefined,
      });

      // Handle completion state
      if (task.status === 'done') {
        await closeTodoistTask(apiKey, task.todoist_task_id);
      }

      return { id: task.todoist_task_id };
    } else {
      // Create new
      const created = await createTodoistTask(apiKey, {
        content: task.title,
        description: task.description ?? '',
        priority: cortexPriorityToTodoist(task.priority),
        ...(dueString ? { due_string: dueString } : dueDate ? { due_date: dueDate } : {}),
        ...(projectId ? { project_id: projectId } : {}),
        labels: task.tags.length > 0 ? task.tags : undefined,
      });

      if (task.status === 'done') {
        await closeTodoistTask(apiKey, created.id);
      }

      return { id: created.id };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('pushTaskToTodoist error:', error);
    return { id: null, error: message };
  }
}

// ---------------------------------------------------------------------------
// Full sync: pull from Todoist and reconcile with Cortex
// ---------------------------------------------------------------------------

export async function syncTodoist(
  userId: string,
  apiKey: string,
  projectId?: string,
): Promise<SyncResult> {
  const admin = createAdminClient();
  const result: SyncResult = { pulled: 0, pushed: 0, errors: [] };

  try {
    // 0. Look up the user's team member ID (assignee for imported tasks)
    const { data: teamMember } = await admin
      .from('team_members')
      .select('id')
      .eq('user_id', userId)
      .single();
    const assigneeId = teamMember?.id ?? null;

    // 1. Fetch all Todoist tasks
    const todoistTasks = await getTodoistTasks(apiKey, projectId);

    // 2. Linked tasks: any row with todoist_task_id (including archived). Excluding archived
    // here caused duplicate-key inserts — the unique index still applies to archived rows.
    const { data: linkedTasks } = await admin
      .from('tasks')
      .select(
        'id, title, description, status, priority, due_date, todoist_task_id, recurrence, tags, archived_at',
      )
      .eq('created_by', userId)
      .not('todoist_task_id', 'is', null);

    // Non-archived tasks without Todoist id — candidates to push to Todoist
    const { data: openTasks } = await admin
      .from('tasks')
      .select('id, title, description, status, priority, due_date, todoist_task_id, recurrence, tags')
      .eq('created_by', userId)
      .is('archived_at', null);

    const cortexByTodoistId = new Map<string, CortexTask>();
    for (const t of linkedTasks ?? []) {
      if (t.todoist_task_id) {
        cortexByTodoistId.set(t.todoist_task_id, t as CortexTask);
      }
    }

    const cortexWithoutTodoist: CortexTask[] = [];
    for (const t of openTasks ?? []) {
      if (!t.todoist_task_id) {
        cortexWithoutTodoist.push(t as CortexTask);
      }
    }

    const todoistById = new Map<string, TodoistTask>();
    for (const t of todoistTasks) {
      todoistById.set(t.id, t);
    }

    // 3. Pull: Import Todoist tasks not yet in Cortex
    for (const tt of todoistTasks) {
      if (cortexByTodoistId.has(tt.id)) {
        // Already linked — update Cortex from Todoist
        const cortex = cortexByTodoistId.get(tt.id)!;
        const updates: Record<string, unknown> = {};

        if (tt.content !== cortex.title) updates.title = tt.content;
        if ((tt.description || '') !== (cortex.description || '')) updates.description = tt.description || null;

        const todoistPriority = todoistPriorityToCortex(tt.priority);
        if (todoistPriority !== cortex.priority) updates.priority = todoistPriority;

        const todoistDate = tt.due?.date ?? null;
        if (todoistDate !== cortex.due_date) updates.due_date = todoistDate;

        const todoistDone = tt.checked;
        const cortexDone = cortex.status === 'done';
        if (todoistDone && !cortexDone) updates.status = 'done';
        if (!todoistDone && cortexDone) updates.status = 'backlog';

        if (cortex.archived_at) {
          updates.archived_at = null;
        }

        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date().toISOString();
          await admin.from('tasks').update(updates).eq('id', cortex.id);
          result.pulled++;
        }
        continue;
      }

      // New from Todoist — create in Cortex (assigned to creator)
      // Use insert (not upsert) — the partial unique index on todoist_task_id
      // is incompatible with PostgREST's ON CONFLICT clause
      const { error } = await admin.from('tasks').insert({
        title: tt.content,
        description: tt.description || null,
        status: tt.checked ? 'done' : 'backlog',
        priority: todoistPriorityToCortex(tt.priority),
        due_date: tt.due?.date ?? null,
        recurrence: tt.due?.is_recurring ? tt.due.string : null,
        tags: tt.labels ?? [],
        todoist_task_id: tt.id,
        created_by: userId,
        assignee_id: assigneeId,
        task_type: 'other',
      });

      if (error) {
        result.errors.push(`Import ${tt.content}: ${error.message}`);
      } else {
        result.pulled++;
      }
    }

    // 4. Push: Export Cortex tasks without todoist_task_id
    for (const ct of cortexWithoutTodoist) {
      const { id: todoistId, error: pushError } = await pushTaskToTodoist(apiKey, ct, projectId);
      if (todoistId) {
        await admin.from('tasks').update({ todoist_task_id: todoistId }).eq('id', ct.id);
        result.pushed++;
      } else {
        result.errors.push(
          pushError ? `Push "${ct.title}": ${pushError}` : `Push "${ct.title}": failed`,
        );
      }
    }

    // 5. Handle deletions: Cortex tasks with todoist_task_id that no longer exist in Todoist
    for (const [todoistId, cortex] of cortexByTodoistId) {
      if (!todoistById.has(todoistId)) {
        // Todoist task was deleted — archive in Cortex
        const { error: archiveError } = await admin
          .from('tasks')
          .update({ archived_at: new Date().toISOString() })
          .eq('id', cortex.id);
        if (archiveError) {
          result.errors.push(`Archive ${cortex.title}: ${archiveError.message}`);
        }
      }
    }

    // Update last sync timestamp
    await admin
      .from('users')
      .update({ todoist_synced_at: new Date().toISOString() })
      .eq('id', userId);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(message);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Handle task deletion in Cortex — also delete in Todoist
// ---------------------------------------------------------------------------

export async function deleteFromTodoist(
  apiKey: string,
  todoistTaskId: string,
): Promise<void> {
  try {
    await deleteTodoistTask(apiKey, todoistTaskId);
  } catch (error) {
    console.error('deleteFromTodoist error:', error);
  }
}

// ---------------------------------------------------------------------------
// Handle task completion toggle — close/reopen in Todoist
// ---------------------------------------------------------------------------

export async function toggleTodoistCompletion(
  apiKey: string,
  todoistTaskId: string,
  done: boolean,
): Promise<void> {
  try {
    if (done) {
      await closeTodoistTask(apiKey, todoistTaskId);
    } else {
      await reopenTodoistTask(apiKey, todoistTaskId);
    }
  } catch (error) {
    console.error('toggleTodoistCompletion error:', error);
  }
}
