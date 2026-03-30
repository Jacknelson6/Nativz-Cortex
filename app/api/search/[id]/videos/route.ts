import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
    // Authenticated access
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to this search
    const { data: search } = await adminClient
      .from('topic_searches')
      .select('id, client_id')
      .eq('id', id)
      .single();

    if (!search) {
      return NextResponse.json({ error: 'Search not found' }, { status: 404 });
    }

    // Org scope check: portal users can only view their org's client searches
    if (search.client_id) {
      const { data: userData } = await adminClient
        .from('users')
        .select('role, organization_id')
        .eq('id', user.id)
        .single();
      if (userData?.role === 'viewer') {
        const { data: client } = await adminClient
          .from('clients')
          .select('organization_id')
          .eq('id', search.client_id)
          .single();
        if (client && client.organization_id !== userData.organization_id) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }
      }
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
