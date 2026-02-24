import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const updateCommentSchema = z.object({
  content: z.string().min(1, 'Content is required').max(5000),
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
    const parsed = updateCommentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Verify comment exists and user is the author
    const { data: existingComment } = await adminClient
      .from('moodboard_comments')
      .select('user_id, item_id')
      .eq('id', id)
      .single();

    if (!existingComment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    if (existingComment.user_id !== user.id) {
      return NextResponse.json({ error: 'You can only edit your own comments' }, { status: 403 });
    }

    const { data: comment, error: updateError } = await adminClient
      .from('moodboard_comments')
      .update({
        content: parsed.data.content,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*, users(full_name, avatar_url)')
      .single();

    if (updateError) {
      console.error('Error updating comment:', updateError);
      return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 });
    }

    return NextResponse.json(comment);
  } catch (error) {
    console.error('PATCH /api/moodboard/comments/[id] error:', error);
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

    // Verify comment exists — admins can delete any comment, authors can delete their own
    const { data: existingComment } = await adminClient
      .from('moodboard_comments')
      .select('user_id, item_id')
      .eq('id', id)
      .single();

    if (!existingComment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // Get board_id through the item for updating board timestamp
    const { data: item } = await adminClient
      .from('moodboard_items')
      .select('board_id')
      .eq('id', existingComment.item_id)
      .single();

    const { error: deleteError } = await adminClient
      .from('moodboard_comments')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting comment:', deleteError);
      return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
    }

    // Update board's updated_at timestamp if we found the board
    if (item) {
      await adminClient
        .from('moodboard_boards')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', item.board_id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/moodboard/comments/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
