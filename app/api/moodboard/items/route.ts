import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const createItemSchema = z.object({
  board_id: z.string().uuid('Invalid board ID'),
  url: z.string().url('Invalid URL'),
  type: z.enum(['video', 'image', 'website']),
  title: z.string().max(500).optional().nullable(),
  position_x: z.number().optional().default(0),
  position_y: z.number().optional().default(0),
  width: z.number().optional(),
  height: z.number().optional(),
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
    console.log('Received request:', { board_id: body.board_id, url: body.url, type: body.type });
    
    const parsed = createItemSchema.safeParse(body);

    if (!parsed.success) {
      console.error('Validation failed:', parsed.error.flatten().fieldErrors);
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Verify board exists
    const { data: board, error: boardError } = await adminClient
      .from('moodboard_boards')
      .select('id')
      .eq('id', parsed.data.board_id)
      .single();

    if (boardError || !board) {
      console.error('Board not found:', boardError);
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    const insertData: Record<string, unknown> = {
        board_id: parsed.data.board_id,
        url: parsed.data.url,
        type: parsed.data.type,
        title: parsed.data.title ?? null,
        position_x: parsed.data.position_x,
        position_y: parsed.data.position_y,
        created_by: user.id,
        status: parsed.data.type === 'image' ? 'completed' : 'pending',
      };
    if (parsed.data.width !== undefined) insertData.width = parsed.data.width;
    if (parsed.data.height !== undefined) insertData.height = parsed.data.height;

    const { data: item, error: insertError } = await adminClient
      .from('moodboard_items')
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      console.error('Error creating item:', insertError);
      return NextResponse.json({ error: 'Failed to create item', details: insertError.message }, { status: 500 });
    }

    // Update board's updated_at timestamp
    await adminClient
      .from('moodboard_boards')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', parsed.data.board_id);

    // Auto-trigger processing for video and website items (non-blocking)
    if (item && (parsed.data.type === 'video' || parsed.data.type === 'website')) {
      const processUrl = parsed.data.type === 'video'
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/moodboard/items/${item.id}/process`
        : `${process.env.NEXT_PUBLIC_APP_URL}/api/moodboard/items/${item.id}/insights`;

      fetch(processUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': request.headers.get('cookie') || '',
        },
      }).catch((err) => console.error('Auto-process trigger failed:', err));
    }

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error('POST /api/moodboard/items error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
