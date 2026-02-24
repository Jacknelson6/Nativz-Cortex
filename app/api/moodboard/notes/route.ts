import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const createNoteSchema = z.object({
  board_id: z.string().uuid('Invalid board ID'),
  content: z.string().max(5000).optional().default(''),
  color: z.enum(['yellow', 'blue', 'green', 'pink', 'white']).optional().default('yellow'),
  position_x: z.number().optional().default(0),
  position_y: z.number().optional().default(0),
});

export async function POST(request: NextRequest) {
  try {
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
    const parsed = createNoteSchema.safeParse(body);

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
      .eq('id', parsed.data.board_id)
      .single();

    if (!board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    const { data: note, error: insertError } = await adminClient
      .from('moodboard_notes')
      .insert({
        board_id: parsed.data.board_id,
        content: parsed.data.content,
        color: parsed.data.color,
        position_x: parsed.data.position_x,
        position_y: parsed.data.position_y,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating note:', insertError);
      return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
    }

    // Update board's updated_at timestamp
    await adminClient
      .from('moodboard_boards')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', parsed.data.board_id);

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error('POST /api/moodboard/notes error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
