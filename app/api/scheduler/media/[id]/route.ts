import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function DELETE(
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

    // Check if media is used by any post
    const { data: usages } = await adminClient
      .from('scheduled_post_media')
      .select('id')
      .eq('media_id', id)
      .limit(1);

    if (usages && usages.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete media that is attached to a post. Remove it from the post first.' },
        { status: 409 }
      );
    }

    const { error: deleteError } = await adminClient
      .from('scheduler_media')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Delete media error:', deleteError);
      return NextResponse.json({ error: 'Failed to delete media' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/scheduler/media/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
