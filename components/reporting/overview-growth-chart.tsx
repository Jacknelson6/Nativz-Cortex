'use client';

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceDot,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  ChartDataPoint,
  SocialPlatform,
  SummaryReport,
  TimelinePost,
} from '@/lib/types/reporting';

/**
 * NAT-54 — full-width growth chart, stacked by platform with a metric
 * toggle (followers | views | engagement). Post markers drop onto any
 * day that shipped a post so it's visible in the timeline.
 *
 * Data sources are all inside the existing `SummaryReport` returned by
 * `/api/reporting/summary` — no new endpoints.
 */

type MetricKey = 'followers' | 'views' | 'engagement';

const METRIC_OPTIONS: { key: MetricKey; label: string }[] = [
  { key: 'followers', label: 'Followers' },
  { key: 'views', label: 'Views' },
  { key: 'engagement', label: 'Engagement' },
];

// Stable per-platform colors — keeps the stacked series recognisable.
const PLATFORM_COLORS: Record<SocialPlatform, string> = {
  tiktok: '#ff4d67',
  instagram: '#e1306c',
  youtube: '#ef4444',
  facebook: '#60a5fa',
  linkedin: '#0ea5e9',
  googlebusiness: '#34d399',
};

const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  googlebusiness: 'Google Business',
};

interface OverviewGrowthChartProps {
  data: SummaryReport | null;
  loading: boolean;
}

function formatShortDate(s: string): string {
  const d = new Date(`${s}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatValue(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

/**
 * Merge per-platform ChartDataPoint[] into a flat recharts-friendly shape:
 * `[{ date, tiktok: N, instagram: N, ... }, ...]` keyed by the selected
 * metric field.
 */
function buildStackedSeries(
  platformCharts: Record<string, ChartDataPoint[]>,
  metric: MetricKey,
): { rows: Array<Record<string, number | string>>; platforms: SocialPlatform[] } {
  const platforms = Object.keys(platformCharts) as SocialPlatform[];
  const byDate = new Map<string, Record<string, number | string>>();
  for (const platform of platforms) {
    for (const point of platformCharts[platform] ?? []) {
      const existing = byDate.get(point.date) ?? { date: point.date };
      existing[platform] = point[metric] ?? 0;
      byDate.set(point.date, existing);
    }
  }
  // Ensure every platform key exists on every row so Area stacking doesn't
  // gap out when one platform has missing days.
  const sorted = [...byDate.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
  for (const row of sorted) {
    for (const platform of platforms) {
      if (row[platform] == null) row[platform] = 0;
    }
  }
  return { rows: sorted, platforms };
}

/**
 * Followers mode uses `summary.followerChart` which is already flat and
 * per-platform keyed. Just need to enumerate the non-date keys.
 */
function resolveFollowerRows(data: SummaryReport): {
  rows: Array<Record<string, number | string>>;
  platforms: SocialPlatform[];
} {
  const rows = (data.followerChart ?? []) as Array<Record<string, number | string>>;
  const platformSet = new Set<SocialPlatform>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key !== 'date') platformSet.add(key as SocialPlatform);
    }
  }
  return { rows, platforms: [...platformSet] };
}

export function OverviewGrowthChart({ data, loading }: OverviewGrowthChartProps) {
  const [metric, setMetric] = useState<MetricKey>('followers');

  const { rows, platforms } = useMemo(() => {
    if (!data) return { rows: [], platforms: [] as SocialPlatform[] };
    if (metric === 'followers') {
      return resolveFollowerRows(data);
    }
    if (!data.platformCharts) return { rows: [], platforms: [] as SocialPlatform[] };
    return buildStackedSeries(data.platformCharts, metric);
  }, [data, metric]);

  // Post markers: collapse to one marker per day (first post wins — thumbnail
  // lives in the tooltip, so stacking isn't useful visually).
  const postMarkers = useMemo(() => {
    if (!data) return [] as Array<{ date: string; post: TimelinePost }>;
    const seen = new Map<string, TimelinePost>();
    for (const platform of data.platforms) {
      for (const post of platform.posts ?? []) {
        if (!seen.has(post.date)) seen.set(post.date, post);
      }
    }
    return [...seen.entries()].map(([date, post]) => ({ date, post }));
  }, [data]);

  if (loading) {
    return <Skeleton className="h-80 w-full" />;
  }

  if (!data || rows.length === 0) {
    return (
      <Card>
        <p className="py-12 text-center text-text-muted">No growth data for this period.</p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Growth</h2>
          <p className="text-xs text-text-muted">
            Stacked by platform · post markers show publish days
          </p>
        </div>
        <div className="flex items-center rounded-lg border border-nativz-border bg-surface p-0.5">
          {METRIC_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setMetric(opt.key)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                metric === opt.key
                  ? 'bg-accent-surface text-accent-text shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <defs>
              {platforms.map((p) => (
                <linearGradient
                  key={p}
                  id={`growthGrad-${p}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={PLATFORM_COLORS[p]} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={PLATFORM_COLORS[p]} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              stroke="rgba(255,255,255,0.35)"
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              tickFormatter={formatValue}
              stroke="rgba(255,255,255,0.35)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(15,17,22,0.97)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10,
                fontSize: 12,
              }}
              labelFormatter={(v) => formatShortDate(String(v))}
              formatter={(value, name) => {
                const num = typeof value === 'number' ? value : Number(value);
                const platformLabel =
                  PLATFORM_LABELS[name as SocialPlatform] ?? String(name);
                return [formatValue(num), platformLabel];
              }}
            />
            <Legend
              iconType="square"
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(name: string) => PLATFORM_LABELS[name as SocialPlatform] ?? name}
            />
            {platforms.map((p) => (
              <Area
                key={p}
                type="monotone"
                dataKey={p}
                stackId="1"
                stroke={PLATFORM_COLORS[p]}
                strokeWidth={1.5}
                fill={`url(#growthGrad-${p})`}
                isAnimationActive={false}
              />
            ))}
            {postMarkers.map(({ date }) => (
              <ReferenceDot
                key={`marker-${date}`}
                x={date}
                y={0}
                r={3}
                fill="#fbbf24"
                stroke="#0f1116"
                strokeWidth={1.5}
                ifOverflow="extendDomain"
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
