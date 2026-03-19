'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { SPEND_ALLOCATION_DATA } from '../data';

const chartData = SPEND_ALLOCATION_DATA.map((row) => ({
  tier: row.tier,
  'Losers spend': row.losers_spend_pct,
  'Mid-range spend': row.mid_range_spend_pct,
  'Winners spend': row.winners_spend_pct,
}));

export function SpendAllocation() {
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
          <Bar dataKey="Losers spend" stackId="a" fill="#f87171" radius={[0, 0, 0, 0]} />
          <Bar dataKey="Mid-range spend" stackId="a" fill="#fbbf24" />
          <Bar dataKey="Winners spend" stackId="a" fill="#34d399" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
