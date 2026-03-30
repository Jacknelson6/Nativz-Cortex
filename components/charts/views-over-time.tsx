'use client';

import { useMemo, useState } from 'react';
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
import type { VideoPlatform } from '@/lib/scrapers/types';

type PlatformFilter = 'all' | VideoPlatform;
type TimeRange = '1W' | '2W' | '1M' | '3M' | '6M' | '1Y' | 'MAX';

const PLATFORM_TABS: { value: PlatformFilter; label: string }[] = [
  { value: 'all', label: 'All platforms' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'instagram', label: 'Instagram' },
];

const TIME_RANGES: TimeRange[] = ['1W', '2W', '1M', '3M', '6M', '1Y', 'MAX'];

function getTimeRangeDays(range: TimeRange): number | null {
  switch (range) {
    case '1W': return 7;
    case '2W': return 14;
    case '1M': return 30;
    case '3M': return 90;
    case '6M': return 180;
    case '1Y': return 365;
    case 'MAX': return null;
  }
}

interface DayPoint {
  date: string;
  views: number;
}

interface ViewsOverTimeProps {
  videos: TopicSearchVideoRow[];
}

export function ViewsOverTime({ videos }: ViewsOverTimeProps) {
  const [platform, setPlatform] = useState<PlatformFilter>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('MAX');

  const chartData = useMemo(() => {
    const filtered = platform === 'all' ? videos : videos.filter((v) => v.platform === platform);

    // Group by publish_date, sum views
    const byDate = new Map<string, number>();
    for (const v of filtered) {
      if (!v.publish_date) continue;
      const day = v.publish_date.slice(0, 10);
      byDate.set(day, (byDate.get(day) ?? 0) + (v.views ?? 0));
    }

    let points: DayPoint[] = Array.from(byDate.entries())
      .map(([date, views]) => ({ date, views }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Apply time range filter
    const days = getTimeRangeDays(timeRange);
    if (days !== null && points.length > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      points = points.filter((p) => p.date >= cutoffStr);
    }

    return points;
  }, [videos, platform, timeRange]);

  // Stats
  const stats = useMemo(() => {
    if (chartData.length === 0) return { total: 0, avgDaily: 0, peakDay: '—', peakViews: 0 };
    const total = chartData.reduce((s, p) => s + p.views, 0);
    const avgDaily = Math.round(total / chartData.length);
    let peakDay = chartData[0].date;
    let peakViews = chartData[0].views;
    for (const p of chartData) {
      if (p.views > peakViews) {
        peakDay = p.date;
        peakViews = p.views;
      }
    }
    return { total, avgDaily, peakDay, peakViews };
  }, [chartData]);

  if (videos.length === 0) return null;

  // Format date label for X axis
  const formatDateLabel = (d: string) => {
    const parts = d.split('-');
    if (parts.length < 3) return d;
    return `${parts[1]}/${parts[2]}`;
  };

  return (
    <Card>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex items-center gap-2">
          <ChartLine size={18} className="text-text-muted" />
          <h3 className="text-sm font-bold text-text-primary">Views over time</h3>
        </div>
        <div className="flex gap-1 rounded-lg bg-surface-hover p-1">
          {PLATFORM_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setPlatform(tab.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                platform === tab.value
                  ? 'bg-surface text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 ? (
        <div className="animate-fade-in">
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="views-ot-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.02} />
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
                formatter={(value: number) => [formatNumber(value), 'Views']}
              />
              <Area type="monotone" dataKey="views" stroke="none" fill="url(#views-ot-gradient)" />
              <Line
                type="monotone"
                dataKey="views"
                stroke="#06b6d4"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: '#06b6d4', stroke: '#1a1d2e', strokeWidth: 2 }}
                name="Views"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[200px] items-center justify-center text-sm text-text-muted">
          No date data for this filter
        </div>
      )}

      {/* Time range pills */}
      <div className="flex gap-1.5 mt-4 mb-4 flex-wrap">
        {TIME_RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setTimeRange(r)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
              timeRange === r
                ? 'bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/30'
                : 'bg-surface-hover text-text-muted hover:text-text-secondary'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-surface-hover/50 p-3 text-center">
          <p className="text-xs text-text-muted mb-1">Total views</p>
          <p className="text-sm font-bold text-text-primary">{formatNumber(stats.total)}</p>
        </div>
        <div className="rounded-lg bg-surface-hover/50 p-3 text-center">
          <p className="text-xs text-text-muted mb-1">Avg daily</p>
          <p className="text-sm font-bold text-text-primary">{formatNumber(stats.avgDaily)}</p>
        </div>
        <div className="rounded-lg bg-surface-hover/50 p-3 text-center">
          <p className="text-xs text-text-muted mb-1">Peak day</p>
          <p className="text-sm font-bold text-text-primary">{formatNumber(stats.peakViews)}</p>
          <p className="text-[10px] text-text-muted">{stats.peakDay}</p>
        </div>
      </div>
    </Card>
  );
}
