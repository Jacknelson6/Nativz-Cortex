import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const updateTodoSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  is_completed: z.boolean().optional(),
  due_date: z.string().nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).nullable().optional(),
});

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

    const body = await request.json();
    const parsed = updateTodoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = { ...parsed.data };

    // Auto-set completed_at when marking complete/incomplete
    if (parsed.data.is_completed === true) {
      updates.completed_at = new Date().toISOString();
    } else if (parsed.data.is_completed === false) {
      updates.completed_at = null;
    }

    // RLS ensures user can only update their own todos
    const { data: todo, error } = await supabase
      .from('todos')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating todo:', error);
      return NextResponse.json({ error: 'Failed to update todo' }, { status: 500 });
    }

    if (!todo) {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    }

    return NextResponse.json(todo);
  } catch (error) {
    console.error('PATCH /api/todos/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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

    // RLS ensures user can only delete their own todos
    const { error } = await supabase
      .from('todos')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting todo:', error);
      return NextResponse.json({ error: 'Failed to delete todo' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/todos/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
