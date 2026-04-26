import { createAdminClient } from '@/lib/supabase/admin';
import { getPostingService, ZernioPostingService } from '@/lib/posting';
import type { DateRange } from '@/lib/types/reporting';
import type { SocialPlatform } from '@/lib/posting/types';

interface SyncResult {
  synced: boolean;
  platforms: string[];
  postsCount: number;
  errors: string[];
}

interface ProfileRow {
  id: string;
  platform: SocialPlatform;
  late_account_id: string;
}

function assertZernioKey(result: SyncResult): boolean {
  if (!process.env.ZERNIO_API_KEY?.trim() && !process.env.LATE_API_KEY?.trim()) {
    result.errors.push(
      'Social reporting sync skipped: ZERNIO_API_KEY is not set. Create a key in Zernio (Settings → API keys). Docs: https://docs.zernio.com/ — legacy LATE_API_KEY is still accepted during migration.',
    );
    return false;
  }
  return true;
}

/**
 * Sync one social_profile row against Zernio. Extracted from
 * syncClientReporting so admin UI can trigger a targeted re-pull for a
 * single profile (e.g. after a Zernio reconnect) without re-running the
 * whole client.
 */
export async function syncSocialProfile(
  profile: ProfileRow,
  clientId: string,
  dateRange: DateRange,
  result: SyncResult,
): Promise<void> {
  const service = getPostingService();
  const zernio = new ZernioPostingService();
  const adminClient = createAdminClient();
  const platform = profile.platform;
  const lateAccountId = profile.late_account_id;

  // Follower stats + daily metrics + per-platform account insights + per-post
  // analytics in parallel. Posts are pulled here (instead of in a later
  // try/catch) so YouTube can fan out to per-video daily-views endpoints
  // without serializing an extra round-trip. The account-insights pulls (one
  // per platform) all return null on 402/404/501 so missing add-ons degrade
  // soft.
  try {
    const [
      followerStats,
      dailyMetrics,
      igInsights,
      igAccountMetrics,
      fbInsights,
      ytChannelInsights,
      liOrgAnalytics,
      ttAccountInsights,
      igFollowerHistory,
      posts,
    ] = await Promise.all([
      service.getFollowerStats(lateAccountId, dateRange.start, dateRange.end),
      service.getDailyMetrics({
        accountId: lateAccountId,
        startDate: dateRange.start,
        endDate: dateRange.end,
      }),
      platform === 'instagram'
        ? zernio.getInstagramInsights(lateAccountId, dateRange.start, dateRange.end)
        : Promise.resolve({ profileVisits: [], reachSeries: [] }),
      platform === 'instagram'
        ? zernio.getInstagramAccountMetrics(lateAccountId, dateRange.start, dateRange.end)
        : Promise.resolve(null),
      platform === 'facebook'
        ? zernio.getFacebookPageInsights(lateAccountId, dateRange.start, dateRange.end)
        : Promise.resolve(null),
      platform === 'youtube'
        ? zernio.getYoutubeChannelInsights(lateAccountId, dateRange.start, dateRange.end)
        : Promise.resolve(null),
      platform === 'linkedin'
        ? zernio.getLinkedInOrgAggregateAnalytics(lateAccountId, dateRange.start, dateRange.end)
        : Promise.resolve(null),
      platform === 'tiktok'
        ? zernio.getTikTokAccountInsights(lateAccountId)
        : Promise.resolve(null),
      platform === 'instagram'
        ? zernio.getInstagramFollowerHistory(lateAccountId, dateRange.start, dateRange.end)
        : Promise.resolve(null),
      service.getPostAnalytics({
        accountId: lateAccountId,
        startDate: dateRange.start,
        endDate: dateRange.end,
      }),
    ]);

    // Surface a LinkedIn re-auth prompt to the caller (Sync button → admin
    // UI) without tearing the rest of the sync down. The 412 path returns a
    // structured object instead of throwing so the rest of the parallel
    // pulls keep flowing.
    if (
      platform === 'linkedin' &&
      liOrgAnalytics &&
      'ok' in liOrgAnalytics &&
      liOrgAnalytics.ok === false
    ) {
      const link = liOrgAnalytics.reauthUrl
        ? ` Reconnect: ${liOrgAnalytics.reauthUrl}`
        : '';
      result.errors.push(
        `LinkedIn org analytics needs re-auth — missing r_organization_social / r_organization_followers / r_organization_admin scopes or ADMINISTRATOR role.${link}`,
      );
    }

    // Normalise per-platform account insights into a single window-totals
    // shape so the row-building step is platform-agnostic. Each platform
    // exposes a different subset of fields — undefined values stay null in
    // the snapshot so the UI's "MetricCard returns undefined when both
    // current and prior totals are 0" path keeps working as an honest
    // empty state.
    type AccountTotals = {
      newFollows?: number;
      unfollows?: number;
      views?: number;
      reach?: number;
      totalInteractions?: number;
      profileLinksTaps?: number;
      accountsEngaged?: number;
    };
    let accountTotals: AccountTotals | null = null;
    if (platform === 'instagram' && igAccountMetrics) {
      accountTotals = {
        newFollows: igAccountMetrics.newFollows,
        unfollows: igAccountMetrics.unfollows,
        views: igAccountMetrics.views,
        reach: igAccountMetrics.reach,
        totalInteractions: igAccountMetrics.totalInteractions,
        profileLinksTaps: igAccountMetrics.profileLinksTaps,
        accountsEngaged: igAccountMetrics.accountsEngaged,
      };
    } else if (platform === 'facebook' && fbInsights) {
      accountTotals = {
        newFollows: fbInsights.followersGained,
        unfollows: fbInsights.followersLost,
        views: fbInsights.pageViews,
        reach: fbInsights.impressionsUnique,
        totalInteractions: fbInsights.postEngagements,
      };
    } else if (platform === 'youtube' && ytChannelInsights) {
      accountTotals = {
        newFollows: ytChannelInsights.subscribersGained,
        unfollows: ytChannelInsights.subscribersLost,
        views: ytChannelInsights.views,
      };
    } else if (
      platform === 'linkedin' &&
      liOrgAnalytics &&
      'ok' in liOrgAnalytics &&
      liOrgAnalytics.ok === true
    ) {
      accountTotals = {
        newFollows: liOrgAnalytics.followerGains,
        views: liOrgAnalytics.pageViews,
        totalInteractions: liOrgAnalytics.clicks,
        reach: liOrgAnalytics.impressions,
      };
    }
    // TikTok account-insights is a current-state snapshot, not a window
    // aggregate — don't write it into account_views_count etc. (which are
    // window totals). It's used downstream as an authoritative follower
    // count when getFollowerStats returns nothing.
    void ttAccountInsights;

    // Per-video watch time + retention. YouTube only — Zernio's standard
    // /analytics endpoint returns views/likes/etc, but watch time lives on
    // /analytics/youtube/daily-views?videoId=X. We fan out across every
    // YouTube video we've ever indexed for this profile (not just the ones
    // published in the sync window), because YT daily-views returns ~30
    // days of per-day data per video and an evergreen video from months
    // ago can still be getting views today. TikTok has no equivalent
    // endpoint on Zernio, so ytAggregates stays empty for non-YT profiles.
    interface YtAgg {
      watchSec: number;
      avgViewDur: number;
      subsG: number;
      subsL: number;
    }
    const ytAggregates = new Map<string, YtAgg>();
    const ytWatchMinutesByDay = new Map<string, number>();

    if (platform === 'youtube') {
      // Sources for the video list:
      //  1. Every YT video we've previously indexed for this profile, via
      //     post_metrics.platform_post_id. Catches evergreen content.
      //  2. Any new videos surfaced in this sync's `posts` that haven't
      //     landed in post_metrics yet. First-sync after publish.
      const { data: historicalData, error: historicalErr } = await adminClient
        .from('post_metrics')
        .select('external_post_id, platform_post_id')
        .eq('social_profile_id', profile.id)
        .eq('platform', 'youtube')
        .not('platform_post_id', 'is', null);

      if (historicalErr) {
        // Don't silently drop — a failed lookup means we fall back to
        // window-only fan-out and undercount evergreen watch time. Surface
        // it so ops can notice and fix.
        result.errors.push(
          `Failed to load historical YT videos for ${profile.id}: ${historicalErr.message}`,
        );
      }

      const videoMap = new Map<string, { postId: string; platformPostId: string }>();
      // Window posts first (freshest platformPostId lookup).
      for (const p of posts) {
        if (p.platformPostId) {
          videoMap.set(p.platformPostId, { postId: p.postId, platformPostId: p.platformPostId });
        }
      }
      // Then historical — skip any already in the map.
      for (const r of historicalData ?? []) {
        const ppid = (r.platform_post_id as string | null) ?? null;
        const pid = (r.external_post_id as string | null) ?? null;
        if (!ppid || videoMap.has(ppid)) continue;
        videoMap.set(ppid, { postId: pid ?? ppid, platformPostId: ppid });
      }
      const allVideos = [...videoMap.values()];

      // Zernio rate-limits at 600 requests per window. Channels with large
      // back catalogs can push 200+ videos; 5-wide concurrency keeps us out
      // of the retry path while still being fast enough. zernioRequest also
      // retries individual 429s as a safety net.
      const pulls: Array<{ p: typeof allVideos[number]; rows: Awaited<ReturnType<typeof zernio.getYoutubeDailyViews>> }> = [];
      const CONCURRENCY = 5;
      for (let i = 0; i < allVideos.length; i += CONCURRENCY) {
        const batch = allVideos.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (p) => {
            const rows = await zernio.getYoutubeDailyViews(lateAccountId, p.platformPostId);
            return { p, rows };
          }),
        );
        pulls.push(...results);
      }
      for (const { p, rows } of pulls) {
        if (rows.length === 0) continue;
        const watchSec = Math.round(
          rows.reduce((s, r) => s + r.estimatedMinutesWatched * 60, 0),
        );
        const totalViewsInSeries = rows.reduce((s, r) => s + r.views, 0);
        // View-weighted average so one day with 5k views dominates a day with 10.
        const avgViewDur =
          totalViewsInSeries > 0
            ? rows.reduce((s, r) => s + r.averageViewDuration * r.views, 0) /
              totalViewsInSeries
            : 0;
        const subsG = rows.reduce((s, r) => s + r.subscribersGained, 0);
        const subsL = rows.reduce((s, r) => s + r.subscribersLost, 0);
        ytAggregates.set(p.postId, {
          watchSec,
          avgViewDur: Math.round(avgViewDur * 100) / 100,
          subsG,
          subsL,
        });
        for (const r of rows) {
          ytWatchMinutesByDay.set(
            r.date,
            (ytWatchMinutesByDay.get(r.date) ?? 0) + r.estimatedMinutesWatched,
          );
        }
      }
    }

    // Merge IG follower-history into the follower series so we get a real
    // daily curve for IG instead of falling back to the most-recent-point
    // workaround. follower-history wins on conflict because it returns the
    // full backfilled window from Meta directly, whereas getFollowerStats
    // only exposes the last ~7-30 days depending on Zernio plan.
    const mergedSeries: Array<{ date: string; followers: number }> = [
      ...followerStats.series,
    ];
    if (igFollowerHistory && igFollowerHistory.length > 0) {
      const seen = new Set(mergedSeries.map((p) => p.date));
      for (const p of igFollowerHistory) {
        if (seen.has(p.date)) {
          // Override the existing point with the history value (more
          // authoritative — full Meta backfill).
          const idx = mergedSeries.findIndex((m) => m.date === p.date);
          if (idx >= 0) mergedSeries[idx] = p;
        } else {
          mergedSeries.push(p);
          seen.add(p.date);
        }
      }
    }

    const followersByDay = new Map<string, number>();
    for (const p of mergedSeries) followersByDay.set(p.date, p.followers);
    const profileVisitsByDay = new Map<string, number>();
    for (const p of igInsights.profileVisits) profileVisitsByDay.set(p.date, p.value);
    const igReachByDay = new Map<string, number>();
    for (const p of igInsights.reachSeries) igReachByDay.set(p.date, p.value);

    // Zernio's follower series usually only returns the last few days.
    // Use the oldest series point (or the current count) as a fill-in for
    // earlier days rather than writing 0 — follower counts change slowly
    // and "unknown" is closer to "current" than to zero.
    const sortedSeries = [...mergedSeries].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const oldestSeriesValue =
      sortedSeries[0]?.followers ?? followerStats.followers ?? 0;
    const followerForDay = (date: string): number => {
      const exact = followersByDay.get(date);
      if (typeof exact === 'number') return exact;
      // Walk forward through the (sorted) series to find the latest point
      // on or before `date`. If `date` is older than every point, fall
      // back to the oldest known value.
      let last = oldestSeriesValue;
      for (const p of sortedSeries) {
        if (p.date > date) break;
        last = p.followers;
      }
      return last;
    };

    if (dailyMetrics.length > 0) {
      // Compute per-day follower delta from the Zernio series. Previously this
      // was hardcoded to 0, which meant the summary route's sum (which drives
      // the "Gained" column on the Analytics page) always came out to 0 even
      // when the series itself showed growth. Summing `today - yesterday`
      // across the window is algebraically equivalent to `last - first`, so
      // the total matches what Zernio reports for the period.
      const followerForPrevDay = (date: string): number => {
        const d = new Date(`${date}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 1);
        return followerForDay(d.toISOString().split('T')[0]);
      };
      // Compute window length so the end-of-window row can be identified later.
      const winStart = new Date(`${dateRange.start}T00:00:00Z`).getTime();
      const winEnd = new Date(`${dateRange.end}T00:00:00Z`).getTime();
      const windowDays = Math.max(1, Math.round((winEnd - winStart) / 86_400_000) + 1);
      // Pick the end-of-window snapshot to receive the account-level totals
      // (IG Graph only returns these as window aggregates, not per-day).
      const endOfWindowDate = dailyMetrics
        .map((d) => d.date)
        .sort((a, b) => b.localeCompare(a))[0];

      const rows = dailyMetrics.map((day) => {
        const isWindowEnd = day.date === endOfWindowDate;
        const totals = isWindowEnd ? accountTotals : null;
        return {
          social_profile_id: profile.id,
          client_id: clientId,
          platform,
          snapshot_date: day.date,
          followers_count: followerForDay(day.date),
          followers_change: followerForDay(day.date) - followerForPrevDay(day.date),
          views_count: day.views,
          engagement_count: day.engagement,
          engagement_rate: day.engagementRate,
          posts_count: day.postsCount,
          reach_count: igReachByDay.get(day.date) ?? day.reach,
          impressions_count: day.impressions,
          link_clicks_count: day.clicks,
          profile_visits_count: profileVisitsByDay.get(day.date) ?? 0,
          // Only YouTube exposes per-day watch time right now. Summed in seconds
          // across every video that got views on this day. Stays 0 for TikTok /
          // IG / FB because Zernio doesn't expose watch-time for those platforms.
          watch_time_seconds: Math.round((ytWatchMinutesByDay.get(day.date) ?? 0) * 60),
          follower_growth_percent: followerStats.growthPercent,
          // Account-wide window totals — written to the end-of-window row
          // only. Each platform exposes a different subset; missing fields
          // stay null so the UI's "MetricCard returns undefined when both
          // totals are 0" path renders an honest empty state instead of a
          // misleading zero.
          new_follows_count: totals?.newFollows ?? null,
          unfollows_count: totals?.unfollows ?? null,
          account_views_count: totals?.views ?? null,
          account_engagement_count: totals?.totalInteractions ?? null,
          account_reach_count: totals?.reach ?? null,
          account_profile_visits_count: totals?.profileLinksTaps ?? null,
          accounts_engaged_count: totals?.accountsEngaged ?? null,
          window_days: totals ? windowDays : null,
        };
      });

      const { error: snapshotError } = await adminClient
        .from('platform_snapshots')
        .upsert(rows, { onConflict: 'social_profile_id,snapshot_date' });

      if (snapshotError) {
        result.errors.push(
          `Failed to upsert snapshots for ${platform}: ${snapshotError.message}`,
        );
      }
    }

    if (dailyMetrics.length === 0 && followerStats.followers > 0) {
      const today = new Date().toISOString().split('T')[0];
      await adminClient.from('platform_snapshots').upsert(
        {
          social_profile_id: profile.id,
          client_id: clientId,
          platform,
          snapshot_date: today,
          followers_count: followerStats.followers,
          followers_change: followerStats.followerChange,
          follower_growth_percent: followerStats.growthPercent,
        },
        { onConflict: 'social_profile_id,snapshot_date' },
      );
    }

    if (mergedSeries.length > 0) {
      const rows = mergedSeries.map((p) => ({
        social_profile_id: profile.id,
        client_id: clientId,
        platform,
        day: p.date,
        followers: p.followers,
        source: 'zernio' as const,
      }));
      await adminClient
        .from('platform_follower_daily')
        .upsert(rows, { onConflict: 'social_profile_id,day' });
    }

    // Per-post analytics — merge YT video-detail aggregates in here so the
    // post_metrics upsert carries watch time + retention in one write.
    if (posts.length > 0) {
      const postRows = posts.map((p) => {
        const yt = ytAggregates.get(p.postId);
        return {
          social_profile_id: profile.id,
          client_id: clientId,
          platform,
          external_post_id: p.postId,
          platform_post_id: p.platformPostId,
          post_url: p.postUrl,
          thumbnail_url: p.thumbnailUrl,
          caption: p.caption,
          post_type: p.postType,
          published_at: p.publishedAt,
          views_count: p.views ?? p.impressions ?? 0,
          likes_count: p.likes ?? 0,
          comments_count: p.comments ?? 0,
          shares_count: p.shares ?? 0,
          saves_count: p.saves ?? 0,
          reach_count: p.reach ?? 0,
          impressions_count: p.impressions ?? 0,
          watch_time_seconds: yt?.watchSec ?? 0,
          avg_view_duration_seconds: yt?.avgViewDur ?? 0,
          subscribers_gained: yt?.subsG ?? 0,
          subscribers_lost: yt?.subsL ?? 0,
          fetched_at: new Date().toISOString(),
        };
      });

      const { error: postsError } = await adminClient
        .from('post_metrics')
        .upsert(postRows, { onConflict: 'external_post_id,platform' });

      if (postsError) {
        result.errors.push(
          `Failed to upsert posts for ${platform}: ${postsError.message}`,
        );
      } else {
        result.postsCount += posts.length;
      }
    }

    result.platforms.push(platform);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(`Failed to sync insights for ${platform}: ${message}`);
  }
}

export async function syncClientReporting(
  clientId: string,
  dateRange: DateRange,
): Promise<SyncResult> {
  const result: SyncResult = {
    synced: false,
    platforms: [],
    postsCount: 0,
    errors: [],
  };
  if (!assertZernioKey(result)) return result;

  const adminClient = createAdminClient();
  const { data: profiles, error: profilesError } = await adminClient
    .from('social_profiles')
    .select('id, platform, late_account_id')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .not('late_account_id', 'is', null);

  if (profilesError) {
    result.errors.push(`Failed to fetch social profiles: ${profilesError.message}`);
    return result;
  }
  if (!profiles || profiles.length === 0) return result;

  for (const p of profiles) {
    await syncSocialProfile(p as ProfileRow, clientId, dateRange, result);
  }

  result.synced = result.platforms.length > 0;
  return result;
}

/**
 * Targeted re-pull for a single social_profile, used by the admin
 * "Re-sync" button. Pulls 365 days by default so a reconnect → re-sync
 * flow can rebuild the whole history for that one account without
 * touching sibling platforms.
 */
export async function syncOneProfile(
  profileId: string,
  dateRange?: DateRange,
): Promise<SyncResult> {
  const result: SyncResult = {
    synced: false,
    platforms: [],
    postsCount: 0,
    errors: [],
  };
  if (!assertZernioKey(result)) return result;

  const adminClient = createAdminClient();
  const { data: row, error } = await adminClient
    .from('social_profiles')
    .select('id, client_id, platform, late_account_id, is_active')
    .eq('id', profileId)
    .single();

  if (error || !row) {
    result.errors.push(`Profile not found: ${error?.message ?? profileId}`);
    return result;
  }
  if (!row.late_account_id) {
    result.errors.push(
      `Profile ${row.platform} is not connected to Zernio — reconnect before syncing.`,
    );
    return result;
  }

  const range: DateRange = dateRange ?? {
    start: new Date(Date.now() - 364 * 24 * 3600 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  };

  await syncSocialProfile(
    {
      id: row.id,
      platform: row.platform as SocialPlatform,
      late_account_id: row.late_account_id,
    },
    row.client_id,
    range,
    result,
  );

  result.synced = result.platforms.length > 0;
  return result;
}
