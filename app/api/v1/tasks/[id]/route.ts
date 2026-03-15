import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateApiKey } from '@/lib/api-keys/validate';
import { createAdminClient } from '@/lib/supabase/admin';

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['backlog', 'in_progress', 'review', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  client_id: z.string().uuid().nullable().optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  due_date: z.string().nullable().optional(),
  task_type: z.enum(['content', 'shoot', 'edit', 'paid_media', 'strategy', 'other']).optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * GET /api/v1/tasks/[id]
 *
 * Fetch a single non-archived task by UUID with client and assignee join data.
 *
 * @auth API key (Bearer token via Authorization header)
 * @param id - Task UUID
 * @returns {{ task: Task }}
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: task, error } = await admin
    .from('tasks')
    .select('*, clients(id, name, slug), team_members(id, full_name, avatar_url)')
    .eq('id', id)
    .is('archived_at', null)
    .single();

  if (error || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  return NextResponse.json({ task });
}

/**
 * PATCH /api/v1/tasks/[id]
 *
 * Update a task's fields. Applies only the provided fields. Only non-archived
 * tasks can be updated.
 *
 * @auth API key (Bearer token via Authorization header)
 * @param id - Task UUID
 * @body title - Task title (optional)
 * @body description - Task description (optional, nullable)
 * @body status - 'backlog' | 'in_progress' | 'review' | 'done' (optional)
 * @body priority - 'low' | 'medium' | 'high' | 'urgent' (optional)
 * @body client_id - Client UUID (optional, nullable)
 * @body assignee_id - Team member UUID (optional, nullable)
 * @body due_date - ISO date string (optional, nullable)
 * @body task_type - Task type enum (optional)
 * @body tags - Array of tag strings (optional)
 * @returns {{ task: Task }}
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: task, error } = await admin
    .from('tasks')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('archived_at', null)
    .select('*, clients(id, name, slug), team_members(id, full_name, avatar_url)')
    .single();

  if (error || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  return NextResponse.json({ task });
}

/**
 * DELETE /api/v1/tasks/[id]
 *
 * Soft-delete a task by setting archived_at. Returns 404 if already archived.
 *
 * @auth API key (Bearer token via Authorization header)
 * @param id - Task UUID
 * @returns {{ success: true }}
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('tasks')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .is('archived_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Failed to archive task' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
