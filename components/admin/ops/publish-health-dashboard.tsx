'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  TrendingDown,
} from 'lucide-react';
import { IconCard } from '@/components/ui/icon-card';
import {
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import {
  CORE_PLATFORMS,
  type PublishHealthSnapshot,
} from '@/lib/ops/publish-health';
import type { PublishSloDailyRow } from '@/lib/ops/publish-slo';
import { PublishSloCard } from '@/components/admin/ops/publish-slo-card';

interface Props {
  initialSnapshot: PublishHealthSnapshot;
  sloRows: PublishSloDailyRow[];
}

/**
 * Client wrapper for the publish health dashboard. Owns the 7d/30d toggle
 * state and renders the four widgets (per-platform stacked bars, top
 * failing clients, canary trend strip, recent failures table) on top of
 * the snapshot the server fetched.
 */
export function PublishHealthDashboard({ initialSnapshot, sloRows }: Props) {
  const [range, setRange] = useState<'7d' | '30d'>('7d');
  const snapshot = initialSnapshot;

  const chartData = useMemo(() => {
    const buckets = range === '7d' ? snapshot.daily30d.slice(-7) : snapshot.daily30d;
    return buckets.map((b) => {
      const total = CORE_PLATFORMS.reduce(
        (sum, p) => sum + b[p].published + b[p].failed,
        0,
      );
      const failures = CORE_PLATFORMS.reduce((sum, p) => sum + b[p].failed, 0);
      return {
        date: b.date.slice(5), // MM-DD
        published: total - failures,
        failed: failures,
      };
    });
  }, [snapshot, range]);

  const summary = range === '7d' ? snapshot.summary7d : snapshot.summary30d;
  const bannerTone =
    snapshot.banner.status === 'healthy'
      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
      : snapshot.banner.status === 'degraded'
        ? 'border-amber-500/30 bg-amber-500/5 text-amber-300'
        : 'border-rose-500/40 bg-rose-500/8 text-rose-300';
  const BannerIcon =
    snapshot.banner.status === 'healthy'
      ? CheckCircle2
      : snapshot.banner.status === 'degraded'
        ? AlertTriangle
        : TrendingDown;

  return (
    <div className="space-y-8">
      <div
        className={`flex items-start gap-3 rounded-xl border px-5 py-4 ${bannerTone}`}
      >
        <BannerIcon size={20} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{snapshot.banner.headline}</div>
          {snapshot.banner.detail ? (
            <div className="mt-0.5 text-xs opacity-80">{snapshot.banner.detail}</div>
          ) : null}
        </div>
        <div className="shrink-0 text-[11px] uppercase tracking-wide opacity-60">
          {new Date(snapshot.generatedAt).toLocaleString('en-US', {
            timeZone: 'America/Chicago',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
          {' CT'}
        </div>
      </div>

      <PublishSloCard rows={sloRows} />

      {/* Widget 1: per-platform success rate, stacked bars */}
      <IconCard
        icon={<Activity size={16} />}
        title="Per-platform success rate"
        helpText="Daily counts of published vs failed legs across the core four platforms. Use the 7d/30d toggle to look for drift."
        action={
          <div className="inline-flex rounded-lg border border-nativz-border bg-surface p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setRange('7d')}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                range === '7d'
                  ? 'bg-accent/15 text-accent-text'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              7d
            </button>
            <button
              type="button"
              onClick={() => setRange('30d')}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                range === '30d'
                  ? 'bg-accent/15 text-accent-text'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              30d
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {summary.map((s) => (
            <div
              key={s.platform}
              className="rounded-xl border border-nativz-border bg-surface px-4 py-3"
            >
              <div className="text-[11px] uppercase tracking-wide text-text-muted">
                {s.platform}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <div className="text-xl font-semibold text-text-primary">
                  {(s.successRate * 100).toFixed(s.successRate === 1 ? 0 : 1)}%
                </div>
                <div className="text-[11px] text-text-muted">
                  {s.published} ok · {s.failed} fail
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(15,17,21,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="published" stackId="legs" fill="#34d399" radius={[2, 2, 0, 0]} />
              <Bar dataKey="failed" stackId="legs" fill="#f87171" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </IconCard>

      {/* Widget 2: top failing clients */}
      <IconCard
        icon={<TrendingDown size={16} />}
        title="Top failing clients (last 7 days)"
        helpText="Clients with the most failed legs in the last week. Click through to the brand's calendar."
      >
        {snapshot.topFailingClients.length === 0 ? (
          <div className="rounded-lg border border-nativz-border/40 bg-surface/50 px-4 py-6 text-center text-sm text-text-muted">
            No client legs failed in the last 7 days.
          </div>
        ) : (
          <ul className="divide-y divide-nativz-border/60 rounded-xl border border-nativz-border bg-surface">
            {snapshot.topFailingClients.map((c) => (
              <li key={c.clientId} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-500/15 text-xs font-medium text-rose-300">
                    {c.failureCount}
                  </div>
                  <div className="text-sm text-text-primary">{c.clientName}</div>
                </div>
                <Link
                  href={`/admin/calendar?clientId=${c.clientId}`}
                  className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-accent-text"
                >
                  Open calendar
                  <ExternalLink size={12} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </IconCard>

      {/* Widget 3: canary trend strip */}
      <IconCard
        icon={<Activity size={16} />}
        title="Canary trend (last 30 runs per platform)"
        helpText="Synthetic canary publishes from PUB-04. Green = round-trip confirmed; red = the platform rejected the canary. Newest on the right."
      >
        <div className="space-y-3">
          {snapshot.canaryTrend.map((t) => (
            <div key={t.platform} className="flex items-center gap-4">
              <div className="w-24 shrink-0 text-xs uppercase tracking-wide text-text-muted">
                {t.platform}
              </div>
              <div className="flex flex-1 items-center gap-1.5">
                {t.runs.length === 0 ? (
                  <div className="text-xs text-text-muted">No canary runs yet.</div>
                ) : (
                  // Reverse so newest is on the right.
                  [...t.runs].reverse().map((r) => {
                    const color =
                      r.publishStatus === 'failed'
                        ? 'bg-rose-500'
                        : r.publishStatus === 'pending'
                          ? 'bg-amber-400'
                          : r.verificationStatus === 'platform_reject'
                            ? 'bg-rose-500'
                            : r.verificationStatus === 'unverifiable'
                              ? 'bg-amber-400'
                              : 'bg-emerald-400';
                    const title = `${new Date(r.createdAt).toLocaleString(
                      'en-US',
                      { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' },
                    )} · ${r.publishStatus}${r.verificationStatus ? ` · ${r.verificationStatus}` : ''}${r.publishError ? ` · ${r.publishError.slice(0, 80)}` : ''}`;
                    return (
                      <span
                        key={r.id}
                        title={title}
                        className={`h-2.5 w-2.5 rounded-sm ${color}`}
                        aria-label={title}
                      />
                    );
                  })
                )}
              </div>
              <div className="w-32 shrink-0 text-right text-[11px] text-text-muted">
                {t.lastFailure
                  ? `last fail ${new Date(t.lastFailure.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                  : 'no failures'}
              </div>
            </div>
          ))}
        </div>
      </IconCard>

      {/* Widget 4: recent failures table */}
      <IconCard
        icon={<AlertTriangle size={16} />}
        title="Last 24 hours of failures"
        helpText="Per-leg failures in the last 24 hours. Open the client's calendar to retry manually."
      >
        {snapshot.recentFailures.length === 0 ? (
          <div className="rounded-lg border border-nativz-border/40 bg-surface/50 px-4 py-6 text-center text-sm text-text-muted">
            No leg failures in the last 24 hours.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-nativz-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-hover/30 text-[11px] uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Client</th>
                  <th className="px-4 py-2 text-left font-medium">Platform</th>
                  <th className="px-4 py-2 text-left font-medium">Scheduled</th>
                  <th className="px-4 py-2 text-left font-medium">Retries</th>
                  <th className="px-4 py-2 text-left font-medium">Reason</th>
                  <th className="px-4 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-nativz-border/60">
                {snapshot.recentFailures.map((row) => (
                  <tr key={row.legId} className="text-text-primary">
                    <td className="px-4 py-2.5">{row.clientName ?? '—'}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{row.platform}</td>
                    <td className="px-4 py-2.5 text-xs text-text-muted">
                      {row.scheduledFor
                        ? new Date(row.scheduledFor).toLocaleString('en-US', {
                            timeZone: 'America/Chicago',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">{row.retryCount}</td>
                    <td className="max-w-md px-4 py-2.5 text-xs text-rose-300/80">
                      {row.failureReason
                        ? row.failureReason.length > 140
                          ? `${row.failureReason.slice(0, 140)}…`
                          : row.failureReason
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/admin/calendar?postId=${row.postId}`}
                        className="inline-flex items-center gap-1 text-xs text-accent-text hover:underline"
                      >
                        Open
                        <ExternalLink size={11} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </IconCard>
    </div>
  );
}
