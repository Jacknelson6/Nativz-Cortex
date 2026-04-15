import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { scrapeTikTokProfile } from '@/lib/audit/scrape-tiktok-profile';
import { scrapeInstagramProfile } from '@/lib/audit/scrape-instagram-profile';
import { scrapeFacebookProfile } from '@/lib/audit/scrape-facebook-profile';
import { scrapeYouTubeProfile } from '@/lib/audit/scrape-youtube-profile';
import { calculateEngagementRate, calculateAvgViews, estimatePostingFrequency } from '@/lib/audit/analyze';
import type { AuditPlatform, ProspectVideo, ProspectProfile } from '@/lib/audit/types';

export const maxDuration = 300;

/**
 * GET /api/cron/benchmark-snapshots — Phase 2 of competitor benchmarking.
 *
 * Runs daily. Walks every active `client_benchmarks` row whose
 * `next_snapshot_due_at` has passed, re-scrapes the frozen competitor list,
 * and writes one `benchmark_snapshots` row per (benchmark, competitor) with
 * headline stats + deltas vs. the prior snapshot. Phase 3's analytics view
 * reads from these rows.
 *
 * Auth: `Bearer $CRON_SECRET` (matches the other Vercel crons in this repo).
 *
 * Why daily instead of weekly: cadence is per-benchmark (weekly / biweekly /
 * monthly); `next_snapshot_due_at` is what actually gates work. Running the
 * cron daily lets us honor "weekly" cadence without depending on the
 * scheduled trigger running on an exact day-of-week.
 */
type Cadence = 'weekly' | 'biweekly' | 'monthly';

const CADENCE_DAYS: Record<Cadence, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

interface SnapshotCompetitor {
  username: string;
  displayName: string;
  platform: AuditPlatform;
  profileUrl: string;
  avatarUrl?: string | null;
  baselineFollowers?: number;
  baselineAvgViews?: number;
  baselineEngagementRate?: number;
  baselinePostingFrequency?: string;
}

async function scrapeCompetitor(
  platform: AuditPlatform,
  profileUrl: string,
): Promise<{ profile: ProspectProfile; videos: ProspectVideo[] }> {
  switch (platform) {
    case 'tiktok':
      return scrapeTikTokProfile(profileUrl);
    case 'instagram':
      return scrapeInstagramProfile(profileUrl);
    case 'facebook':
      return scrapeFacebookProfile(profileUrl);
    case 'youtube':
      return scrapeYouTubeProfile(profileUrl);
    default:
      throw new Error(`Unsupported benchmark platform: ${platform}`);
  }
}

/** Lightweight preview rows for UI. */
function summarizeNewPosts(videos: ProspectVideo[], sinceIso: string | null) {
  const cutoff = sinceIso ? new Date(sinceIso).getTime() : null;
  const fresh = cutoff
    ? videos.filter((v) => v.publishDate && new Date(v.publishDate).getTime() > cutoff)
    : videos.slice(0, 10);
  return fresh.slice(0, 10).map((v) => ({
    id: v.id,
    url: v.url,
    description: v.description?.slice(0, 200) ?? '',
    thumbnail_url: v.thumbnailUrl,
    views: v.views,
    likes: v.likes,
    comments: v.comments,
    publish_date: v.publishDate,
    duration: v.duration,
    hashtags: v.hashtags,
  }));
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Pull due benchmarks. `next_snapshot_due_at IS NULL` covers fresh
  // benchmarks whose attach-route didn't stamp it for some reason.
  const now = new Date().toISOString();
  const { data: dueRows, error: dueErr } = await admin
    .from('client_benchmarks')
    .select('id, client_id, audit_id, competitors_snapshot, cadence, last_snapshot_at')
    .eq('is_active', true)
    .or(`next_snapshot_due_at.is.null,next_snapshot_due_at.lte.${now}`)
    .limit(25); // cap per run so a bad scrape doesn't blow the 300s budget

  if (dueErr) {
    console.error('[cron:benchmark-snapshots] failed to load due benchmarks:', dueErr);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  if (!dueRows || dueRows.length === 0) {
    return NextResponse.json({ processed: 0, reason: 'nothing due' });
  }

  let benchmarksProcessed = 0;
  let snapshotsWritten = 0;
  let scrapeFailures = 0;

  for (const benchmark of dueRows) {
    const competitors = (benchmark.competitors_snapshot ?? []) as SnapshotCompetitor[];
    if (!Array.isArray(competitors) || competitors.length === 0) {
      // Still bump cadence so we don't re-select every run.
      await markProcessed(admin, benchmark.id, benchmark.cadence as Cadence);
      benchmarksProcessed++;
      continue;
    }

    for (const c of competitors) {
      // Look up the prior snapshot so we can compute deltas on insert.
      const { data: prior } = await admin
        .from('benchmark_snapshots')
        .select('followers, posts_count, avg_views, engagement_rate, captured_at')
        .eq('benchmark_id', benchmark.id)
        .eq('platform', c.platform)
        .eq('username', c.username)
        .order('captured_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      try {
        const { profile, videos } = await scrapeCompetitor(c.platform, c.profileUrl);

        const followers = profile.followers ?? 0;
        const postsCount = profile.postsCount ?? videos.length;
        const avgViews = calculateAvgViews(videos);
        const er = calculateEngagementRate(videos, followers);
        const freq = estimatePostingFrequency(videos);

        const row = {
          benchmark_id: benchmark.id,
          platform: c.platform,
          username: c.username,
          profile_url: c.profileUrl,
          display_name: profile.displayName ?? c.displayName,
          followers,
          posts_count: postsCount,
          avg_views: avgViews,
          engagement_rate: er,
          posting_frequency: freq,
          followers_delta: prior?.followers != null ? followers - prior.followers : null,
          posts_count_delta:
            prior?.posts_count != null ? postsCount - prior.posts_count : null,
          avg_views_delta: prior?.avg_views != null ? avgViews - prior.avg_views : null,
          engagement_rate_delta:
            prior?.engagement_rate != null ? er - prior.engagement_rate : null,
          new_posts: summarizeNewPosts(videos, prior?.captured_at ?? null),
          scrape_error: null as string | null,
        };

        const { error: insertErr } = await admin.from('benchmark_snapshots').insert(row);
        if (insertErr) {
          console.error(
            `[cron:benchmark-snapshots] insert failed for ${c.platform}/${c.username}:`,
            insertErr,
          );
          scrapeFailures++;
        } else {
          snapshotsWritten++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[cron:benchmark-snapshots] ${c.platform}/${c.username} scrape failed: ${msg}`,
        );
        scrapeFailures++;
        // Insert a failure row so gaps are visible on the chart instead of
        // silent. Keeps deltas NULL since we have no new numbers.
        await admin.from('benchmark_snapshots').insert({
          benchmark_id: benchmark.id,
          platform: c.platform,
          username: c.username,
          profile_url: c.profileUrl,
          display_name: c.displayName,
          scrape_error: msg,
        });
      }
    }

    await markProcessed(admin, benchmark.id, benchmark.cadence as Cadence);
    benchmarksProcessed++;
  }

  return NextResponse.json({
    processed: benchmarksProcessed,
    snapshots: snapshotsWritten,
    failures: scrapeFailures,
  });
}

async function markProcessed(
  admin: ReturnType<typeof createAdminClient>,
  benchmarkId: string,
  cadence: Cadence,
) {
  const now = new Date();
  const next = new Date(now);
  next.setDate(next.getDate() + CADENCE_DAYS[cadence]);
  await admin
    .from('client_benchmarks')
    .update({
      last_snapshot_at: now.toISOString(),
      next_snapshot_due_at: next.toISOString(),
    })
    .eq('id', benchmarkId);
}
