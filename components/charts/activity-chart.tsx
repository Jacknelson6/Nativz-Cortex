'use client';

import { useState } from 'react';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
} from 'recharts';
import { Card, CardTitle } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils/format';
import type { ActivityDataPoint } from '@/lib/types/search';

interface ActivityChartProps {
  data: ActivityDataPoint[];
}

type Mode = 'volume' | 'sentiment';

export function ActivityChart({ data }: ActivityChartProps) {
  const [mode, setMode] = useState<Mode>('volume');

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardTitle>Activity</CardTitle>
        <div className="flex h-64 items-center justify-center text-sm text-text-muted">
          No activity data available
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <CardTitle>Activity</CardTitle>
        <div className="flex gap-1 rounded-lg bg-surface-hover p-1">
          <button
            onClick={() => setMode('volume')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
              mode === 'volume'
                ? 'bg-surface text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Volume
          </button>
          <button
            onClick={() => setMode('sentiment')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
              mode === 'sentiment'
                ? 'bg-surface text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Sentiment
          </button>
        </div>
      </div>

      <div className="animate-fade-in">
        <ResponsiveContainer width="100%" height={300}>
          {mode === 'volume' ? (
            <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="views-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#046bd2" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#046bd2" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="mentions-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2f45" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#2a2f45' }}
                dy={8}
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
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
                itemStyle={{ color: '#94a3b8' }}
                formatter={((value: number | undefined, name: string | undefined) => [
                  value !== undefined ? formatNumber(value) : '0',
                  name ?? '',
                ]) as never}
              />
              <Area type="monotone" dataKey="views" stroke="none" fill="url(#views-gradient)" />
              <Area type="monotone" dataKey="mentions" stroke="none" fill="url(#mentions-gradient)" />
              <Line
                type="monotone"
                dataKey="views"
                stroke="#046bd2"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: '#046bd2', stroke: '#1a1d2e', strokeWidth: 2 }}
                name="Views"
              />
              <Line
                type="monotone"
                dataKey="mentions"
                stroke="#10B981"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#10B981', stroke: '#1a1d2e', strokeWidth: 2 }}
                name="Mentions"
              />
            </ComposedChart>
          ) : (
            <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="sentiment-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2f45" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#2a2f45' }}
                dy={8}
              />
              <YAxis
                domain={[-1, 1]}
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v: number) => v.toFixed(1)}
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
                itemStyle={{ color: '#94a3b8' }}
                formatter={(value: number | undefined) => [
                  value !== undefined ? value.toFixed(2) : '0',
                  'Sentiment',
                ]}
              />
              <Area type="monotone" dataKey="sentiment" stroke="none" fill="url(#sentiment-gradient)" />
              <Line
                type="monotone"
                dataKey="sentiment"
                stroke="#F59E0B"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: '#F59E0B', stroke: '#1a1d2e', strokeWidth: 2 }}
                name="Sentiment"
              />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
