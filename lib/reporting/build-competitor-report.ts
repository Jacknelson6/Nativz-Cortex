import { createAdminClient } from '@/lib/supabase/admin';
import type {
  CompetitorReportCadence,
  CompetitorReportCompetitor,
  CompetitorReportData,
  CompetitorReportPlatform,
  CompetitorReportTopPost,
} from './competitor-report-types';

const CADENCE_DAYS: Record<CompetitorReportCadence, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

export function nextRunAt(from: Date, cadence: CompetitorReportCadence): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + CADENCE_DAYS[cadence]);
  return d;
}

export function periodStartFor(end: Date, cadence: CompetitorReportCadence): Date {
  const d = new Date(end);
  d.setUTCDate(d.getUTCDate() - CADENCE_DAYS[cadence]);
  return d;
}

interface BuildParams {
  subscriptionId: string;
  clientId: string;
  organizationId: string | null;
  cadence: CompetitorReportCadence;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Assemble the structured payload the email template + PDF adapter render.
 * Reads the latest snapshot per (benchmark, competitor) inside the period
 * plus the sparkline series from the 12 most recent snapshots. Returns
 * `null` if the client has no active benchmarks — the caller should treat
 * this as a no-op.
 */
export async function buildCompetitorReportData(
  params: BuildParams,
): Promise<CompetitorReportData | null> {
  const admin = createAdminClient();

  const [{ data: clientRow }, { data: benchmarks }] = await Promise.all([
    admin
      .from('clients')
      .select('id, name, agency, organization_id')
      .eq('id', params.clientId)
      .single(),
    admin
      .from('client_benchmarks')
      .select('id, client_id, is_active')
      .eq('client_id', params.clientId)
      .eq('is_active', true),
  ]);

  if (!clientRow) return null;
  if (!benchmarks || benchmarks.length === 0) {
    return {
      subscription_id: params.subscriptionId,
      client_id: clientRow.id,
      client_name: clientRow.name,
      client_agency: clientRow.agency ?? 'nativz',
      organization_id: clientRow.organization_id ?? params.organizationId,
      cadence: params.cadence,
      period_start: params.periodStart.toISOString(),
      period_end: params.periodEnd.toISOString(),
      competitors: [],
      generated_at: new Date().toISOString(),
    };
  }

  const benchmarkIds = benchmarks.map((b) => b.id);

  // Fetch every snapshot that could feed either the headline row or the
  // sparkline series. 180 days × N competitors is tractable; we filter
  // per-competitor client-side.
  const lookbackStart = new Date();
  lookbackStart.setUTCDate(lookbackStart.getUTCDate() - 180);

  const { data: snapshots } = await admin
    .from('benchmark_snapshots')
    .select(
      'benchmark_id, platform, username, profile_url, display_name, followers, posts_count, avg_views, engagement_rate, posting_frequency, followers_delta, posts_count_delta, avg_views_delta, engagement_rate_delta, new_posts, scrape_error, captured_at',
    )
    .in('benchmark_id', benchmarkIds)
    .gte('captured_at', lookbackStart.toISOString())
    .order('captured_at', { ascending: false });

  const competitorBuckets = new Map<string, CompetitorReportCompetitor>();
  const sparklineBuckets = new Map<string, Array<{ captured_at: string; followers: number | null }>>();

  for (const snap of snapshots ?? []) {
    const key = `${snap.platform}:${snap.username}`;

    // Sparkline — all snapshots; we'll trim to 12 at the end.
    const series = sparklineBuckets.get(key) ?? [];
    series.push({ captured_at: snap.captured_at, followers: snap.followers });
    sparklineBuckets.set(key, series);

    // Headline: the most recent snapshot for this (platform, username) inside
    // the period window.
    if (competitorBuckets.has(key)) continue;
    const capturedAt = new Date(snap.captured_at);
    if (capturedAt < params.periodStart || capturedAt > params.periodEnd) continue;

    const newPosts = Array.isArray(snap.new_posts)
      ? (snap.new_posts as unknown[])
          .slice(0, 3)
          .map((p): CompetitorReportTopPost => {
            const o = (p as Record<string, unknown>) ?? {};
            return {
              id: typeof o.id === 'string' ? o.id : undefined,
              url: typeof o.url === 'string' ? o.url : undefined,
              thumbnail_url:
                typeof o.thumbnail_url === 'string' ? o.thumbnail_url : null,
              description:
                typeof o.description === 'string' ? o.description.slice(0, 140) : undefined,
              views: typeof o.views === 'number' ? o.views : null,
              likes: typeof o.likes === 'number' ? o.likes : null,
              comments: typeof o.comments === 'number' ? o.comments : null,
              publish_date:
                typeof o.publish_date === 'string' ? o.publish_date : null,
            };
          })
      : [];

    competitorBuckets.set(key, {
      username: snap.username,
      display_name: snap.display_name,
      platform: snap.platform as CompetitorReportPlatform,
      profile_url: snap.profile_url,
      followers: snap.followers,
      followers_delta: snap.followers_delta,
      posts_count: snap.posts_count,
      posts_count_delta: snap.posts_count_delta,
      avg_views: snap.avg_views != null ? Number(snap.avg_views) : null,
      avg_views_delta:
        snap.avg_views_delta != null ? Number(snap.avg_views_delta) : null,
      engagement_rate:
        snap.engagement_rate != null ? Number(snap.engagement_rate) : null,
      engagement_rate_delta:
        snap.engagement_rate_delta != null ? Number(snap.engagement_rate_delta) : null,
      posting_frequency: snap.posting_frequency,
      top_posts: newPosts,
      follower_series: [],
      snapshot_captured_at: snap.captured_at,
      scrape_error: snap.scrape_error,
    });
  }

  for (const [key, competitor] of competitorBuckets) {
    const series = (sparklineBuckets.get(key) ?? [])
      .slice(0, 12)
      .reverse();
    competitor.follower_series = series;
  }

  return {
    subscription_id: params.subscriptionId,
    client_id: clientRow.id,
    client_name: clientRow.name,
    client_agency: clientRow.agency ?? 'nativz',
    organization_id: clientRow.organization_id ?? params.organizationId,
    cadence: params.cadence,
    period_start: params.periodStart.toISOString(),
    period_end: params.periodEnd.toISOString(),
    competitors: [...competitorBuckets.values()],
    generated_at: new Date().toISOString(),
  };
}
