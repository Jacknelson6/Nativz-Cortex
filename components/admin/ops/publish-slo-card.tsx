'use client';

import { Target } from 'lucide-react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { IconCard } from '@/components/ui/icon-card';
import { SLO_WINDOW_MINUTES, sloRatio, type PublishSloDailyRow } from '@/lib/ops/publish-slo';

interface Props {
  rows: PublishSloDailyRow[];
}

/**
 * Daily SLO trend strip. Each row in `rows` is one Chicago-local day;
 * the chart plots the ratio of in-window publishes (≤ 5 min after
 * `scheduled_at`) to all scheduled posts that day. A flat 100% line is
 * the goal; dips correlate with stuck-publishing incidents that the
 * stuck-publishing alert (verify-published-posts cron) catches in
 * real time.
 *
 * The top-row stat block summarizes the most-recent day's bucket
 * because that's what ops cares about glancing at first thing — "did
 * yesterday hold?" Trend chart underneath is for context.
 */
export function PublishSloCard({ rows }: Props) {
  const recent = rows[rows.length - 1];
  const ratio = recent ? sloRatio(recent) : 1;
  const pct = (ratio * 100).toFixed(ratio === 1 ? 0 : 1);
  const tone =
    ratio >= 0.99
      ? 'text-emerald-300'
      : ratio >= 0.95
        ? 'text-amber-300'
        : 'text-rose-300';

  const chartData = rows.map((r) => ({
    date: r.day.slice(5),
    ratio: Math.round(sloRatio(r) * 1000) / 10,
    total: r.total,
    late: r.published_late,
    failed: r.failed_or_partial,
    stuck: r.stuck,
  }));

  return (
    <IconCard
      icon={<Target size={16} />}
      title="Publish SLO"
      helpText={`Share of scheduled posts that publish within ${SLO_WINDOW_MINUTES} minutes of scheduled_at, bucketed by Chicago-local day. Rolled up nightly from publish-slo-rollup cron.`}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-nativz-border bg-surface px-4 py-3 md:col-span-2">
          <div className="text-[11px] uppercase tracking-wide text-text-muted">
            Yesterday
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <div className={`text-xl font-semibold ${tone}`}>{pct}%</div>
            <div className="text-[11px] text-text-muted">in window</div>
          </div>
          {recent ? (
            <div className="mt-1 text-[11px] text-text-muted">
              {recent.published_in_window} / {recent.total} on time
            </div>
          ) : (
            <div className="mt-1 text-[11px] text-text-muted">
              No data yet, run the rollup
            </div>
          )}
        </div>
        <div className="rounded-xl border border-nativz-border bg-surface px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-text-muted">
            Late
          </div>
          <div className="mt-1 text-xl font-semibold text-amber-300">
            {recent?.published_late ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-nativz-border bg-surface px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-text-muted">
            Failed
          </div>
          <div className="mt-1 text-xl font-semibold text-rose-300">
            {recent?.failed_or_partial ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-nativz-border bg-surface px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-text-muted">
            Stuck
          </div>
          <div className="mt-1 text-xl font-semibold text-text-primary">
            {recent?.stuck ?? 0}
          </div>
        </div>
      </div>
      <div className="mt-4 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
            />
            <YAxis
              domain={[0, 100]}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
              width={36}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(15,17,21,0.95)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: number | undefined, name: string | undefined) => {
                const v = value ?? 0;
                if (name === 'ratio') return [`${v.toFixed(1)}%`, 'In window'];
                return [v, name ?? ''];
              }}
            />
            <Line
              type="monotone"
              dataKey="ratio"
              stroke="#34d399"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </IconCard>
  );
}
