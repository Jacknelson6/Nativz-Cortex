import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const updateNoteSchema = z.object({
  content: z.string().max(5000).optional(),
  color: z.enum(['yellow', 'blue', 'green', 'pink', 'white']).optional(),
  position_x: z.number().optional(),
  position_y: z.number().optional(),
  width: z.number().optional().nullable(),
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
    const parsed = updateNoteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Build updates object with only provided fields
    const updates: Record<string, unknown> = {};

    if (parsed.data.content !== undefined) updates.content = parsed.data.content;
    if (parsed.data.color !== undefined) updates.color = parsed.data.color;
    if (parsed.data.position_x !== undefined) updates.position_x = parsed.data.position_x;
    if (parsed.data.position_y !== undefined) updates.position_y = parsed.data.position_y;
    if (parsed.data.width !== undefined) updates.width = parsed.data.width;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Fetch note to get board_id for updating board timestamp
    const { data: existingNote } = await adminClient
      .from('moodboard_notes')
      .select('board_id')
      .eq('id', id)
      .single();

    if (!existingNote) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    const { data: note, error: updateError } = await adminClient
      .from('moodboard_notes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating note:', updateError);
      return NextResponse.json({ error: 'Failed to update note' }, { status: 500 });
    }

    // Update board's updated_at timestamp
    await adminClient
      .from('moodboard_boards')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', existingNote.board_id);

    return NextResponse.json(note);
  } catch (error) {
    console.error('PATCH /api/moodboard/notes/[id] error:', error);
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

    // Fetch note to get board_id for updating board timestamp
    const { data: existingNote } = await adminClient
      .from('moodboard_notes')
      .select('board_id')
      .eq('id', id)
      .single();

    if (!existingNote) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    const { error: deleteError } = await adminClient
      .from('moodboard_notes')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting note:', deleteError);
      return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
    }

    // Update board's updated_at timestamp
    await adminClient
      .from('moodboard_boards')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', existingNote.board_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/moodboard/notes/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
