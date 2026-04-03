import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertUserCanAccessTopicSearch } from '@/lib/api/topic-search-access';

export const maxDuration = 30;

/**
 * GET /api/search/[id]/videos
 * Returns scraped videos and hook patterns for a topic search.
 * Query params: sort=views|outlier_score|recent, platform=tiktok|youtube|instagram, token=<share_token>
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const shareToken = searchParams.get('token');
  const adminClient = createAdminClient();

  if (shareToken) {
    // Token-based access for shared search views (no auth required)
    const { data: link } = await adminClient
      .from('search_share_links')
      .select('search_id, expires_at')
      .eq('token', shareToken)
      .single();

    if (!link || link.search_id !== id) {
      return NextResponse.json({ error: 'Invalid share link' }, { status: 403 });
    }
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Share link expired' }, { status: 403 });
    }
  } else {
    // Authenticated access — same org / role rules as GET /api/search/[id]
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const access = await assertUserCanAccessTopicSearch(adminClient, user.id, id);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status === 404 ? 404 : 403 },
      );
    }
  }

  const sort = searchParams.get('sort') ?? 'outlier_score';
  const platform = searchParams.get('platform');

  // Build video query
  let videoQuery = adminClient
    .from('topic_search_videos')
    .select('*')
    .eq('search_id', id);

  if (platform && ['tiktok', 'youtube', 'instagram'].includes(platform)) {
    videoQuery = videoQuery.eq('platform', platform);
  }

  if (sort === 'views') {
    videoQuery = videoQuery.order('views', { ascending: false });
  } else if (sort === 'recent') {
    videoQuery = videoQuery.order('publish_date', { ascending: false, nullsFirst: false });
  } else {
    videoQuery = videoQuery.order('outlier_score', { ascending: false, nullsFirst: false });
  }

  videoQuery = videoQuery.limit(200);

  // Fetch videos and hooks in parallel
  const [videosResult, hooksResult] = await Promise.all([
    videoQuery,
    adminClient
      .from('topic_search_hooks')
      .select('*')
      .eq('search_id', id)
      .order('avg_views', { ascending: false }),
  ]);

  return NextResponse.json({
    videos: videosResult.data ?? [],
    hooks: hooksResult.data ?? [],
    total_videos: videosResult.data?.length ?? 0,
  });
}
