'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';

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
}

export function ViewsOverTime({ searchId, shareToken }: ViewsOverTimeProps) {
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

  const chartData = useMemo(() => points ?? [], [points]);

  if (loading) return <ViewsOverTimeSkeleton />;

  const formatDateLabel = (d: string) => {
    const parts = d.split('-');
    if (parts.length < 3) return d;
    return `${parts[1]}/${parts[2]}`;
  };

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp size={18} className="text-text-muted" />
          <h3 className="text-lg font-semibold tracking-tight text-text-primary">
            Search interest over time
          </h3>
        </div>
        <span className="text-xs text-text-muted">
          Google Trends, last 90 days{stale ? ', cached' : ''}
        </span>
      </div>

      {error ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-text-muted">
          Couldn&apos;t load Google Trends data for this query.
        </div>
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
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={36}
                domain={[0, 100]}
                tickFormatter={(v: number) => String(v)}
              />
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
                formatter={(value, name) => [
                  `${Math.round(Number(value))}`,
                  name === 'smoothed' ? 'Interest (smoothed)' : 'Interest',
                ]}
              />
              <Area
                type="monotone"
                dataKey="smoothed"
                stroke="none"
                fill="url(#trends-ot-gradient)"
                tooltipType="none"
              />
              <Line
                type="monotone"
                dataKey="smoothed"
                stroke="currentColor"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: 'currentColor', stroke: '#1a1d2e', strokeWidth: 2 }}
                name="smoothed"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[200px] items-center justify-center text-sm text-text-muted">
          No Google Trends data for this query.
        </div>
      )}
    </Card>
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
        <div className="h-3 w-32 animate-pulse rounded bg-surface-hover" />
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
