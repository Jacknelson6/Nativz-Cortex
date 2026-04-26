'use client';

import { memo, useMemo } from 'react';
import { ResponsiveContainer, Area, Tooltip, XAxis, YAxis, Line, ComposedChart } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { MetricCard } from '@/lib/types/reporting';

function formatNumber(n: number, suffix = ''): string {
  if (suffix === '%') return `${n.toFixed(2)}%`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface MetricSparklineCardProps {
  label: string;
  card: MetricCard;
  format?: 'number' | 'percent';
  colorClass?: string;
  /**
   * Comparison period series — same length as `card.series`, re-indexed
   * so day N of the compare period aligns with day N of the primary. Rendered
   * as a ghost dashed line beneath the main trend.
   */
  compareSeries?: Array<{ date: string; value: number }>;
  /** Short label for the comparison range, e.g. "vs Feb 23 – Mar 22". */
  compareLabel?: string;
}

function MetricSparklineCardImpl({
  label,
  card,
  format = 'number',
  colorClass = 'var(--accent-text)',
  compareSeries,
  compareLabel,
}: MetricSparklineCardProps) {
  const suffix = format === 'percent' ? '%' : '';
  const change = card.changePercent;
  const hasSeries = card.series.length > 1;
  // Suppress the delta chip when the comparison is meaningless:
  //  - prior period had zero (any current value reads as "+∞%")
  //  - <4 days of series (not enough for a weekly read)
  //  - prior period was < 10% of current (almost certainly missing historical
  //    coverage, not a real 10× spike — shows up as +900%+ which looks like a
  //    bug. Happens when the account was connected mid-window or Zernio's
  //    retention didn't reach that far back).
  const priorCoverageLooksShort =
    card.previousTotal > 0 && card.total > 0 && card.previousTotal / card.total < 0.1;
  const showDelta =
    change !== 0 &&
    card.previousTotal !== 0 &&
    card.series.length >= 4 &&
    !priorCoverageLooksShort;

  const gradientId = `grad-${label.replace(/\s/g, '-')}`;

  // Join compare series onto primary rows by ordinal index — day 1 of the
  // compare period aligns with day 1 of the primary window visually, so the
  // two lines read "this period vs. same day-count last period" at a glance.
  const mergedRows = useMemo(() => {
    if (!compareSeries || compareSeries.length === 0) {
      return card.series.map((p) => ({ ...p, compare: null as number | null }));
    }
    return card.series.map((p, i) => ({
      ...p,
      compare: compareSeries[i]?.value ?? null,
    }));
  }, [card.series, compareSeries]);

  const hasCompare = Boolean(compareSeries && compareSeries.length > 0);

  return (
    <Card className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-text-muted">{label}</p>
        {showDelta && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
              change >= 0
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-red-500/10 text-red-400'
            }`}
          >
            {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {change >= 0 ? '+' : ''}
            {change.toFixed(1)}%
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-semibold tracking-tight text-text-primary tabular-nums font-display">
          {formatNumber(card.total, suffix)}
        </p>
        {compareLabel && (
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-text-muted tabular-nums">
            <span className="inline-block h-[2px] w-3 border-t border-dashed border-text-muted/60" />
            {formatNumber(card.previousTotal, suffix)}
            <span className="text-text-muted/60">· {compareLabel}</span>
          </p>
        )}
      </div>
      {hasSeries && (
        <div className="h-24 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={mergedRows}
              margin={{ top: 6, bottom: 0, left: 0, right: 0 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colorClass} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={colorClass} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                interval={0}
                height={16}
                tickMargin={4}
                tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                tickFormatter={(d: string) => {
                  const date = new Date(d + 'T00:00:00');
                  return String(date.getDate());
                }}
              />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip
                cursor={{ stroke: 'var(--nz-line)', strokeWidth: 1 }}
                content={(t) => {
                  const first = t.payload?.[0];
                  if (!first) return null;
                  const date = String(first.payload?.date ?? '');
                  const value = Number(first.value) || 0;
                  const compareVal = hasCompare
                    ? Number(first.payload?.compare ?? NaN)
                    : NaN;
                  return (
                    <div
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--nz-line)',
                        borderRadius: 10,
                        padding: '8px 10px',
                        fontSize: 13,
                        boxShadow: 'var(--shadow-card-hover)',
                      }}
                    >
                      <div style={{ color: 'var(--text-muted)', marginBottom: 3, fontSize: 12 }}>
                        {formatDate(date)}
                      </div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
                        {formatNumber(value, suffix)} {label.toLowerCase()}
                      </div>
                      {Number.isFinite(compareVal) && (
                        <div
                          style={{
                            marginTop: 4,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            color: 'var(--text-muted)',
                            fontSize: 12,
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-block',
                              width: 12,
                              borderTop: '1px dashed var(--text-muted)',
                            }}
                          />
                          {formatNumber(compareVal, suffix)} prior
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              {hasCompare && (
                <Line
                  type="linear"
                  dataKey="compare"
                  stroke="var(--text-muted)"
                  strokeWidth={1.25}
                  strokeDasharray="3 3"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              )}
              <Area
                type="linear"
                dataKey="value"
                stroke={colorClass}
                strokeWidth={1.5}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{
                  r: 3,
                  fill: colorClass,
                  stroke: 'var(--background)',
                  strokeWidth: 1.5,
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

export const MetricSparklineCard = memo(MetricSparklineCardImpl);
