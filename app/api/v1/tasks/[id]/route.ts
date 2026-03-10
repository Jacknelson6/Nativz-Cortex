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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const body = await request.json();
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
