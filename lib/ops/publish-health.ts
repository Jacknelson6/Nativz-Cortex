import type { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Shared data layer for PUB-05 — the publish health ops dashboard and the
 * morning digest email both call into this. Keeping the queries here means
 * the page, the on-demand refresh API, and the digest cron all read the same
 * shape and we don't end up with three drifting versions of "how do we
 * compute partial_failed in the last 7 days?".
 *
 * Counts are derived from `scheduled_post_platforms` (per-leg truth) rather
 * than `scheduled_posts` (post-level rollup) because a post can sit at
 * `partially_failed` while individual legs are at `published` or `failed`.
 * The dashboard cares about leg health.
 */

export type CorePlatform = 'facebook' | 'instagram' | 'tiktok' | 'youtube';

export const CORE_PLATFORMS: CorePlatform[] = [
  'facebook',
  'instagram',
  'tiktok',
  'youtube',
];

export interface PerPlatformDailyCounts {
  date: string; // YYYY-MM-DD in America/Chicago (Jack's TZ)
  facebook: { published: number; failed: number };
  instagram: { published: number; failed: number };
  tiktok: { published: number; failed: number };
  youtube: { published: number; failed: number };
}

export interface PerPlatformSummary {
  platform: CorePlatform;
  published: number;
  failed: number;
  successRate: number; // 0..1
}

export interface FailingClient {
  clientId: string;
  clientName: string;
  failureCount: number;
}

export interface CanaryRecentRun {
  id: string;
  platform: string;
  createdAt: string;
  publishStatus: 'pending' | 'published' | 'failed';
  verificationStatus: string | null;
  publishError: string | null;
}

export interface CanaryTrendByPlatform {
  platform: CorePlatform;
  runs: CanaryRecentRun[];
  lastFailure: CanaryRecentRun | null;
}

export interface RecentFailureRow {
  legId: string;
  postId: string;
  clientId: string | null;
  clientName: string | null;
  platform: string;
  scheduledFor: string | null;
  failureReason: string | null;
  retryCount: number;
}

export interface PublishHealthSnapshot {
  generatedAt: string;
  /** Rolling 7d / 30d per-platform summary. */
  summary7d: PerPlatformSummary[];
  summary30d: PerPlatformSummary[];
  /** 30-day daily breakdown for the stacked-bars widget. */
  daily30d: PerPlatformDailyCounts[];
  /** Top failing clients in the last 7 days. */
  topFailingClients: FailingClient[];
  /** Last 30 canary runs per platform plus the latest failure for the strip. */
  canaryTrend: CanaryTrendByPlatform[];
  /** Last 24h of leg failures with reason + retry count. */
  recentFailures: RecentFailureRow[];
  /** Top-line "all systems healthy / N legs degraded" banner state. */
  banner: {
    status: 'healthy' | 'degraded' | 'incident';
    headline: string;
    detail: string | null;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

interface LegRow {
  status: string;
  failure_reason: string | null;
  published_at: string | null;
  scheduled_at: string | null;
  retry_count: number | null;
  social_profiles: { platform: string } | null;
}

interface FailureLegRow {
  id: string;
  post_id: string;
  status: string;
  failure_reason: string | null;
  scheduled_at: string | null;
  retry_count: number | null;
  social_profiles: { platform: string } | null;
  scheduled_posts: {
    client_id: string | null;
    clients: { id: string; name: string } | null;
  } | null;
}

interface CanaryRunRow {
  id: string;
  platform: string;
  publish_status: 'pending' | 'published' | 'failed';
  verification_status: string | null;
  publish_error: string | null;
  created_at: string;
}

function emptyDailyCounts(date: string): PerPlatformDailyCounts {
  return {
    date,
    facebook: { published: 0, failed: 0 },
    instagram: { published: 0, failed: 0 },
    tiktok: { published: 0, failed: 0 },
    youtube: { published: 0, failed: 0 },
  };
}

function dateKeyChicago(iso: string): string {
  // Use Intl with America/Chicago, which gives Jack-local day buckets.
  // The publish cron and digest both run in UTC; without normalizing here,
  // a 1am-CT publish would land in the prior UTC day's bucket.
  const dt = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(dt); // YYYY-MM-DD
}

function isCorePlatform(p: string): p is CorePlatform {
  return CORE_PLATFORMS.includes(p as CorePlatform);
}

/**
 * Read everything the dashboard + digest need in one pass. The queries are
 * independent so we run them in parallel. Each individual query is bounded
 * by a 30-day window (the longest the dashboard ever asks for) so this stays
 * fast without dedicated aggregation tables.
 */
export async function fetchPublishHealthSnapshot(
  admin: AdminClient,
): Promise<PublishHealthSnapshot> {
  const now = Date.now();
  const since30d = new Date(now - 30 * DAY_MS).toISOString();
  const since7d = new Date(now - 7 * DAY_MS).toISOString();
  const since24h = new Date(now - DAY_MS).toISOString();

  const [
    { data: legs30dRaw },
    { data: failures7dRaw },
    { data: recent24hRaw },
    { data: canaryRunsRaw },
  ] = await Promise.all([
    // 30-day per-leg activity for the stacked-bars widget.
    admin
      .from('scheduled_post_platforms')
      .select(
        'status, failure_reason, published_at, scheduled_at, retry_count, social_profiles!inner(platform)',
      )
      .or(`published_at.gte.${since30d},and(status.eq.failed,scheduled_at.gte.${since30d})`)
      .limit(20000),
    // 7-day failures for the top-failing-clients widget.
    admin
      .from('scheduled_post_platforms')
      .select(
        'id, post_id, status, failure_reason, scheduled_at, retry_count, social_profiles!inner(platform), scheduled_posts!inner(client_id, clients(id, name))',
      )
      .eq('status', 'failed')
      .gte('scheduled_at', since7d)
      .limit(5000),
    // 24h failures for the table widget.
    admin
      .from('scheduled_post_platforms')
      .select(
        'id, post_id, status, failure_reason, scheduled_at, retry_count, social_profiles!inner(platform), scheduled_posts!inner(client_id, clients(id, name))',
      )
      .eq('status', 'failed')
      .gte('scheduled_at', since24h)
      .order('scheduled_at', { ascending: false })
      .limit(50),
    // Last 30 runs per platform = 120 rows worst case, well within limits.
    admin
      .from('synthetic_publish_canaries')
      .select('id, platform, publish_status, verification_status, publish_error, created_at')
      .gte('created_at', since30d)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  const legs30d = (legs30dRaw ?? []) as unknown as LegRow[];
  const failures7d = (failures7dRaw ?? []) as unknown as FailureLegRow[];
  const recent24h = (recent24hRaw ?? []) as unknown as FailureLegRow[];
  const canaryRuns = (canaryRunsRaw ?? []) as unknown as CanaryRunRow[];

  // ---- Daily 30d stacked counts ----
  const dailyByKey = new Map<string, PerPlatformDailyCounts>();
  for (let i = 29; i >= 0; i--) {
    const iso = new Date(now - i * DAY_MS).toISOString();
    const key = dateKeyChicago(iso);
    if (!dailyByKey.has(key)) dailyByKey.set(key, emptyDailyCounts(key));
  }
  for (const leg of legs30d) {
    const platform = leg.social_profiles?.platform;
    if (!platform || !isCorePlatform(platform)) continue;
    const stamp = leg.status === 'published' ? leg.published_at : leg.scheduled_at;
    if (!stamp) continue;
    const key = dateKeyChicago(stamp);
    const bucket = dailyByKey.get(key);
    if (!bucket) continue; // outside the 30d window from a tz roll
    if (leg.status === 'published') bucket[platform].published += 1;
    else if (leg.status === 'failed') bucket[platform].failed += 1;
  }
  const daily30d: PerPlatformDailyCounts[] = Array.from(dailyByKey.values()).sort((a, b) =>
    a.date < b.date ? -1 : 1,
  );

  // ---- 7d / 30d summary ----
  const summary7d = summarize(daily30d.slice(-7));
  const summary30d = summarize(daily30d);

  // ---- Top failing clients (last 7d) ----
  const failByClient = new Map<string, FailingClient>();
  for (const row of failures7d) {
    const client = row.scheduled_posts?.clients ?? null;
    if (!client) continue;
    const existing = failByClient.get(client.id);
    if (existing) existing.failureCount += 1;
    else
      failByClient.set(client.id, {
        clientId: client.id,
        clientName: client.name,
        failureCount: 1,
      });
  }
  const topFailingClients = Array.from(failByClient.values())
    .sort((a, b) => b.failureCount - a.failureCount)
    .slice(0, 5);

  // ---- Canary trend ----
  const canaryByPlatform = new Map<CorePlatform, CanaryRecentRun[]>();
  for (const p of CORE_PLATFORMS) canaryByPlatform.set(p, []);
  for (const run of canaryRuns) {
    if (!isCorePlatform(run.platform)) continue;
    const list = canaryByPlatform.get(run.platform) ?? [];
    if (list.length >= 30) continue;
    list.push({
      id: run.id,
      platform: run.platform,
      createdAt: run.created_at,
      publishStatus: run.publish_status,
      verificationStatus: run.verification_status,
      publishError: run.publish_error,
    });
    canaryByPlatform.set(run.platform, list);
  }
  const canaryTrend: CanaryTrendByPlatform[] = CORE_PLATFORMS.map((platform) => {
    const runs = canaryByPlatform.get(platform) ?? [];
    const lastFailure = runs.find((r) => r.publishStatus === 'failed') ?? null;
    return { platform, runs, lastFailure };
  });

  // ---- Last 24h failures ----
  const recentFailures: RecentFailureRow[] = recent24h.map((row) => ({
    legId: row.id,
    postId: row.post_id,
    clientId: row.scheduled_posts?.clients?.id ?? null,
    clientName: row.scheduled_posts?.clients?.name ?? null,
    platform: row.social_profiles?.platform ?? 'unknown',
    scheduledFor: row.scheduled_at,
    failureReason: row.failure_reason,
    retryCount: row.retry_count ?? 0,
  }));

  // ---- Banner status ----
  const canaryFailedRecently = canaryTrend.some(
    (t) => t.runs[0]?.publishStatus === 'failed',
  );
  const total24hFailures = recentFailures.length;
  let banner: PublishHealthSnapshot['banner'];
  if (canaryFailedRecently) {
    const platforms = canaryTrend
      .filter((t) => t.runs[0]?.publishStatus === 'failed')
      .map((t) => t.platform);
    banner = {
      status: 'incident',
      headline: `Pipeline degraded on ${platforms.join(', ')}`,
      detail: 'Latest synthetic canary failed. Investigate before client posts land in this window.',
    };
  } else if (total24hFailures > 5) {
    banner = {
      status: 'degraded',
      headline: `${total24hFailures} legs failed in the last 24h`,
      detail: 'Above the noise floor. Check the failures table for a common error pattern.',
    };
  } else if (total24hFailures > 0) {
    banner = {
      status: 'healthy',
      headline: `${total24hFailures} leg${total24hFailures === 1 ? '' : 's'} failed in the last 24h`,
      detail: 'Within typical noise floor. Triage the table if a client flags something.',
    };
  } else {
    banner = {
      status: 'healthy',
      headline: 'All systems healthy',
      detail: 'No failed legs in the last 24h and every canary is green.',
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    summary7d,
    summary30d,
    daily30d,
    topFailingClients,
    canaryTrend,
    recentFailures,
    banner,
  };
}

function summarize(buckets: PerPlatformDailyCounts[]): PerPlatformSummary[] {
  return CORE_PLATFORMS.map((platform) => {
    const totals = buckets.reduce(
      (acc, bucket) => {
        acc.published += bucket[platform].published;
        acc.failed += bucket[platform].failed;
        return acc;
      },
      { published: 0, failed: 0 },
    );
    const total = totals.published + totals.failed;
    const successRate = total === 0 ? 1 : totals.published / total;
    return {
      platform,
      published: totals.published,
      failed: totals.failed,
      successRate,
    };
  });
}
