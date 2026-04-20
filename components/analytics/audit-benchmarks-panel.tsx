'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  ArrowUpRight,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

interface CompetitorRef {
  username: string;
  displayName: string;
  platform: string;
  profileUrl?: string | null;
  baselineFollowers?: number;
}

interface Snapshot {
  id: string;
  benchmark_id: string;
  platform: string;
  username: string;
  display_name: string | null;
  followers: number | null;
  posts_count: number | null;
  avg_views: number | null;
  engagement_rate: number | null;
  posting_frequency: string | null;
  followers_delta: number | null;
  posts_count_delta: number | null;
  avg_views_delta: number | null;
  new_posts: Array<{
    id: string;
    url: string;
    description: string;
    thumbnail_url: string | null;
    views: number;
    publish_date: string | null;
  }> | null;
  scrape_error: string | null;
  captured_at: string;
}

interface BenchmarkRow {
  id: string;
  auditId: string;
  cadence: 'weekly' | 'biweekly' | 'monthly';
  analyticsSource: string;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  lastSnapshotAt: string | null;
  nextSnapshotDueAt: string | null;
  createdAt: string;
  competitors: CompetitorRef[];
  snapshots: Snapshot[];
}

interface Props {
  clientId: string | null;
  clientName: string;
}

/**
 * Audit-driven benchmarking panel. Rendered on /admin/analytics ➜
 * Benchmarking tab beneath the existing manual-competitor tracker. Reads
 * from `client_benchmarks` + `benchmark_snapshots` (the Phase 2 cron
 * output) and plots follower growth per competitor over time plus a short
 * feed of their latest posts.
 */
export function AuditBenchmarksPanel({ clientId, clientName }: Props) {
  const [rows, setRows] = useState<BenchmarkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/benchmarks?clientId=${encodeURIComponent(clientId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Request failed');
        return r.json() as Promise<{ benchmarks: BenchmarkRow[] }>;
      })
      .then((data) => {
        if (!cancelled) setRows(data.benchmarks ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load benchmarks');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (!clientId) {
    return (
      <div className="rounded-xl border border-nativz-border bg-surface p-6 text-sm text-text-muted">
        Pick a client to see attached benchmarks.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-text-muted">
        <Loader2 size={14} className="animate-spin" /> Loading benchmarks...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
        {error}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-nativz-border bg-surface/40 px-6 py-10 text-center">
        <p className="text-sm text-text-muted">
          No audits attached to {clientName} yet.
        </p>
        <p className="mt-1 text-xs text-text-muted/70">
          Run an audit in{' '}
          <Link href="/admin/analyze-social" className="text-accent-text hover:underline">
            Analyze Social
          </Link>
          , then click &ldquo;Attach to client&rdquo; on the report.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {rows.map((b) => (
        <BenchmarkCard key={b.id} benchmark={b} />
      ))}
    </div>
  );
}

// ── Internal components ────────────────────────────────────────────────

function BenchmarkCard({ benchmark }: { benchmark: BenchmarkRow }) {
  // Group snapshots by (platform, username) so each competitor gets its own
  // series on the chart and its own posts column below.
  const byHandle = useMemo(() => {
    const map = new Map<string, Snapshot[]>();
    for (const s of benchmark.snapshots) {
      const key = `${s.platform}/${s.username}`;
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return map;
  }, [benchmark.snapshots]);

  // Followers chart — one point per snapshot, one series per handle.
  const chartData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number | string>>();
    for (const s of benchmark.snapshots) {
      const date = new Date(s.captured_at).toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
      });
      const row = dateMap.get(date) ?? { date };
      row[`${s.platform}/${s.username}`] = s.followers ?? 0;
      dateMap.set(date, row);
    }
    return Array.from(dateMap.values());
  }, [benchmark.snapshots]);

  const seriesKeys = Array.from(byHandle.keys());

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-text-primary">
            {benchmark.competitors.length} competitor
            {benchmark.competitors.length === 1 ? '' : 's'} tracked
          </h3>
          <p className="text-xs text-text-muted mt-0.5">
            Attached {formatRelativeTime(benchmark.createdAt)} · {benchmark.cadence} cadence
            {benchmark.lastSnapshotAt && (
              <> · last snapshot {formatRelativeTime(benchmark.lastSnapshotAt)}</>
            )}
          </p>
        </div>
        <Link
          href={`/admin/analyze-social/${benchmark.auditId}`}
          className="inline-flex items-center gap-1 text-xs text-accent-text hover:underline"
        >
          Source audit <ExternalLink size={10} />
        </Link>
      </div>

      {benchmark.snapshots.length === 0 ? (
        <div className="rounded-lg border border-dashed border-nativz-border bg-background/40 px-4 py-8 text-center text-sm text-text-muted">
          No snapshots yet. First scrape runs in the next cron window.
        </div>
      ) : (
        <>
          {/* Followers over time */}
          <div>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted/70">
              Followers over time
            </h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--nativz-border)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                    stroke="var(--nativz-border)"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                    stroke="var(--nativz-border)"
                    tickFormatter={(v) => formatNumber(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--surface)',
                      border: '1px solid var(--nativz-border)',
                      fontSize: 12,
                    }}
                    formatter={(v: number | undefined) => formatNumber(v ?? 0)}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {seriesKeys.map((k, i) => (
                    <Line
                      key={k}
                      type="monotone"
                      dataKey={k}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Per-competitor latest stats + recent posts */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {seriesKeys.map((key) => {
              const snaps = byHandle.get(key) ?? [];
              const latest = snaps[snaps.length - 1];
              if (!latest) return null;
              return <CompetitorRow key={key} latest={latest} />;
            })}
          </div>
        </>
      )}
    </div>
  );
}

function CompetitorRow({ latest }: { latest: Snapshot }) {
  const hasError = !!latest.scrape_error;
  return (
    <div className="rounded-lg border border-nativz-border bg-background/40 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-primary">
            {latest.display_name ?? latest.username}
          </p>
          <p className="text-[11px] text-text-muted capitalize">
            {latest.platform} · @{latest.username}
          </p>
        </div>
        {latest.followers != null && (
          <span className="shrink-0 text-sm font-semibold text-text-primary">
            {formatNumber(latest.followers)}
          </span>
        )}
      </div>

      {hasError ? (
        <p className="text-[11px] text-red-400">Scrape failed: {latest.scrape_error}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <DeltaStat label="Followers" delta={latest.followers_delta} />
          <DeltaStat label="New posts" delta={latest.posts_count_delta} />
          <DeltaStat label="Avg views" delta={latest.avg_views_delta} />
        </div>
      )}

      {(() => {
        const ageMs = Date.now() - new Date(latest.captured_at).getTime();
        const stale = ageMs > 7 * 24 * 60 * 60 * 1000;
        return (
          <p className={`text-[10px] ${stale ? 'text-amber-400' : 'text-text-muted/70'}`}>
            Last updated:{' '}
            {new Date(latest.captured_at).toLocaleString([], {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
            {stale && (
              <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 font-medium">
                stale
              </span>
            )}
          </p>
        );
      })()}

      {(latest.new_posts?.length ?? 0) > 0 && (
        <div className="space-y-1 border-t border-nativz-border/40 pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted/60">
            Recent posts
          </p>
          <ul className="space-y-0.5">
            {latest.new_posts!.slice(0, 3).map((p) => (
              <li key={p.id}>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[11px] text-text-secondary hover:text-text-primary"
                  title={p.description}
                >
                  <ArrowUpRight size={10} className="shrink-0 text-text-muted" />
                  <span className="truncate">{p.description || 'Untitled'}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DeltaStat({
  label,
  delta,
}: {
  label: string;
  delta: number | null;
}) {
  const Icon = delta == null ? Minus : delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const color =
    delta == null
      ? 'text-text-muted'
      : delta > 0
      ? 'text-emerald-400'
      : delta < 0
      ? 'text-red-400'
      : 'text-text-muted';
  return (
    <div>
      <span className="block text-text-muted/70">{label}</span>
      <span className={cn('flex items-center gap-1 font-medium', color)}>
        <Icon size={11} />
        {delta == null ? '—' : (delta > 0 ? '+' : '') + formatNumber(delta)}
      </span>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

const CHART_COLORS = ['#046bd2', '#f97316', '#14b8a6', '#a855f7', '#facc15', '#ec4899'];

function formatNumber(n: number): string {
  if (n == null || Number.isNaN(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toString();
}
