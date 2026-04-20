'use client';

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const PLATFORM_COLORS: Record<string, string> = {
  facebook: '#1877f2',
  instagram: '#e1306c',
  tiktok: '#22d3ee',
  youtube: '#ef4444',
  linkedin: '#0a66c2',
};
const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
};

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface TotalFollowersChartProps {
  data: Array<Record<string, string | number>>;
  loading?: boolean;
}

export function TotalFollowersChart({ data, loading }: TotalFollowersChartProps) {
  if (loading) return <Skeleton className="h-72" />;
  if (!data?.length) {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-2">Total followers over time</h3>
        <p className="text-sm text-text-muted">No follower history yet — follower counts populate on the next cron sync.</p>
      </Card>
    );
  }

  // Stacked areas, one per platform, ordered so the darkest sits at the
  // bottom of the stack for legibility.
  const platforms = Array.from(
    new Set(
      data.flatMap((row) => Object.keys(row).filter((k) => k !== 'date')),
    ),
  ).sort();

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-primary">Total followers over time</h3>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
            <defs>
              {platforms.map((p) => {
                const c = PLATFORM_COLORS[p] ?? '#60a5fa';
                return (
                  <linearGradient key={p} id={`fc-${p}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={c} stopOpacity={0} />
                  </linearGradient>
                );
              })}
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.55)' }}
              stroke="rgba(255,255,255,0.08)"
            />
            <YAxis
              tickFormatter={formatNumber}
              tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.55)' }}
              stroke="rgba(255,255,255,0.08)"
              width={48}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(15,17,22,0.97)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(d) => formatDate(String(d))}
              formatter={(v, n) => [formatNumber(Number(v) || 0), PLATFORM_LABELS[String(n)] ?? n]}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value) => PLATFORM_LABELS[String(value)] ?? value}
            />
            {platforms.map((p) => {
              const c = PLATFORM_COLORS[p] ?? '#60a5fa';
              return (
                <Area
                  key={p}
                  type="monotone"
                  dataKey={p}
                  stackId="followers"
                  stroke={c}
                  strokeWidth={1.5}
                  fill={`url(#fc-${p})`}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
