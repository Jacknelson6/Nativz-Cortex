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
        <div className="flex h-64 items-center justify-center text-sm text-gray-400">
          No activity data available
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <CardTitle>Activity</CardTitle>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setMode('volume')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
              mode === 'volume'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Volume
          </button>
          <button
            onClick={() => setMode('sentiment')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
              mode === 'sentiment'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
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
                  <stop offset="0%" stopColor="#6366F1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366F1" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="mentions-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#9CA3AF', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#E5E7EB' }}
                dy={8}
              />
              <YAxis
                tick={{ fill: '#9CA3AF', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  fontSize: '13px',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                }}
                labelStyle={{ color: '#374151', fontWeight: 600, marginBottom: 4 }}
              />
              <Area type="monotone" dataKey="views" stroke="none" fill="url(#views-gradient)" />
              <Area type="monotone" dataKey="mentions" stroke="none" fill="url(#mentions-gradient)" />
              <Line
                type="monotone"
                dataKey="views"
                stroke="#6366F1"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: '#6366F1', stroke: '#fff', strokeWidth: 2 }}
                name="Views"
              />
              <Line
                type="monotone"
                dataKey="mentions"
                stroke="#10B981"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#10B981', stroke: '#fff', strokeWidth: 2 }}
                name="Mentions"
              />
            </ComposedChart>
          ) : (
            <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="sentiment-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#9CA3AF', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#E5E7EB' }}
                dy={8}
              />
              <YAxis
                domain={[-1, 1]}
                tick={{ fill: '#9CA3AF', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  fontSize: '13px',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                }}
                labelStyle={{ color: '#374151', fontWeight: 600, marginBottom: 4 }}
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
                activeDot={{ r: 5, fill: '#F59E0B', stroke: '#fff', strokeWidth: 2 }}
                name="Sentiment"
              />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
