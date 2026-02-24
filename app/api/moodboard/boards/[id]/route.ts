import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const updateBoardSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  archived: z.boolean().optional(),
});

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

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Fetch board with client name
    const { data: board, error: boardError } = await adminClient
      .from('moodboard_boards')
      .select('*, clients(name)')
      .eq('id', id)
      .single();

    if (boardError || !board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    // Fetch items and notes in parallel
    const [itemsResult, notesResult] = await Promise.all([
      adminClient
        .from('moodboard_items')
        .select('*')
        .eq('board_id', id)
        .order('created_at', { ascending: true }),
      adminClient
        .from('moodboard_notes')
        .select('*')
        .eq('board_id', id)
        .order('created_at', { ascending: true }),
    ]);

    if (itemsResult.error) {
      console.error('Error fetching items:', itemsResult.error);
    }

    if (notesResult.error) {
      console.error('Error fetching notes:', notesResult.error);
    }

    return NextResponse.json({
      ...board,
      client_name: (board.clients as { name: string } | null)?.name ?? null,
      clients: undefined,
      items: itemsResult.data || [],
      notes: notesResult.data || [],
    });
  } catch (error) {
    console.error('GET /api/moodboard/boards/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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
    const parsed = updateBoardSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.name !== undefined) {
      updates.name = parsed.data.name;
    }
    if (parsed.data.description !== undefined) {
      updates.description = parsed.data.description;
    }
    if (parsed.data.client_id !== undefined) {
      updates.client_id = parsed.data.client_id;
    }
    if (parsed.data.archived !== undefined) {
      updates.archived_at = parsed.data.archived ? new Date().toISOString() : null;
    }

    const { data: board, error: updateError } = await adminClient
      .from('moodboard_boards')
      .update(updates)
      .eq('id', id)
      .select('*, clients(name)')
      .single();

    if (updateError) {
      console.error('Error updating board:', updateError);
      return NextResponse.json({ error: 'Failed to update board' }, { status: 500 });
    }

    if (!board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    return NextResponse.json(board);
  } catch (error) {
    console.error('PATCH /api/moodboard/boards/[id] error:', error);
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

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Delete the board — cascade deletes items, notes, and comments
    const { error: deleteError } = await adminClient
      .from('moodboard_boards')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting board:', deleteError);
      return NextResponse.json({ error: 'Failed to delete board' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/moodboard/boards/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
