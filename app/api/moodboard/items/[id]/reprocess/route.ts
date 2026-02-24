import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processVideoItem } from '@/lib/moodboard/process-video';

export async function POST(
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

    // Verify item exists
    const { data: item, error: fetchError } = await adminClient
      .from('moodboard_items')
      .select('id, type, url, board_id')
      .eq('id', id)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (item.type !== 'video') {
      return NextResponse.json({ error: 'Only video items can be reprocessed' }, { status: 400 });
    }

    // Reset item: clear analysis data, set status to pending
    await adminClient
      .from('moodboard_items')
      .update({
        status: 'pending',
        hook: null,
        hook_analysis: null,
        hook_score: null,
        hook_type: null,
        cta: null,
        concept_summary: null,
        pacing: null,
        caption_overlays: [],
        content_themes: [],
        winning_elements: [],
        improvement_areas: [],
        transcript: null,
        transcript_segments: [],
        frames: [],
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    // Process directly using shared function
    await processVideoItem(id);

    // Fetch updated item
    const { data: updated } = await adminClient
      .from('moodboard_items')
      .select('*')
      .eq('id', id)
      .single();

    return NextResponse.json(updated);
  } catch (error) {
    console.error('POST /api/moodboard/items/[id]/reprocess error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
