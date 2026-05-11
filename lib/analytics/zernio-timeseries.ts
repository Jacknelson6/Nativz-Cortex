// ZNA-02: load + transform platform_snapshots into a chart-ready timeseries.
// Reads only — never writes. Gap-fills a daily spine so the X axis stays
// continuous, dedupes multi-run days (keeps latest captured_at), and rolls
// the views + engagements signals as 7-day means.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AnalyticsPlatform,
  RangeKey,
  TimeseriesPoint,
  TimeseriesResult,
  TimeseriesSource,
  AnalyticsSource,
} from '@/lib/analytics/types';

const DAY_MS = 24 * 60 * 60 * 1000;

function rangeDays(range: RangeKey): number {
  // 'all' caps to 90d per D-05.
  if (range === '7d') return 7;
  if (range === '30d') return 30;
  return 90;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

interface SnapshotRow {
  snapshot_date: string;
  followers_count: number | null;
  views_count: number | null;
  engagement_count: number | null;
  source: AnalyticsSource | null;
  captured_at: string;
}

export function aggregateSource(rows: { source: AnalyticsSource | null }[]): TimeseriesSource {
  if (rows.length === 0) return 'none';
  const seen = new Set<string>();
  for (const r of rows) if (r.source) seen.add(r.source);
  if (seen.size === 0) return 'none';
  if (seen.size === 1) return Array.from(seen)[0] as AnalyticsSource;
  return 'mixed';
}

// Exported for tests: pure function. Builds a continuous daily spine,
// dedupes by captured_at, gap-fills followers from the previous day, and
// computes rolling 7d means for views + engagements.
export function buildTimeseriesPoints(
  rows: SnapshotRow[],
  rangeStart: Date,
  rangeEnd: Date,
): TimeseriesPoint[] {
  // De-dupe: keep latest captured_at per snapshot_date.
  const byDate = new Map<string, SnapshotRow>();
  for (const row of rows) {
    const existing = byDate.get(row.snapshot_date);
    if (!existing || new Date(row.captured_at).getTime() > new Date(existing.captured_at).getTime()) {
      byDate.set(row.snapshot_date, row);
    }
  }

  // Build daily spine.
  const points: TimeseriesPoint[] = [];
  const rawDaily: Array<{ date: string; followers: number; views: number; engagements: number }> = [];
  let lastFollowers = 0;
  for (let t = rangeStart.getTime(); t <= rangeEnd.getTime(); t += DAY_MS) {
    const date = isoDate(new Date(t));
    const row = byDate.get(date);
    const followers = row?.followers_count ?? lastFollowers;
    const views = row?.views_count ?? 0;
    const engagements = row?.engagement_count ?? 0;
    lastFollowers = followers;
    rawDaily.push({ date, followers, views, engagements });
  }

  // Rolling 7d mean for views + engagements. Followers stays as a level.
  for (let i = 0; i < rawDaily.length; i++) {
    const start = Math.max(0, i - 6);
    const window = rawDaily.slice(start, i + 1);
    const viewsSum = window.reduce((a, b) => a + b.views, 0);
    const engagementsSum = window.reduce((a, b) => a + b.engagements, 0);
    points.push({
      date: rawDaily[i].date,
      followers: rawDaily[i].followers,
      views_rolling_7d: Math.round(viewsSum / window.length),
      engagements_rolling_7d: Math.round(engagementsSum / window.length),
    });
  }

  return points;
}

export async function loadZernioTimeseries(args: {
  supabase: SupabaseClient;
  clientId: string;
  platform: AnalyticsPlatform;
  range: RangeKey;
  now?: Date;
}): Promise<TimeseriesResult> {
  const today = args.now ?? todayUtc();
  const days = rangeDays(args.range);
  const rangeEnd = today;
  const rangeStart = new Date(rangeEnd.getTime() - (days - 1) * DAY_MS);
  const startIso = isoDate(rangeStart);
  const endIso = isoDate(rangeEnd);

  // Pull a little before the range to seed the rolling window.
  const fetchStart = new Date(rangeStart.getTime() - 6 * DAY_MS);
  const fetchStartIso = isoDate(fetchStart);

  const { data, error } = await args.supabase
    .from('platform_snapshots')
    .select('snapshot_date, followers_count, views_count, engagement_count, source, captured_at')
    .eq('client_id', args.clientId)
    .eq('platform', args.platform)
    .gte('snapshot_date', fetchStartIso)
    .lte('snapshot_date', endIso)
    .order('snapshot_date', { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as SnapshotRow[];
  // Drop any snapshot in the future (clock drift guard).
  const safe = rows.filter((r) => r.snapshot_date <= endIso);

  // Build a wider points set then slice to the visible range.
  const wide = buildTimeseriesPoints(safe, fetchStart, rangeEnd);
  const points = wide.filter((p) => p.date >= startIso);

  return {
    range_start: startIso,
    range_end: endIso,
    source: aggregateSource(safe.filter((r) => r.snapshot_date >= startIso)),
    points,
  };
}
