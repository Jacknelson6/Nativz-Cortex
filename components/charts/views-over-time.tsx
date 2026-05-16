'use client';

import { useEffect, useState } from 'react';
import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingUp, SearchX } from 'lucide-react';
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

interface ChartPoint {
  date: string;
  interest: number;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatTickLabel(d: string) {
  const parts = d.split('-');
  if (parts.length < 3) return d;
  const month = MONTH_LABELS[Number(parts[1]) - 1] ?? parts[1];
  const day = Number(parts[2]);
  return `${month} ${day}`;
}

function formatTooltipLabel(label: unknown): string {
  if (typeof label !== 'string') return '';
  const parts = label.split('-');
  if (parts.length < 3) return label;
  const month = MONTH_LABELS[Number(parts[1]) - 1] ?? parts[1];
  const day = Number(parts[2]);
  const year = parts[0];
  return `${month} ${day}, ${year}`;
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

  if (loading) return <ViewsOverTimeSkeleton />;

  const chartData: ChartPoint[] = (points ?? []).map((p) => ({
    date: p.date,
    interest: p.smoothed,
  }));

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
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: 'var(--accent)' }}
            />
            Trend data{stale ? ', cached' : ''}
          </div>
        )}
      </div>

      {error ? (
        <EmptyTrendsState
          headline="Couldn't load trend data for this query"
          body="The trend data source didn't return a usable response. We'll try again the next time this search is opened."
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
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#2a2f45' }}
                dy={10}
                tickFormatter={formatTickLabel}
                minTickGap={48}
                interval="preserveStartEnd"
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
                labelFormatter={formatTooltipLabel}
                formatter={(value) => [Math.round(Number(value)), 'Search interest']}
              />
              <Area
                type="monotone"
                dataKey="interest"
                stroke="none"
                fill="url(#trends-ot-gradient)"
                tooltipType="none"
              />
              <Line
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
          body="Trend data only surfaces for topics with broad public search interest. Try a more general query if you want a demand line here."
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
