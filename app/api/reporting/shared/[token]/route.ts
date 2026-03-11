import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const admin = createAdminClient();

    // Fetch the report link (no auth — public access via token)
    const { data: link, error: linkError } = await admin
      .from('report_links')
      .select('*')
      .eq('token', token)
      .single();

    if (linkError || !link) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 },
      );
    }

    // Check expiry
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'This report link has expired' },
        { status: 410 },
      );
    }

    const sections = (link.sections ?? {}) as Record<string, unknown>;
    const dateRange = {
      start: link.date_start,
      end: link.date_end,
    };

    // Fetch client info
    const { data: client } = await admin
      .from('clients')
      .select('name, logo_url, agency')
      .eq('id', link.client_id)
      .single();

    // Fetch summary data
    let summary = null;
    if (sections.performanceSummary || sections.platformBreakdown) {
      // Fetch platform snapshots for the date range
      const { data: snapshots } = await admin
        .from('platform_snapshots')
        .select('*, social_profiles!inner(username)')
        .eq('client_id', link.client_id)
        .gte('snapshot_date', dateRange.start)
        .lte('snapshot_date', dateRange.end);

      if (snapshots && snapshots.length > 0) {
        // Group by platform
        const platformMap = new Map<string, typeof snapshots>();
        for (const snap of snapshots) {
          const existing = platformMap.get(snap.platform) ?? [];
          existing.push(snap);
          platformMap.set(snap.platform, existing);
        }

        const platforms = Array.from(platformMap.entries()).map(
          ([platform, snaps]) => {
            const latest = snaps[snaps.length - 1];
            const profile = latest.social_profiles as unknown as {
              username: string;
            } | null;
            return {
              platform,
              username: profile?.username ?? '',
              avatarUrl: null,
              followers: latest.followers_count ?? 0,
              followerChange: snaps.reduce(
                (sum: number, s: Record<string, unknown>) => sum + ((s.followers_change as number) ?? 0),
                0,
              ),
              totalViews: snaps.reduce(
                (sum: number, s: Record<string, unknown>) => sum + ((s.views_count as number) ?? 0),
                0,
              ),
              totalEngagement: snaps.reduce(
                (sum: number, s: Record<string, unknown>) => sum + ((s.engagement_count as number) ?? 0),
                0,
              ),
              engagementRate: latest.engagement_rate ?? 0,
              postsCount: snaps.reduce(
                (sum: number, s: Record<string, unknown>) => sum + ((s.posts_count as number) ?? 0),
                0,
              ),
            };
          },
        );

        summary = {
          combined: {
            totalViews: platforms.reduce((s, p) => s + p.totalViews, 0),
            totalViewsChange: 0,
            totalFollowerChange: platforms.reduce(
              (s, p) => s + p.followerChange,
              0,
            ),
            totalFollowerChangeChange: 0,
            totalEngagement: platforms.reduce(
              (s, p) => s + p.totalEngagement,
              0,
            ),
            totalEngagementChange: 0,
            avgEngagementRate:
              platforms.length > 0
                ? platforms.reduce((s, p) => s + p.engagementRate, 0) /
                  platforms.length
                : 0,
            avgEngagementRateChange: 0,
          },
          platforms,
          dateRange,
        };
      }
    }

    // Fetch top posts
    let topPosts: unknown[] = [];
    if (sections.topPosts) {
      const limit = (sections.topPostsCount as number) ?? 5;
      const { data: posts } = await admin
        .from('post_metrics')
        .select('*, social_profiles!inner(username)')
        .eq('client_id', link.client_id)
        .gte('published_at', dateRange.start)
        .lte('published_at', dateRange.end);

      if (posts && posts.length > 0) {
        topPosts = posts
          .map((post) => {
            const totalEngagement =
              (post.likes_count ?? 0) +
              (post.comments_count ?? 0) +
              (post.shares_count ?? 0) +
              (post.saves_count ?? 0);
            const profile = post.social_profiles as unknown as {
              username: string;
            } | null;
            return {
              rank: 0,
              id: post.id,
              platform: post.platform,
              username: profile?.username ?? '',
              externalPostId: post.external_post_id,
              postUrl: post.post_url ?? null,
              thumbnailUrl: post.thumbnail_url ?? null,
              caption: post.caption ?? null,
              postType: post.post_type ?? null,
              publishedAt: post.published_at ?? null,
              views: post.views_count ?? 0,
              likes: post.likes_count ?? 0,
              comments: post.comments_count ?? 0,
              shares: post.shares_count ?? 0,
              saves: post.saves_count ?? 0,
              totalEngagement,
            };
          })
          .sort(
            (a, b) =>
              (b as { totalEngagement: number }).totalEngagement -
              (a as { totalEngagement: number }).totalEngagement,
          )
          .slice(0, limit)
          .map((post, index) => ({ ...post, rank: index + 1 }));
      }
    }

    return NextResponse.json({
      clientName: client?.name ?? 'Client',
      agency: client?.agency ?? null,
      logoUrl: client?.logo_url ?? null,
      dateRange,
      sections,
      summary,
      topPosts,
    });
  } catch (error) {
    console.error('GET /api/reporting/shared/[token] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
