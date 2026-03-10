import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateApiKey } from '@/lib/api-keys/validate';
import { createAdminClient } from '@/lib/supabase/admin';

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.enum(['backlog', 'in_progress', 'review', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  client_id: z.string().uuid().nullable().optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  due_date: z.string().nullable().optional(),
  task_type: z.enum(['content', 'shoot', 'edit', 'paid_media', 'strategy', 'other']).optional(),
  tags: z.array(z.string()).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);

  let query = admin
    .from('tasks')
    .select('*, clients(id, name, slug), team_members(id, full_name, avatar_url)')
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  const clientId = searchParams.get('client_id');
  const assigneeId = searchParams.get('assignee_id');
  const status = searchParams.get('status');
  const dueDateFrom = searchParams.get('due_date_from');
  const dueDateTo = searchParams.get('due_date_to');

  if (clientId) query = query.eq('client_id', clientId);
  if (assigneeId) query = query.eq('assignee_id', assigneeId);
  if (status) query = query.eq('status', status);
  if (dueDateFrom) query = query.gte('due_date', dueDateFrom);
  if (dueDateTo) query = query.lte('due_date', dueDateTo);

  const { data: tasks, error } = await query;
  if (error) {
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }

  return NextResponse.json({ tasks: tasks ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  const body = await request.json();
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const admin = createAdminClient();
  const data = parsed.data;

  // Auto-assign to API key owner's team member if no assignee
  let assigneeId = data.assignee_id ?? null;
  if (!assigneeId) {
    const { data: teamMember } = await admin
      .from('team_members')
      .select('id')
      .eq('user_id', auth.ctx.userId)
      .single();
    assigneeId = teamMember?.id ?? null;
  }

  const { data: task, error } = await admin
    .from('tasks')
    .insert({
      title: data.title,
      description: data.description ?? null,
      status: data.status ?? 'backlog',
      priority: data.priority ?? 'medium',
      client_id: data.client_id ?? null,
      assignee_id: assigneeId,
      created_by: auth.ctx.userId,
      due_date: data.due_date ?? null,
      task_type: data.task_type ?? 'other',
      tags: data.tags ?? [],
    })
    .select('*, clients(id, name, slug), team_members(id, full_name, avatar_url)')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }

  return NextResponse.json({ task }, { status: 201 });
}
