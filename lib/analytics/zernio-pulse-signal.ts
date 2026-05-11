// ZNA-03: build the signal report + high-confidence post list that feed
// the daily LLM pulse. Reads platform_snapshots (14d) and post_metrics
// (7d for triggers, 30d for the baseline ratio). Deterministic.

import type { SupabaseClient } from '@supabase/supabase-js';

export type PulsePlatform = 'tiktok' | 'instagram' | 'facebook' | 'youtube';

const ALL_PLATFORMS: PulsePlatform[] = ['tiktok', 'instagram', 'facebook', 'youtube'];
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_PRIOR_DAYS = 4; // < 4 rows in the prior 7d window => sparse, suppress
const TRIGGER_PCT = 15;

export interface PlatformSignal {
  platform: PulsePlatform;
  followers_current_7d_mean: number;
  followers_prior_7d_mean: number;
  followers_delta_pct: number | null;
  views_rolling_7d_current: number;
  views_rolling_7d_prior: number;
  views_delta_pct: number | null;
  engagements_rolling_7d_current: number;
  engagements_rolling_7d_prior: number;
  engagements_delta_pct: number | null;
  sparse_prior: boolean;
  trend_reversal: boolean;
}

export interface TriggeredGate {
  platform: PulsePlatform | 'cross_platform';
  metric: 'followers' | 'views_rolling_7d' | 'engagements_rolling_7d' | 'trend_reversal';
  value: number | null;
}

export interface SignalReport {
  platforms: PlatformSignal[];
  triggered_gates: TriggeredGate[];
}

export interface HighConfidencePost {
  post_id: string;
  platform: PulsePlatform;
  views: number;
  ratio_to_baseline: number;
  caption_snippet: string;
}

export interface SignalGateInputs {
  supabase: SupabaseClient;
  clientId: string;
  asOfDate: string; // YYYY-MM-DD UTC
}

interface SnapshotRow {
  platform: string;
  snapshot_date: string;
  followers_count: number | null;
  views_count: number | null;
  engagement_count: number | null;
  captured_at?: string;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function safeMean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function deltaPct(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

function sign(n: number | null): -1 | 0 | 1 {
  if (n === null || Number.isNaN(n)) return 0;
  if (n > 0) return 1;
  if (n < 0) return -1;
  return 0;
}

/**
 * Compute one platform's 14d signal. Splits the window into current 7d
 * and prior 7d. Followers uses the daily-mean level; views + engagements
 * use the rolling 7d sums divided by the count of days in each half.
 * Trend reversal compares current_delta vs prior_delta (prior is the
 * 7-day-earlier delta computed identically against the 7-day-prior-prior
 * window, when we have enough data).
 */
function computePlatformSignal(
  platform: PulsePlatform,
  rows: SnapshotRow[],
  asOf: Date,
): PlatformSignal {
  // Group by snapshot_date, dedupe (keep latest captured_at if present).
  const byDate = new Map<string, SnapshotRow>();
  for (const row of rows) {
    const existing = byDate.get(row.snapshot_date);
    if (!existing) {
      byDate.set(row.snapshot_date, row);
      continue;
    }
    if ((row.captured_at ?? '') > (existing.captured_at ?? '')) {
      byDate.set(row.snapshot_date, row);
    }
  }

  // Window bounds (asOf is exclusive of "today" since today's data may be partial).
  const current_end = new Date(asOf);
  const current_start = new Date(current_end.getTime() - 7 * DAY_MS);
  const prior_end = current_start;
  const prior_start = new Date(prior_end.getTime() - 7 * DAY_MS);
  const prior_prior_start = new Date(prior_start.getTime() - 7 * DAY_MS);

  const inRange = (dateStr: string, start: Date, end: Date) => {
    return dateStr >= isoDay(start) && dateStr < isoDay(end);
  };

  const currentRows: SnapshotRow[] = [];
  const priorRows: SnapshotRow[] = [];
  const priorPriorRows: SnapshotRow[] = [];
  for (const [date, row] of byDate.entries()) {
    if (inRange(date, current_start, current_end)) currentRows.push(row);
    else if (inRange(date, prior_start, prior_end)) priorRows.push(row);
    else if (inRange(date, prior_prior_start, prior_start)) priorPriorRows.push(row);
  }

  const followersMean = (rs: SnapshotRow[]) =>
    safeMean(rs.map((r) => r.followers_count ?? 0));
  const viewsMean = (rs: SnapshotRow[]) => safeMean(rs.map((r) => r.views_count ?? 0));
  const engagementsMean = (rs: SnapshotRow[]) =>
    safeMean(rs.map((r) => r.engagement_count ?? 0));

  const followers_current_7d_mean = followersMean(currentRows);
  const followers_prior_7d_mean = followersMean(priorRows);
  const followers_delta_pct = deltaPct(followers_current_7d_mean, followers_prior_7d_mean);
  const followers_prior_prior_mean = followersMean(priorPriorRows);
  const followers_prior_delta = deltaPct(followers_prior_7d_mean, followers_prior_prior_mean);

  const views_rolling_7d_current = viewsMean(currentRows);
  const views_rolling_7d_prior = viewsMean(priorRows);
  const views_delta_pct = deltaPct(views_rolling_7d_current, views_rolling_7d_prior);

  const engagements_rolling_7d_current = engagementsMean(currentRows);
  const engagements_rolling_7d_prior = engagementsMean(priorRows);
  const engagements_delta_pct = deltaPct(
    engagements_rolling_7d_current,
    engagements_rolling_7d_prior,
  );

  const sparse_prior = priorRows.length < MIN_PRIOR_DAYS;

  // Trend reversal: followers delta sign flipped vs the prior period.
  // Only count it if both prior and prior-prior windows have ≥ MIN_PRIOR_DAYS rows.
  let trend_reversal = false;
  if (
    !sparse_prior &&
    priorPriorRows.length >= MIN_PRIOR_DAYS &&
    followers_delta_pct !== null &&
    followers_prior_delta !== null
  ) {
    trend_reversal = sign(followers_delta_pct) !== 0 && sign(followers_delta_pct) !== sign(followers_prior_delta);
  }

  return {
    platform,
    followers_current_7d_mean: round1(followers_current_7d_mean),
    followers_prior_7d_mean: round1(followers_prior_7d_mean),
    followers_delta_pct: round1n(followers_delta_pct),
    views_rolling_7d_current: round1(views_rolling_7d_current),
    views_rolling_7d_prior: round1(views_rolling_7d_prior),
    views_delta_pct: round1n(views_delta_pct),
    engagements_rolling_7d_current: round1(engagements_rolling_7d_current),
    engagements_rolling_7d_prior: round1(engagements_rolling_7d_prior),
    engagements_delta_pct: round1n(engagements_delta_pct),
    sparse_prior,
    trend_reversal,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round1n(n: number | null): number | null {
  if (n === null || Number.isNaN(n)) return null;
  return round1(n);
}

function gatesForPlatform(signal: PlatformSignal): TriggeredGate[] {
  if (signal.sparse_prior) return [];
  const gates: TriggeredGate[] = [];
  if (
    signal.followers_delta_pct !== null &&
    Math.abs(signal.followers_delta_pct) >= TRIGGER_PCT
  ) {
    gates.push({ platform: signal.platform, metric: 'followers', value: signal.followers_delta_pct });
  }
  if (signal.views_delta_pct !== null && Math.abs(signal.views_delta_pct) >= TRIGGER_PCT) {
    gates.push({ platform: signal.platform, metric: 'views_rolling_7d', value: signal.views_delta_pct });
  }
  if (
    signal.engagements_delta_pct !== null &&
    Math.abs(signal.engagements_delta_pct) >= TRIGGER_PCT
  ) {
    gates.push({
      platform: signal.platform,
      metric: 'engagements_rolling_7d',
      value: signal.engagements_delta_pct,
    });
  }
  if (signal.trend_reversal) {
    gates.push({ platform: signal.platform, metric: 'trend_reversal', value: null });
  }
  return gates;
}

export async function buildSignalReport(
  args: SignalGateInputs,
): Promise<SignalReport> {
  const { supabase, clientId, asOfDate } = args;
  const asOf = new Date(`${asOfDate}T00:00:00Z`);
  const start = new Date(asOf.getTime() - 21 * DAY_MS); // need 14d + 7d earlier for prior-prior reversal

  const { data: rows } = await supabase
    .from('platform_snapshots')
    .select('platform, snapshot_date, followers_count, views_count, engagement_count, captured_at')
    .eq('client_id', clientId)
    .gte('snapshot_date', isoDay(start))
    .lt('snapshot_date', asOfDate)
    .order('snapshot_date', { ascending: true });

  const rowsTyped = (rows ?? []) as SnapshotRow[];
  const byPlatform = new Map<PulsePlatform, SnapshotRow[]>();
  for (const p of ALL_PLATFORMS) byPlatform.set(p, []);
  for (const row of rowsTyped) {
    const p = row.platform as PulsePlatform;
    if (!byPlatform.has(p)) continue;
    byPlatform.get(p)!.push(row);
  }

  const platforms: PlatformSignal[] = ALL_PLATFORMS.filter((p) =>
    (byPlatform.get(p) ?? []).length > 0,
  ).map((p) => computePlatformSignal(p, byPlatform.get(p) ?? [], asOf));

  const triggered_gates: TriggeredGate[] = [];
  for (const signal of platforms) {
    triggered_gates.push(...gatesForPlatform(signal));
  }

  return { platforms, triggered_gates };
}

interface PostRow {
  id: string;
  platform: string;
  views_count: number | null;
  caption: string | null;
  published_at: string | null;
}

export async function findHighConfidencePosts(
  args: SignalGateInputs,
): Promise<HighConfidencePost[]> {
  const { supabase, clientId, asOfDate } = args;
  const asOf = new Date(`${asOfDate}T00:00:00Z`);
  const recentStart = new Date(asOf.getTime() - 7 * DAY_MS);
  const baselineStart = new Date(asOf.getTime() - 30 * DAY_MS);

  const { data: recent } = await supabase
    .from('post_metrics')
    .select('id, platform, views_count, caption, published_at')
    .eq('client_id', clientId)
    .gte('published_at', recentStart.toISOString())
    .lte('published_at', asOf.toISOString());

  const { data: baseline } = await supabase
    .from('post_metrics')
    .select('platform, views_count')
    .eq('client_id', clientId)
    .gte('published_at', baselineStart.toISOString())
    .lte('published_at', asOf.toISOString());

  const recentRows = (recent ?? []) as PostRow[];
  const baselineRows = (baseline ?? []) as Array<{ platform: string; views_count: number | null }>;

  const baselineByPlatform = new Map<PulsePlatform, number>();
  for (const p of ALL_PLATFORMS) {
    const rows = baselineRows.filter((r) => r.platform === p);
    const mean = safeMean(rows.map((r) => r.views_count ?? 0));
    baselineByPlatform.set(p, mean);
  }

  const out: HighConfidencePost[] = [];
  for (const row of recentRows) {
    const p = row.platform as PulsePlatform;
    if (!ALL_PLATFORMS.includes(p)) continue;
    const views = row.views_count ?? 0;
    const baselineMean = baselineByPlatform.get(p) ?? 0;
    if (baselineMean <= 0) continue;
    const ratio = views / baselineMean;
    if (ratio < 2.0) continue;
    const caption = (row.caption ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
    out.push({
      post_id: row.id,
      platform: p,
      views,
      ratio_to_baseline: round1(ratio),
      caption_snippet: caption,
    });
  }

  out.sort((a, b) => b.ratio_to_baseline - a.ratio_to_baseline);
  return out.slice(0, 5);
}

// Exposed for tests + cron-fan-out.
export const __test = {
  computePlatformSignal,
  gatesForPlatform,
  TRIGGER_PCT,
  MIN_PRIOR_DAYS,
};
