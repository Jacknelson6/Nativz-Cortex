'use client';

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

interface TrendDataPoint {
  date: string;
  value: number;
}

interface TrendLineProps {
  data: TrendDataPoint[];
  label?: string;
  color?: string;
  yAxisDomain?: [number, number];
  formatValue?: (value: number) => string;
}

export function TrendLine({
  data,
  label = 'Value',
  color = '#6366F1',
  yAxisDomain,
  formatValue,
}: TrendLineProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-400">
        No trend data available
      </div>
    );
  }

  const gradientId = `trend-gradient-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="animate-fade-in">
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="95%" stopColor={color} stopOpacity={0.02} />
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
            domain={yAxisDomain}
            tick={{ fill: '#9CA3AF', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={formatValue}
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
              value !== undefined
                ? (formatValue ? formatValue(value) : value.toLocaleString())
                : '0',
              label,
            ]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="none"
            fill={`url(#${gradientId})`}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2.5}
            dot={false}
            activeDot={{
              r: 5,
              fill: color,
              stroke: '#fff',
              strokeWidth: 2,
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
