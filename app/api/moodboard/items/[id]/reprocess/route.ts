import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

    // Trigger the process route internally
    const origin = request.nextUrl.origin;
    const processRes = await fetch(`${origin}/api/moodboard/items/${id}/process`, {
      method: 'POST',
      headers: {
        cookie: request.headers.get('cookie') || '',
      },
    });

    const result = await processRes.json();

    if (!processRes.ok) {
      return NextResponse.json(result, { status: processRes.status });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('POST /api/moodboard/items/[id]/reprocess error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
