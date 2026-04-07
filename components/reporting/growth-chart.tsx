'use client';

import { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ChartDataPoint } from '@/lib/types/reporting';

const metrics = [
  { key: 'views', label: 'Views', color: '#3b82f6' },
  { key: 'engagement', label: 'Engagement', color: '#10b981' },
  { key: 'followers', label: 'Followers gained', color: '#8b5cf6' },
] as const;

type MetricKey = (typeof metrics)[number]['key'];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface GrowthChartProps {
  data: ChartDataPoint[];
  loading: boolean;
}

export function GrowthChart({ data, loading }: GrowthChartProps) {
  const [activeMetric, setActiveMetric] = useState<MetricKey>('views');

  if (loading) {
    return <Skeleton className="h-72" />;
  }

  if (!data?.length) {
    return (
      <Card>
        <p className="text-center text-text-muted py-8">
          No chart data available for this period
        </p>
      </Card>
    );
  }

  const activeColor = metrics.find((m) => m.key === activeMetric)!.color;

  return (
    <Card padding="none">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">Growth over time</h3>
        <div className="inline-flex rounded-lg bg-surface-hover/50 p-1">
          {metrics.map((m) => (
            <button
              key={m.key}
              onClick={() => setActiveMetric(m.key)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                activeMetric === m.key
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-2 pb-4" style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`gradient-${activeMetric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={activeColor} stopOpacity={0.3} />
                <stop offset="100%" stopColor={activeColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tickFormatter={formatNumber}
              tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }}
              axisLine={false}
              tickLine={false}
              width={50}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(15, 15, 25, 0.95)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                fontSize: '12px',
                color: 'rgba(255,255,255,0.85)',
              }}
              labelFormatter={(label) => formatDate(String(label))}
              formatter={(value) => [formatNumber(Number(value ?? 0)), metrics.find((m) => m.key === activeMetric)!.label]}
            />
            <Area
              type="monotone"
              dataKey={activeMetric}
              stroke={activeColor}
              strokeWidth={2}
              fill={`url(#gradient-${activeMetric})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: activeColor }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
