'use client';

import { useMemo, useState } from 'react';
import { ResponsiveContainer, Area, Tooltip, XAxis, YAxis, Line, ComposedChart } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { MetricCard, TimelinePost } from '@/lib/types/reporting';

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
  /** Posts published in the window — rendered as markers along the line. */
  posts?: TimelinePost[];
  /**
   * Comparison period series — same length as `card.series`, re-indexed
   * so day N of the compare period aligns with day N of the primary. Rendered
   * as a ghost dashed line beneath the main trend.
   */
  compareSeries?: Array<{ date: string; value: number }>;
  /** Short label for the comparison range, e.g. "vs Feb 23 – Mar 22". */
  compareLabel?: string;
}

export function MetricSparklineCard({
  label,
  card,
  format = 'number',
  colorClass = '#60a5fa',
  posts = [],
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
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  // date → first post on that day. Multiple posts/day collapse so markers
  // don't stack.
  const postsByDate = useMemo(() => {
    const m = new Map<string, TimelinePost>();
    for (const p of posts) if (!m.has(p.date)) m.set(p.date, p);
    return m;
  }, [posts]);

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

  type DotProps = {
    cx?: number;
    cy?: number;
    payload?: { date?: string };
  };

  // Overlay markers: a filled ring on the trend line at every post-publish
  // date. The 9:16 thumbnail lives in the hover tooltip, not on the line
  // itself, keeping the sparkline readable.
  const renderDot = (props: DotProps) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null || !payload?.date) return <g />;
    const post = postsByDate.get(payload.date);
    if (!post) return <g />;
    const isHovered = hoveredDate === payload.date;
    const r = isHovered ? 5 : 4;
    const inner = (
      <g className={post.postUrl ? 'cursor-pointer' : undefined}>
        <circle cx={cx} cy={cy} r={r + 2} fill={colorClass} opacity={0.22} />
        <circle cx={cx} cy={cy} r={r} fill={colorClass} stroke="#0f1116" strokeWidth={1.5} />
      </g>
    );
    return post.postUrl ? (
      <a href={post.postUrl} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    ) : (
      inner
    );
  };

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
        <p className="text-2xl font-semibold text-text-primary tabular-nums">
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
        <div className="h-20 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={mergedRows}
              margin={{ top: 6, bottom: 0, left: 0, right: 0 }}
              onMouseMove={(s) => {
                const d = s?.activeLabel;
                setHoveredDate(typeof d === 'string' ? d : null);
              }}
              onMouseLeave={() => setHoveredDate(null)}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colorClass} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={colorClass} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip
                cursor={{ stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1 }}
                content={(t) => {
                  const first = t.payload?.[0];
                  if (!first) return null;
                  const date = String(first.payload?.date ?? '');
                  const value = Number(first.value) || 0;
                  const post = postsByDate.get(date);
                  return (
                    <div
                      style={{
                        background: 'rgba(15,17,22,0.97)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 10,
                        padding: post ? 10 : '8px 10px',
                        fontSize: 13,
                        maxWidth: 260,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      }}
                    >
                      <div style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 3, fontSize: 12 }}>
                        {formatDate(date)}
                      </div>
                      <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>
                        {formatNumber(value, suffix)} {label.toLowerCase()}
                      </div>
                      {post && (
                        <div
                          style={{
                            marginTop: 8,
                            display: 'flex',
                            gap: 10,
                            alignItems: 'flex-start',
                          }}
                        >
                          {post.thumbnailUrl && (
                            <img
                              src={post.thumbnailUrl}
                              alt=""
                              style={{
                                width: 44,
                                height: 78,
                                borderRadius: 6,
                                objectFit: 'cover',
                                flexShrink: 0,
                                border: `1px solid ${colorClass}`,
                              }}
                            />
                          )}
                          <div style={{ color: 'rgba(255,255,255,0.8)', lineHeight: 1.4, fontSize: 13 }}>
                            <div style={{ color: colorClass, fontWeight: 600, marginBottom: 3 }}>
                              Post published
                            </div>
                            {post.caption && (
                              <div
                                style={{
                                  display: '-webkit-box',
                                  WebkitLineClamp: 4,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                }}
                              >
                                {post.caption}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              {hasCompare && (
                <Line
                  type="monotone"
                  dataKey="compare"
                  stroke="rgba(255,255,255,0.55)"
                  strokeWidth={1.25}
                  strokeDasharray="3 3"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              )}
              <Area
                type="monotone"
                dataKey="value"
                stroke={colorClass}
                strokeWidth={1.5}
                fill={`url(#${gradientId})`}
                dot={renderDot}
                activeDot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
