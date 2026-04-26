'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { BrandAuditSentimentBreakdown } from '@/lib/brand-audits/types';

interface SelfAuditSentimentDonutProps {
  breakdown: BrandAuditSentimentBreakdown;
  /** Headline number rendered in the donut hole. Omit to render no center label. */
  centerLabel?: { value: string; sub: string } | null;
}

const COLORS: Record<keyof BrandAuditSentimentBreakdown, string> = {
  positive: '#34D399',
  neutral: '#FBBF24',
  negative: '#F87171',
  not_mentioned: '#3F3F46',
};

const LABELS: Record<keyof BrandAuditSentimentBreakdown, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
  not_mentioned: 'Not mentioned',
};

export function SelfAuditSentimentDonut({ breakdown, centerLabel }: SelfAuditSentimentDonutProps) {
  const total =
    breakdown.positive + breakdown.neutral + breakdown.negative + breakdown.not_mentioned;

  const data = (Object.keys(breakdown) as (keyof BrandAuditSentimentBreakdown)[])
    .filter((k) => breakdown[k] > 0)
    .map((k) => ({
      key: k,
      name: LABELS[k],
      value: breakdown[k],
      color: COLORS[k],
    }));

  if (total === 0 || data.length === 0) {
    return (
      <div className="flex h-full min-h-[220px] items-center justify-center text-sm text-text-muted">
        No responses yet
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_auto]">
      <div className="relative h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={56}
              outerRadius={84}
              paddingAngle={2}
              stroke="transparent"
            >
              {data.map((entry) => (
                <Cell key={entry.key} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: 'white',
                fontSize: '12px',
              }}
              formatter={(value, name) => [
                `${value ?? 0} of ${total}`,
                String(name),
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        {centerLabel ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="font-display text-2xl font-semibold text-text-primary">
              {centerLabel.value}
            </div>
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
              {centerLabel.sub}
            </div>
          </div>
        ) : null}
      </div>

      <ul className="space-y-1.5 text-xs">
        {(Object.keys(breakdown) as (keyof BrandAuditSentimentBreakdown)[]).map((k) => {
          const count = breakdown[k];
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <li key={k} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: COLORS[k] }}
                aria-hidden
              />
              <span className="flex-1 text-text-secondary">{LABELS[k]}</span>
              <span className="font-mono text-text-muted">
                {count} · {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
