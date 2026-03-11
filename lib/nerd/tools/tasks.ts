import { z } from 'zod';
import { ToolDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';

const statusEnum = z.enum(['backlog', 'in_progress', 'review', 'done']);
const priorityEnum = z.enum(['low', 'medium', 'high', 'urgent']);
const taskTypeEnum = z.enum([
  'content',
  'shoot',
  'edit',
  'paid_media',
  'strategy',
  'other',
]);

export const taskTools: ToolDefinition[] = [
  // ── list_tasks ──────────────────────────────────────────────
  {
    name: 'list_tasks',
    description:
      'List tasks with optional filters by client, assignee, or status. Returns up to 20 tasks ordered by newest first.',
    parameters: z.object({
      client_id: z.string().uuid().optional(),
      assignee_id: z.string().uuid().optional(),
      status: statusEnum.optional(),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();

        let query = supabase
          .from('tasks')
          .select(
            '*, clients:client_id(id, name, slug), team_members:assignee_id(id, full_name, avatar_url)'
          )
          .is('archived_at', null)
          .order('created_at', { ascending: false })
          .limit(20);

        if (params.client_id) {
          query = query.eq('client_id', params.client_id as string);
        }
        if (params.assignee_id) {
          query = query.eq('assignee_id', params.assignee_id as string);
        }
        if (params.status) {
          query = query.eq('status', params.status as string);
        }

        const { data, error } = await query;

        if (error) {
          return { success: false, error: error.message };
        }

        const tasks = (data ?? []).map((t) => {
          const client = t.clients as { id: string; name: string; slug: string } | null;
          const assignee = t.team_members as {
            id: string;
            full_name: string;
            avatar_url: string | null;
          } | null;

          return {
            id: t.id,
            title: t.title,
            description: t.description,
            status: t.status,
            priority: t.priority,
            task_type: t.task_type,
            tags: t.tags ?? [],
            due_date: t.due_date,
            created_at: t.created_at,
            client_name: client?.name ?? null,
            client_id: t.client_id,
            assignee_name: assignee?.full_name ?? null,
            assignee_id: t.assignee_id,
          };
        });

        return {
          success: true,
          data: tasks,
          link: { href: '/admin/tasks', label: 'View tasks' },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to list tasks',
        };
      }
    },
  },

  // ── create_task ─────────────────────────────────────────────
  {
    name: 'create_task',
    description:
      'Create a new task. Defaults to backlog status, medium priority, and "other" type if not specified.',
    parameters: z.object({
      title: z.string(),
      description: z.string().optional(),
      priority: priorityEnum.optional(),
      client_id: z.string().uuid().optional(),
      assignee_id: z.string().uuid().optional(),
      due_date: z.string().optional(),
      task_type: taskTypeEnum.optional(),
      tags: z.array(z.string()).optional(),
    }),
    riskLevel: 'write',
    handler: async (params, userId) => {
      try {
        const supabase = createAdminClient();

        const { data, error } = await supabase
          .from('tasks')
          .insert({
            title: params.title as string,
            description: (params.description as string) ?? null,
            status: 'backlog',
            priority: (params.priority as string) ?? 'low',
            client_id: (params.client_id as string) ?? null,
            assignee_id: (params.assignee_id as string) ?? null,
            due_date: (params.due_date as string) ?? null,
            task_type: (params.task_type as string) ?? 'other',
            tags: (params.tags as string[]) ?? [],
            created_by: userId,
          })
          .select()
          .single();

        if (error) {
          return { success: false, error: error.message };
        }

        return {
          success: true,
          data,
          link: { href: '/admin/tasks', label: 'View tasks' },
          cardType: 'task' as const,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to create task',
        };
      }
    },
  },

  // ── update_task ─────────────────────────────────────────────
  {
    name: 'update_task',
    description:
      'Update an existing task. Only the provided fields will be changed.',
    parameters: z.object({
      task_id: z.string().uuid(),
      title: z.string().optional(),
      description: z.string().optional(),
      status: statusEnum.optional(),
      priority: priorityEnum.optional(),
      assignee_id: z.string().uuid().nullable().optional(),
      due_date: z.string().nullable().optional(),
      task_type: taskTypeEnum.optional(),
      tags: z.array(z.string()).optional(),
    }),
    riskLevel: 'write',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();
        const taskId = params.task_id as string;

        const updates: Record<string, unknown> = {};
        if (params.title !== undefined) updates.title = params.title;
        if (params.description !== undefined) updates.description = params.description;
        if (params.status !== undefined) updates.status = params.status;
        if (params.priority !== undefined) updates.priority = params.priority;
        if (params.assignee_id !== undefined) updates.assignee_id = params.assignee_id;
        if (params.due_date !== undefined) updates.due_date = params.due_date;
        if (params.task_type !== undefined) updates.task_type = params.task_type;
        if (params.tags !== undefined) updates.tags = params.tags;

        const { data, error } = await supabase
          .from('tasks')
          .update(updates)
          .eq('id', taskId)
          .select()
          .single();

        if (error) {
          return { success: false, error: error.message };
        }

        return {
          success: true,
          data,
          link: { href: '/admin/tasks', label: 'View tasks' },
          cardType: 'task' as const,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to update task',
        };
      }
    },
  },

  // ── assign_task ─────────────────────────────────────────────
  {
    name: 'assign_task',
    description:
      'Assign a task to a team member by setting the assignee.',
    parameters: z.object({
      task_id: z.string().uuid(),
      assignee_id: z.string().uuid(),
    }),
    riskLevel: 'write',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();
        const taskId = params.task_id as string;
        const assigneeId = params.assignee_id as string;

        // Look up team member name
        const { data: member, error: memberError } = await supabase
          .from('team_members')
          .select('id, full_name')
          .eq('id', assigneeId)
          .single();

        if (memberError) {
          return { success: false, error: `Team member not found: ${memberError.message}` };
        }

        const { data, error } = await supabase
          .from('tasks')
          .update({ assignee_id: assigneeId })
          .eq('id', taskId)
          .select()
          .single();

        if (error) {
          return { success: false, error: error.message };
        }

        return {
          success: true,
          data: {
            ...data,
            assignee_name: member.full_name,
          },
          link: { href: '/admin/tasks', label: 'View tasks' },
          cardType: 'task' as const,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to assign task',
        };
      }
    },
  },
];
