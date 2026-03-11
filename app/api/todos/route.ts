import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const createTodoSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  due_date: z.string().optional(),
  client_id: z.string().uuid().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  user_id: z.string().uuid().optional(), // admin-only: assign to another user
});

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const completed = searchParams.get('completed');
    const dueToday = searchParams.get('due_today');

    let query = supabase
      .from('todos')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (completed === 'true') {
      query = query.eq('is_completed', true);
    } else if (completed === 'false') {
      query = query.eq('is_completed', false);
    }

    if (dueToday === 'true') {
      const today = new Date().toISOString().split('T')[0];
      query = query.eq('due_date', today);
    }

    const { data: todos, error } = await query;

    if (error) {
      console.error('Error fetching todos:', error);
      return NextResponse.json({ error: 'Failed to fetch todos' }, { status: 500 });
    }

    return NextResponse.json(todos);
  } catch (error) {
    console.error('GET /api/todos error:', error);
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

    const body = await request.json();
    const parsed = createTodoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const data = parsed.data;
    let targetUserId = user.id;
    let assignedBy: string | null = null;

    // If assigning to another user, verify caller is admin
    if (data.user_id && data.user_id !== user.id) {
      const adminClient = createAdminClient();
      const { data: userData } = await adminClient
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!userData || userData.role !== 'admin') {
        return NextResponse.json({ error: 'Only admins can assign todos to other users' }, { status: 403 });
      }

      targetUserId = data.user_id;
      assignedBy = user.id;
    }

    const adminClient = createAdminClient();
    const { data: todo, error } = await adminClient
      .from('todos')
      .insert({
        user_id: targetUserId,
        title: data.title,
        description: data.description ?? null,
        due_date: data.due_date ?? null,
        client_id: data.client_id ?? null,
        priority: data.priority ?? null,
        assigned_by: assignedBy,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating todo:', error);
      return NextResponse.json({ error: 'Failed to create todo' }, { status: 500 });
    }

    return NextResponse.json(todo, { status: 201 });
  } catch (error) {
    console.error('POST /api/todos error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
