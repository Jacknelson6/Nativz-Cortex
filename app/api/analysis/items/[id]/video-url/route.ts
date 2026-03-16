import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTikTokMetadata } from '@/lib/tiktok/scraper';

/**
 * GET /api/analysis/items/[id]/video-url
 *
 * Return a direct (playable) video URL for a moodboard item. Platform page
 * URLs (TikTok, Instagram, etc.) cannot be loaded in a <video> element, so
 * this endpoint resolves the underlying CDN video URL for client-side use
 * (e.g. frame extraction, thumbnail selection). Currently supports TikTok;
 * returns 400 for other platforms without a direct CDN URL.
 *
 * @auth Required (any authenticated user)
 * @param id - Moodboard item UUID
 * @returns {{ videoUrl: string }}
 */
export async function GET(
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
    const { data: item, error: fetchError } = await adminClient
      .from('moodboard_items')
      .select('url, platform')
      .eq('id', id)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    let videoUrl: string | null = null;

    if (item.platform === 'tiktok') {
      const meta = await getTikTokMetadata(item.url);
      videoUrl = meta?.video_url ?? null;
    }

    // For non-platform URLs (direct mp4 links, etc.), the page URL may itself be playable
    if (!videoUrl && !item.platform) {
      videoUrl = item.url;
    }

    if (!videoUrl) {
      return NextResponse.json(
        { error: `Direct video URL not available for ${item.platform || 'this platform'}` },
        { status: 400 }
      );
    }

    return NextResponse.json({ videoUrl });
  } catch (error) {
    console.error('GET /api/analysis/items/[id]/video-url error:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
