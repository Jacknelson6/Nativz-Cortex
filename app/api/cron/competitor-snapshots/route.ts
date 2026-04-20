import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { scrapeTikTokProfile } from '@/lib/audit/scrape-tiktok-profile';
import { notifyAdmins } from '@/lib/notifications';

export const maxDuration = 300;

const STALE_DAYS = 7;

/**
 * GET /api/cron/competitor-snapshots — daily snapshot refresher for the
 * manually-tracked `client_competitors` path (the audit-driven path has its
 * own cron at /api/cron/benchmark-snapshots).
 *
 * For every TikTok competitor whose latest `competitor_snapshots` row is
 * either missing or older than 7 days, run the scrape + insert path. Rate-
 * limited to 25 competitors per run so a bad scrape can't eat the whole
 * 300s budget.
 *
 * Also emits one summary notification per client whose scrape came up empty
 * so stale data doesn't silently rot.
 *
 * Auth: `Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  const staleCutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

  // Pull every active competitor plus its latest snapshot timestamp. Join
  // via a subquery so we can rank client-side without a window function.
  const { data: competitors, error: compErr } = await admin
    .from('client_competitors')
    .select('id, client_id, platform, username, profile_url, clients(name)')
    .eq('platform', 'tiktok');
  if (compErr) {
    console.error('[cron:competitor-snapshots] load competitors failed', compErr);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  if (!competitors || competitors.length === 0) {
    return NextResponse.json({ refreshed: 0, reason: 'no competitors' });
  }

  // Fetch each competitor's latest snapshot timestamp in one query.
  const ids = competitors.map((c) => c.id);
  const { data: latestSnaps } = await admin
    .from('competitor_snapshots')
    .select('competitor_id, scraped_at')
    .in('competitor_id', ids)
    .order('scraped_at', { ascending: false });

  const latestByCompetitor = new Map<string, string>();
  for (const s of latestSnaps ?? []) {
    if (!latestByCompetitor.has(s.competitor_id)) {
      latestByCompetitor.set(s.competitor_id, s.scraped_at);
    }
  }

  const stale = competitors.filter((c) => {
    const last = latestByCompetitor.get(c.id);
    if (!last) return true;
    return new Date(last).getTime() < staleCutoff.getTime();
  });

  if (stale.length === 0) {
    return NextResponse.json({ refreshed: 0, reason: 'everything fresh' });
  }

  // Cap per-run so a slow scrape can't eat the whole budget.
  const queue = stale.slice(0, 25);
  let refreshed = 0;
  let failed = 0;
  const failuresByClient = new Map<string, { clientName: string; users: string[] }>();

  for (const c of queue) {
    try {
      const result = await scrapeTikTokProfile(c.profile_url);
      const videos = result.videos;
      const totalLikes = videos.reduce((sum, v) => sum + v.likes, 0);
      const totalComments = videos.reduce((sum, v) => sum + v.comments, 0);
      const avgViews =
        videos.length > 0
          ? Math.round(videos.reduce((sum, v) => sum + v.views, 0) / videos.length)
          : 0;
      const avgEngagement =
        result.profile.followers > 0 && videos.length > 0
          ? (totalLikes + totalComments) / videos.length / result.profile.followers
          : 0;

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

      await admin.from('competitor_snapshots').insert({
        competitor_id: c.id,
        followers: result.profile.followers,
        following: result.profile.following,
        posts_count: result.profile.postsCount,
        avg_engagement_rate: parseFloat(avgEngagement.toFixed(4)),
        avg_views: avgViews,
        total_likes: totalLikes,
        total_comments: totalComments,
        recent_videos: videos.slice(0, 10).map((v) => ({
          id: v.id,
          description: v.description.substring(0, 200),
          views: v.views,
          likes: v.likes,
          comments: v.comments,
          shares: v.shares,
          publishDate: v.publishDate,
        })),
        content_topics: topTopics,
      });
      await admin
        .from('client_competitors')
        .update({
          display_name: result.profile.displayName,
          avatar_url: result.profile.avatarUrl,
        })
        .eq('id', c.id);
      refreshed++;
    } catch (err) {
      failed++;
      const name = (c.clients as unknown as { name: string } | null)?.name ?? 'Unknown client';
      const bucket = failuresByClient.get(c.client_id) ?? { clientName: name, users: [] };
      bucket.users.push(`@${c.username}`);
      failuresByClient.set(c.client_id, bucket);
      console.warn(
        `[cron:competitor-snapshots] @${c.username} scrape failed`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Surface persistent failures once per client-per-day so stale data doesn't
  // rot silently. Notifications fan out to admins assigned to the client.
  for (const [clientId, { clientName, users }] of failuresByClient) {
    await notifyAdmins({
      type: 'sync_failed',
      title: `${clientName}: ${users.length} competitor${users.length === 1 ? '' : 's'} failed to refresh`,
      body: `Stale snapshots on ${users.slice(0, 5).join(', ')}${users.length > 5 ? `, +${users.length - 5} more` : ''}. Retry from /admin/analytics → Benchmarking.`,
      linkPath: `/admin/analytics?clientId=${clientId}&tab=benchmarking`,
      clientId,
    });
  }

  return NextResponse.json({
    refreshed,
    failed,
    queue_size: queue.length,
    stale_total: stale.length,
  });
}
