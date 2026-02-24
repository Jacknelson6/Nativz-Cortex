import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const positionSchema = z.object({
  id: z.string().uuid(),
  position_x: z.number(),
  position_y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
});

const batchPositionsSchema = z.object({
  items: z.array(positionSchema).optional().default([]),
  notes: z.array(positionSchema.omit({ height: true }).extend({
    width: z.number().optional(),
  })).optional().default([]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: boardId } = await params;
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
    const parsed = batchPositionsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Verify board exists
    const { data: board } = await adminClient
      .from('moodboard_boards')
      .select('id')
      .eq('id', boardId)
      .single();

    if (!board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    const errors: string[] = [];

    // Update item positions
    if (parsed.data.items && parsed.data.items.length > 0) {
      await Promise.all(
        parsed.data.items.map(async (item) => {
          const updates: Record<string, unknown> = {
            position_x: item.position_x,
            position_y: item.position_y,
          };
          if (item.width !== undefined) updates.width = item.width;
          if (item.height !== undefined) updates.height = item.height;

          const { error } = await adminClient
            .from('moodboard_items')
            .update(updates)
            .eq('id', item.id)
            .eq('board_id', boardId);

          if (error) {
            errors.push(`Failed to update item ${item.id}: ${error.message}`);
          }
        })
      );
    }

    // Update note positions
    if (parsed.data.notes && parsed.data.notes.length > 0) {
      await Promise.all(
        parsed.data.notes.map(async (note) => {
          const updates: Record<string, unknown> = {
            position_x: note.position_x,
            position_y: note.position_y,
          };
          if (note.width !== undefined) updates.width = note.width;

          const { error } = await adminClient
            .from('moodboard_notes')
            .update(updates)
            .eq('id', note.id)
            .eq('board_id', boardId);

          if (error) {
            errors.push(`Failed to update note ${note.id}: ${error.message}`);
          }
        })
      );
    }

    // Update board's updated_at timestamp
    await adminClient
      .from('moodboard_boards')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', boardId);

    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, errors },
        { status: 207 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/moodboard/boards/[id]/positions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
