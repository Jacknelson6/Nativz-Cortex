'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { PORTFOLIO_BREAKDOWN_DATA } from '../data';

const chartData = PORTFOLIO_BREAKDOWN_DATA.map((row) => ({
  tier: row.tier,
  'Losers (< 28 days)': row.losers_pct,
  'Mid-range (≥ 28 days)': row.mid_range_pct,
  'Winners (≥ 10× median)': row.winners_pct,
}));

export function PortfolioBreakdown() {
  return (
    <div className="w-full h-[360px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 20, bottom: 0, left: 10 }}
        >
          <XAxis
            type="number"
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="tier"
            width={110}
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-nativz-border)',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            formatter={(value: number | undefined) => `${value ?? 0}%`}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
          />
          <Bar dataKey="Losers (< 28 days)" stackId="a" fill="#f87171" radius={[0, 0, 0, 0]} />
          <Bar dataKey="Mid-range (≥ 28 days)" stackId="a" fill="#fbbf24" />
          <Bar dataKey="Winners (≥ 10× median)" stackId="a" fill="#34d399" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
