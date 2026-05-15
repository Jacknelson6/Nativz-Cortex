'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingUp, SearchX } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils/format';
import type { TopicSearchVideoRow } from '@/lib/scrapers/types';

interface TrendsPoint {
  date: string;
  value: number;
  smoothed: number;
}

interface TrendsResponse {
  trends: {
    fetched_at: string;
    geo: string;
    timeframe: string;
    points: TrendsPoint[];
  };
  cached: boolean;
  stale?: boolean;
}

interface ViewsOverTimeProps {
  searchId: string;
  shareToken?: string;
  /**
   * Optional, when provided we layer a faint "supply" series (count of new
   * videos uploaded per day) behind the Google Trends demand line.
   */
  videos?: TopicSearchVideoRow[];
}

interface MergedPoint {
  date: string;
  interest: number | null;
  videoCount: number | null;
}

function smoothCounts(counts: { date: string; count: number }[], window = 7) {
  if (counts.length === 0) return counts.map((c) => ({ ...c, smoothed: 0 }));
  return counts.map((c, i) => {
    const start = Math.max(0, i - Math.floor(window / 2));
    const end = Math.min(counts.length, i + Math.ceil(window / 2));
    const slice = counts.slice(start, end);
    const avg = slice.reduce((s, w) => s + w.count, 0) / slice.length;
    return { ...c, smoothed: Math.round(avg * 10) / 10 };
  });
}

export function ViewsOverTime({ searchId, shareToken, videos }: ViewsOverTimeProps) {
  const [points, setPoints] = useState<TrendsPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const url = shareToken
          ? `/api/search/${searchId}/google-trends?token=${encodeURIComponent(shareToken)}`
          : `/api/search/${searchId}/google-trends`;
        const res = await fetch(url);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Trends fetch failed (${res.status})`);
        }
        const data = (await res.json()) as TrendsResponse;
        if (cancelled) return;
        setPoints(data.trends?.points ?? []);
        setStale(Boolean(data.stale));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load trends');
        setPoints([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [searchId, shareToken]);

  const videoSupplyByDate = useMemo(() => {
    if (!videos || videos.length === 0) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const v of videos) {
      if (!v.publish_date) continue;
      const day = v.publish_date.slice(0, 10);
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    const sorted = Array.from(counts.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const smoothed = smoothCounts(sorted, 7);
    return new Map(smoothed.map((p) => [p.date, p.smoothed]));
  }, [videos]);

  const chartData = useMemo<MergedPoint[]>(() => {
    const trendsPoints = points ?? [];
    if (trendsPoints.length === 0) return [];
    return trendsPoints.map((p) => ({
      date: p.date,
      interest: p.smoothed,
      videoCount: videoSupplyByDate.get(p.date) ?? null,
    }));
  }, [points, videoSupplyByDate]);

  const hasSupply = videoSupplyByDate.size > 0;
  const maxSupply = useMemo(() => {
    if (!hasSupply) return 0;
    return Math.max(...Array.from(videoSupplyByDate.values()));
  }, [videoSupplyByDate, hasSupply]);

  if (loading) return <ViewsOverTimeSkeleton />;

  const formatDateLabel = (d: string) => {
    const parts = d.split('-');
    if (parts.length < 3) return d;
    return `${parts[1]}/${parts[2]}`;
  };

  const hasChart = !error && chartData.length > 0;

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp size={18} className="text-text-muted" />
          <h3 className="text-lg font-semibold tracking-tight text-text-primary">
            Search interest over time
          </h3>
        </div>
        {hasChart && (
          <div className="flex items-center gap-3 text-xs text-text-muted">
            {hasSupply && (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-text-muted/40" />
                Videos per day
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: 'var(--accent)' }}
              />
              Google Trends{stale ? ', cached' : ''}
            </span>
          </div>
        )}
      </div>

      {error ? (
        <EmptyTrendsState
          headline="Couldn't load Google Trends for this query"
          body="The Trends endpoint didn't return a usable response. We'll try again the next time this search is opened."
        />
      ) : chartData.length > 0 ? (
        <div className="animate-fade-in" style={{ color: 'var(--accent)' }}>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="trends-ot-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="currentColor" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#2a2f45' }}
                dy={8}
                tickFormatter={formatDateLabel}
                minTickGap={32}
              />
              <YAxis
                yAxisId="interest"
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={36}
                domain={[0, 100]}
                tickFormatter={(v: number) => String(v)}
              />
              {hasSupply && (
                <YAxis
                  yAxisId="supply"
                  orientation="right"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  domain={[0, Math.max(4, Math.ceil(maxSupply * 1.2))]}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(0)}k` : formatNumber(v)
                  }
                />
              )}
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1d2e',
                  border: '1px solid #2a2f45',
                  borderRadius: '8px',
                  fontSize: '13px',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)',
                  color: '#f1f5f9',
                }}
                labelStyle={{ color: '#f1f5f9', fontWeight: 600, marginBottom: 4 }}
                formatter={(value, name) => {
                  if (value === null || value === undefined) return ['—', name];
                  if (name === 'interest') return [Math.round(Number(value)), 'Search interest'];
                  if (name === 'videoCount') return [Math.round(Number(value) * 10) / 10, 'Videos per day'];
                  return [String(value), name];
                }}
              />
              {hasSupply && (
                <Bar
                  yAxisId="supply"
                  dataKey="videoCount"
                  fill="#64748b"
                  fillOpacity={0.18}
                  name="videoCount"
                  isAnimationActive={false}
                />
              )}
              <Area
                yAxisId="interest"
                type="monotone"
                dataKey="interest"
                stroke="none"
                fill="url(#trends-ot-gradient)"
                tooltipType="none"
              />
              <Line
                yAxisId="interest"
                type="monotone"
                dataKey="interest"
                stroke="currentColor"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: 'currentColor', stroke: '#1a1d2e', strokeWidth: 2 }}
                name="interest"
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyTrendsState
          headline="Not enough search volume to chart"
          body="Google Trends only returns a signal for topics with broad public search interest. Try a more general query if you want a demand line here."
        />
      )}
    </Card>
  );
}

function EmptyTrendsState({ headline, body }: { headline: string; body: string }) {
  return (
    <div className="flex h-[200px] flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-hover">
        <SearchX size={18} className="text-text-muted" />
      </div>
      <p className="text-sm font-medium text-text-primary">{headline}</p>
      <p className="max-w-sm text-xs leading-relaxed text-text-muted">{body}</p>
    </div>
  );
}

/**
 * Loading skeleton — same wrapper padding, header row, y-axis column width,
 * and 200px chart area as the real card.
 */
export function ViewsOverTimeSkeleton() {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="h-[18px] w-[18px] animate-pulse rounded bg-surface-hover" />
          <div className="h-5 w-44 animate-pulse rounded bg-surface-hover" />
        </div>
        <div className="h-3 w-40 animate-pulse rounded bg-surface-hover" />
      </div>
      <div className="flex h-[200px] gap-2">
        <div className="flex w-9 flex-col justify-between py-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-2.5 w-6 animate-pulse rounded bg-surface-hover" />
          ))}
        </div>
        <div className="relative flex-1 overflow-hidden rounded-md">
          <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-surface-hover to-transparent opacity-60" />
          <div className="absolute inset-x-0 bottom-6 flex items-end gap-1 px-1">
            {Array.from({ length: 24 }).map((_, i) => {
              const heights = [18, 22, 30, 24, 40, 55, 38, 28, 36, 60, 48, 32, 42, 70, 58, 44, 52, 80, 68, 50, 46, 38, 30, 22];
              return (
                <div
                  key={i}
                  className="flex-1 animate-pulse rounded-sm bg-surface-hover"
                  style={{ height: `${heights[i]}%` }}
                />
              );
            })}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex justify-between px-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-2.5 w-8 animate-pulse rounded bg-surface-hover" />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
