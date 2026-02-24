import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const createCommentSchema = z.object({
  item_id: z.string().uuid('Invalid item ID'),
  content: z.string().min(1, 'Content is required').max(5000),
});

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('item_id');

    if (!itemId) {
      return NextResponse.json({ error: 'item_id query parameter is required' }, { status: 400 });
    }

    const { data: comments, error: fetchError } = await adminClient
      .from('moodboard_comments')
      .select('*, users(full_name, avatar_url)')
      .eq('item_id', itemId)
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('Error fetching comments:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
    }

    return NextResponse.json(comments || []);
  } catch (error) {
    console.error('GET /api/moodboard/comments error:', error);
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
    const parsed = createCommentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Verify item exists and get board_id
    const { data: item } = await adminClient
      .from('moodboard_items')
      .select('id, board_id')
      .eq('id', parsed.data.item_id)
      .single();

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const { data: comment, error: insertError } = await adminClient
      .from('moodboard_comments')
      .insert({
        item_id: parsed.data.item_id,
        content: parsed.data.content,
        user_id: user.id,
      })
      .select('*, users(full_name, avatar_url)')
      .single();

    if (insertError) {
      console.error('Error creating comment:', insertError);
      return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
    }

    // Update board's updated_at timestamp
    await adminClient
      .from('moodboard_boards')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', item.board_id);

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error('POST /api/moodboard/comments error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
