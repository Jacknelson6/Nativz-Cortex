import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { scrapeTikTokProfile } from '@/lib/audit/scrape-tiktok-profile';

export const maxDuration = 120;

/**
 * POST /api/analytics/competitors/[id]/refresh — Scrape a competitor and create a new snapshot
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Fetch competitor record
    const { data: competitor } = await adminClient
      .from('client_competitors')
      .select('*')
      .eq('id', id)
      .single();

    if (!competitor) {
      return NextResponse.json({ error: 'Competitor not found' }, { status: 404 });
    }

    console.log(`[benchmarking] Refreshing competitor @${competitor.username}...`);

    // Scrape the TikTok profile
    const result = await scrapeTikTokProfile(competitor.profile_url);

    // Calculate metrics
    const videos = result.videos;
    const totalLikes = videos.reduce((sum, v) => sum + v.likes, 0);
    const totalComments = videos.reduce((sum, v) => sum + v.comments, 0);
    const avgViews = videos.length > 0
      ? Math.round(videos.reduce((sum, v) => sum + v.views, 0) / videos.length)
      : 0;
    const avgEngagement = result.profile.followers > 0 && videos.length > 0
      ? (totalLikes + totalComments) / videos.length / result.profile.followers
      : 0;

    // Extract content topics from hashtags
    const hashtagCounts: Record<string, number> = {};
    for (const v of videos) {
      for (const h of v.hashtags) {
        hashtagCounts[h.toLowerCase()] = (hashtagCounts[h.toLowerCase()] ?? 0) + 1;
      }
    }
    const topTopics = Object.entries(hashtagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([tag, count]) => ({ tag, count }));

    // Recent videos for the snapshot
    const recentVideos = videos.slice(0, 10).map(v => ({
      id: v.id,
      description: v.description.substring(0, 200),
      views: v.views,
      likes: v.likes,
      comments: v.comments,
      shares: v.shares,
      publishDate: v.publishDate,
    }));

    // Insert snapshot
    const { data: snapshot, error: snapError } = await adminClient
      .from('competitor_snapshots')
      .insert({
        competitor_id: id,
        followers: result.profile.followers,
        following: result.profile.following,
        posts_count: result.profile.postsCount,
        avg_engagement_rate: parseFloat(avgEngagement.toFixed(4)),
        avg_views: avgViews,
        total_likes: totalLikes,
        total_comments: totalComments,
        recent_videos: recentVideos,
        content_topics: topTopics,
      })
      .select()
      .single();

    if (snapError) {
      console.error('Insert snapshot error:', snapError);
      return NextResponse.json({ error: 'Failed to save snapshot' }, { status: 500 });
    }

    // Update competitor display info
    await adminClient
      .from('client_competitors')
      .update({
        display_name: result.profile.displayName,
        avatar_url: result.profile.avatarUrl,
      })
      .eq('id', id);

    console.log(`[benchmarking] Snapshot saved for @${competitor.username}: ${result.profile.followers} followers`);

    return NextResponse.json({ snapshot });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('POST /api/analytics/competitors/[id]/refresh error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
