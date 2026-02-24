import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const updateItemSchema = z.object({
  position_x: z.number().optional(),
  position_y: z.number().optional(),
  width: z.number().optional().nullable(),
  height: z.number().optional().nullable(),
  title: z.string().max(500).optional().nullable(),
  replication_brief: z.string().max(5000).optional().nullable(),
  status: z.enum(['none', 'replicate', 'adapt', 'archived']).optional(),
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
    const parsed = updateItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Build updates object with only provided fields
    const updates: Record<string, unknown> = {};

    if (parsed.data.position_x !== undefined) updates.position_x = parsed.data.position_x;
    if (parsed.data.position_y !== undefined) updates.position_y = parsed.data.position_y;
    if (parsed.data.width !== undefined) updates.width = parsed.data.width;
    if (parsed.data.height !== undefined) updates.height = parsed.data.height;
    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.replication_brief !== undefined) updates.replication_brief = parsed.data.replication_brief;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Fetch item to get board_id for updating board timestamp
    const { data: existingItem } = await adminClient
      .from('moodboard_items')
      .select('board_id')
      .eq('id', id)
      .single();

    if (!existingItem) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const { data: item, error: updateError } = await adminClient
      .from('moodboard_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating item:', updateError);
      return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
    }

    // Update board's updated_at timestamp
    await adminClient
      .from('moodboard_boards')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', existingItem.board_id);

    return NextResponse.json(item);
  } catch (error) {
    console.error('PATCH /api/moodboard/items/[id] error:', error);
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

    // Fetch item to get board_id for updating board timestamp
    const { data: existingItem } = await adminClient
      .from('moodboard_items')
      .select('board_id')
      .eq('id', id)
      .single();

    if (!existingItem) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const { error: deleteError } = await adminClient
      .from('moodboard_items')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting item:', deleteError);
      return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
    }

    // Update board's updated_at timestamp
    await adminClient
      .from('moodboard_boards')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', existingItem.board_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/moodboard/items/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
