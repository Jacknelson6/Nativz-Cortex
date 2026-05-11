'use client';

// ZNA-02: small pill that summarizes the delta-vs-prior-window for a single
// metric, plus a tiny sparkline of the underlying values.

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import type { DeltaResult, RangeKey } from '@/lib/analytics/types';

interface Props {
  delta: DeltaResult;
  sparkline: number[];
  range: RangeKey;
}

function rangeLabel(range: RangeKey): string {
  if (range === '7d') return 'prior 7 days';
  if (range === '30d') return 'prior 30 days';
  if (range === '90d') return 'prior 90 days';
  return 'prior 30 days';
}

function metricLabel(metric: DeltaResult['metric']): string {
  if (metric === 'followers') return 'followers';
  if (metric === 'views_rolling_7d') return 'views';
  return 'engagements';
}

export function ZernioDeltaCallout({ delta, sparkline, range }: Props) {
  const sparkData = sparkline.map((value, i) => ({ i, value }));
  const sign = delta.delta_pct ?? 0;
  const Icon = delta.suppressed
    ? Minus
    : sign > 0
      ? ArrowUpRight
      : sign < 0
        ? ArrowDownRight
        : Minus;
  const color = delta.suppressed
    ? 'text-white/50'
    : sign > 0
      ? 'text-emerald-400'
      : sign < 0
        ? 'text-red-400'
        : 'text-white/50';

  return (
    <div className="inline-flex items-center gap-2 h-7 px-2.5 rounded-full bg-white/5 border border-white/5">
      <Icon className={`h-3.5 w-3.5 ${color}`} />
      <span className={`text-xs ${color}`}>
        {delta.suppressed
          ? 'Not enough data vs prior window'
          : `${sign > 0 ? '+' : ''}${(sign).toFixed(1)}% ${metricLabel(delta.metric)} vs ${rangeLabel(range)}`}
      </span>
      {sparkData.length > 1 && (
        <div className="w-14 h-5">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData}>
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#60a5fa"
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
