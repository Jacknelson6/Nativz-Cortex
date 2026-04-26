'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, CircleAlert, ExternalLink, Loader2, Radar } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils/cn';

interface Snapshot {
  id: string;
  captured_at: string;
  platform: string;
  username: string | null;
  display_name: string | null;
  profile_url: string | null;
  followers: number | null;
  posts_count: number | null;
  avg_views: number | null;
  engagement_rate: number | null;
  posting_frequency: string | null;
  followers_delta: number | null;
  posts_count_delta: number | null;
  engagement_rate_delta: number | null;
  scrape_error: string | null;
}

interface BenchmarkInfo {
  id: string;
  client_id: string;
  cadence: string;
  client: { name: string; logo_url: string | null } | { name: string; logo_url: string | null }[] | null;
}

interface WatchHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  watchId: string | null;
  /** Title fallbacks while the API is in flight, so the drawer doesn't pop in
   *  empty. Once we get the API response we use the canonical names. */
  fallbackTitle: string;
  fallbackSubtitle: string;
  fallbackLogo: string | null;
  fallbackPlatform: string | null;
}

export function WatchHistoryDrawer({
  open,
  onClose,
  watchId,
  fallbackTitle,
  fallbackSubtitle,
  fallbackLogo,
  fallbackPlatform,
}: WatchHistoryDrawerProps) {
  const [data, setData] = useState<{
    benchmark: BenchmarkInfo;
    snapshots: Snapshot[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !watchId) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/spying/watch/${watchId}/history`, {
          cache: 'no-store',
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json?.error ?? 'Failed to load history');
        } else {
          setData(json);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [open, watchId]);

  const client = data?.benchmark.client
    ? Array.isArray(data.benchmark.client)
      ? data.benchmark.client[0]
      : data.benchmark.client
    : null;

  const snapshots = data?.snapshots ?? [];
  const latest = snapshots[snapshots.length - 1] ?? null;
  const first = snapshots[0] ?? null;

  const chartData = snapshots.map((s) => ({
    iso: s.captured_at,
    label: shortDate(s.captured_at),
    followers: s.followers,
    posts: s.posts_count,
    er: s.engagement_rate != null ? Number(s.engagement_rate) : null,
    frequency: s.posting_frequency,
  }));

  const followerDeltaPct =
    latest?.followers != null && first?.followers != null && first.followers > 0
      ? ((latest.followers - first.followers) / first.followers) * 100
      : null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="5xl" bodyClassName="p-0">
      <div className="space-y-5 p-6">
        <header className="flex items-start gap-3">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-accent/10 text-accent-text">
            {fallbackLogo ? (
              <Image
                src={fallbackLogo}
                alt=""
                width={48}
                height={48}
                sizes="48px"
                className="h-12 w-12 object-cover"
              />
            ) : (
              <Radar size={18} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="ui-eyebrow text-accent-text/80">Watch history</p>
            <h2 className="mt-0.5 truncate font-display text-lg font-semibold text-text-primary">
              {latest?.display_name || latest?.username || fallbackTitle}
            </h2>
            <p className="mt-0.5 text-[12px] text-text-muted">
              {client?.name ?? fallbackSubtitle}
              {data ? ` · ${data.benchmark.cadence} cadence` : ''}
              {latest?.platform || fallbackPlatform
                ? ` · ${prettyPlatform(latest?.platform ?? fallbackPlatform!)}`
                : ''}
            </p>
          </div>
          {latest?.profile_url ? (
            <a
              href={latest.profile_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-nativz-border bg-surface px-3 py-1.5 text-[11px] text-text-secondary transition-colors hover:border-accent/40 hover:text-accent-text"
            >
              Open profile <ExternalLink size={11} />
            </a>
          ) : null}
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-text-muted">
            <Loader2 size={18} className="mr-2 animate-spin text-accent-text" />
            Loading history…
          </div>
        ) : error ? (
          <div className="flex items-start gap-3 rounded-xl border border-coral-500/30 bg-coral-500/5 p-4">
            <CircleAlert size={16} className="mt-0.5 flex-shrink-0 text-coral-300" />
            <p className="text-sm text-coral-200">{error}</p>
          </div>
        ) : snapshots.length === 0 ? (
          <div className="rounded-xl border border-dashed border-nativz-border bg-surface/40 p-10 text-center text-sm text-text-muted">
            No snapshots yet. The cron will write the first one on its next run.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat
                label="Followers"
                value={compactNumber(latest?.followers)}
                sub={
                  followerDeltaPct === null
                    ? `${snapshots.length} snapshot${snapshots.length === 1 ? '' : 's'}`
                    : `${signed(followerDeltaPct, 1)}% over window`
                }
                tone={
                  followerDeltaPct === null || followerDeltaPct === 0
                    ? 'neutral'
                    : followerDeltaPct > 0
                      ? 'pos'
                      : 'neg'
                }
              />
              <Stat
                label="Posts"
                value={compactNumber(latest?.posts_count)}
                sub={
                  latest?.posting_frequency
                    ? `Cadence: ${latest.posting_frequency}`
                    : 'Total posted'
                }
              />
              <Stat
                label="Avg views"
                value={compactNumber(latest?.avg_views ? Math.round(latest.avg_views) : null)}
                sub="Across recent posts"
              />
              <Stat
                label="Engagement"
                value={
                  latest?.engagement_rate != null
                    ? `${(Number(latest.engagement_rate) * 100).toFixed(1)}%`
                    : '—'
                }
                sub={
                  latest?.engagement_rate_delta != null
                    ? `${signed(Number(latest.engagement_rate_delta) * 100, 2)} pp vs prior`
                    : 'Vs prior snapshot'
                }
                tone={
                  latest?.engagement_rate_delta == null || latest.engagement_rate_delta === 0
                    ? 'neutral'
                    : latest.engagement_rate_delta > 0
                      ? 'pos'
                      : 'neg'
                }
              />
            </div>

            <ChartCard title="Followers over time" subtitle={`${snapshots.length} snapshots`}>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={20}
                  />
                  <YAxis
                    tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => compactNumber(v)}
                    width={40}
                  />
                  <Tooltip content={<ChartTooltip suffix="" />} />
                  <Line
                    type="monotone"
                    dataKey="followers"
                    stroke="var(--color-accent)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ChartCard title="Engagement rate" subtitle="Avg over recent posts">
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={20}
                    />
                    <YAxis
                      tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
                      width={40}
                    />
                    <Tooltip
                      content={
                        <ChartTooltip
                          suffix=""
                          format={(v) =>
                            v == null ? '—' : `${(Number(v) * 100).toFixed(2)}%`
                          }
                        />
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="er"
                      stroke="#34D399"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Post count" subtitle="Cumulative on profile">
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={20}
                    />
                    <YAxis
                      tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => compactNumber(v)}
                      width={40}
                    />
                    <Tooltip content={<ChartTooltip suffix="" />} />
                    <Bar dataKey="posts" fill="#A78BFA" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <div className="flex items-center justify-end pt-2">
              <Link
                href={`/admin/analytics?tab=benchmarking&competitor=${watchId ?? ''}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-accent/90"
                onClick={onClose}
              >
                Open full benchmarking
                <ArrowUpRight size={12} />
              </Link>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'pos' | 'neg' | 'neutral';
}) {
  const toneClass =
    tone === 'pos' ? 'text-emerald-300' : tone === 'neg' ? 'text-coral-300' : 'text-text-muted';
  return (
    <div className="rounded-xl border border-nativz-border bg-surface-hover/30 p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">{label}</div>
      <div className="mt-1 font-display text-base font-semibold text-text-primary">{value}</div>
      <div className={cn('mt-0.5 text-[11px]', toneClass)}>{sub}</div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface-hover/20 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-display text-sm font-semibold text-text-primary">{title}</h3>
        {subtitle ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
            {subtitle}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

interface TooltipPayload {
  payload?: { label?: string; iso?: string };
  value?: number | string;
  name?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  suffix?: string;
  format?: (v: number | string | undefined) => string;
}

function ChartTooltip({ active, payload, suffix = '', format }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const first = payload[0];
  const value = first?.value;
  const formatted = format
    ? format(value)
    : typeof value === 'number'
      ? `${compactNumber(value)}${suffix}`
      : String(value ?? '—');
  return (
    <div className="rounded-md border border-nativz-border bg-surface px-2.5 py-1.5 text-[11px] shadow-[var(--shadow-dropdown)]">
      <div className="text-text-muted">{first?.payload?.label}</div>
      <div className="mt-0.5 font-display font-semibold text-text-primary">{formatted}</div>
    </div>
  );
}

function compactNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function signed(n: number, fractionDigits = 1): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(fractionDigits)}`;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function prettyPlatform(p: string): string {
  if (p === 'tiktok') return 'TikTok';
  if (p === 'instagram') return 'Instagram';
  if (p === 'youtube') return 'YouTube';
  if (p === 'facebook') return 'Facebook';
  return p;
}
