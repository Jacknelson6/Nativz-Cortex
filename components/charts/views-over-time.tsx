'use client';

import { useMemo } from 'react';
import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartLine } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils/format';
import type { TopicSearchVideoRow } from '@/lib/scrapers/types';

interface DayPoint {
  date: string;
  views: number;
}

interface ViewsOverTimeProps {
  videos: TopicSearchVideoRow[];
}

export function ViewsOverTime({ videos }: ViewsOverTimeProps) {
  const chartData = useMemo<DayPoint[]>(() => {
    const byDate = new Map<string, number>();
    for (const v of videos) {
      if (!v.publish_date) continue;
      const day = v.publish_date.slice(0, 10);
      byDate.set(day, (byDate.get(day) ?? 0) + (v.views ?? 0));
    }
    return Array.from(byDate.entries())
      .map(([date, views]) => ({ date, views }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [videos]);

  if (videos.length === 0) return null;

  const formatDateLabel = (d: string) => {
    const parts = d.split('-');
    if (parts.length < 3) return d;
    return `${parts[1]}/${parts[2]}`;
  };

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <ChartLine size={18} className="text-text-muted" />
        <h3 className="text-lg font-semibold tracking-tight text-text-primary">Views over time</h3>
      </div>

      {chartData.length > 0 ? (
        <div className="animate-fade-in" style={{ color: 'var(--accent)' }}>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="views-ot-gradient" x1="0" y1="0" x2="0" y2="1">
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
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v))}
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
                formatter={(value) => [formatNumber(value as number), 'Views']}
              />
              <Area
                type="monotone"
                dataKey="views"
                stroke="none"
                fill="url(#views-ot-gradient)"
                tooltipType="none"
              />
              <Line
                type="monotone"
                dataKey="views"
                stroke="currentColor"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: 'currentColor', stroke: '#1a1d2e', strokeWidth: 2 }}
                name="Views"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[200px] items-center justify-center text-sm text-text-muted">
          No date data available
        </div>
      )}
    </Card>
  );
}
