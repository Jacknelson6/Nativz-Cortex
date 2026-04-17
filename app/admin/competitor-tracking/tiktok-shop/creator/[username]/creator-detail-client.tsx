'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { CreatorDemographic, CreatorEnrichment } from '@/lib/tiktok-shop/types';

interface Props {
  username: string;
  initialCreator: CreatorEnrichment | null;
  initialFetchedAt: string | null;
}

const STALE_MS = 24 * 60 * 60 * 1000;

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function formatPct(n: number): string {
  // Lemur sometimes returns 0-1, sometimes 0-100; normalize.
  const pct = n > 1 ? n : n * 100;
  return `${pct.toFixed(1)}%`;
}

export function CreatorDetailClient({
  username,
  initialCreator,
  initialFetchedAt,
}: Props) {
  const [creator, setCreator] = useState<CreatorEnrichment | null>(initialCreator);
  const [fetchedAt, setFetchedAt] = useState<string | null>(initialFetchedAt);
  const [loading, setLoading] = useState(!initialCreator);

  const isStale =
    fetchedAt !== null && Date.now() - new Date(fetchedAt).getTime() > STALE_MS;

  const loadFresh = useCallback(async (force = false): Promise<void> => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/insights/creator/${encodeURIComponent(username)}${force ? '?refresh=1' : ''}`,
        { cache: 'no-store' },
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to load creator');
        return;
      }
      setCreator(data.creator);
      setFetchedAt(data.fetched_at);
      if (data.stale) toast.info('Showing last cached snapshot — live refresh failed');
    } catch {
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    if (!initialCreator) {
      void loadFresh(false);
    }
  }, [initialCreator, loadFresh]);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <header className="border-b border-nativz-border bg-surface/40 px-6 py-5 md:px-10">
        <Link
          href="/admin/competitor-tracking/tiktok-shop"
          className="inline-flex items-center gap-1 text-xs font-medium text-text-muted transition-colors hover:text-text-secondary"
        >
          <ArrowLeft size={12} aria-hidden />
          Back to TikTok Shop
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-nativz-border bg-background">
              {creator?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={creator.avatarUrl} alt={username} className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-text-primary md:text-2xl">
                {creator?.nickname ?? username}
              </h1>
              <p className="mt-0.5 text-sm text-text-muted">@{username}{creator?.region ? ` · ${creator.region}` : ''}</p>
              {creator?.bio && (
                <p className="mt-1 max-w-xl text-sm text-text-secondary">{creator.bio}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`https://www.tiktok.com/@${username}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-nativz-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-accent/40 hover:text-text-primary"
            >
              <ExternalLink size={14} aria-hidden />
              TikTok
            </a>
            <button
              type="button"
              onClick={() => void loadFresh(true)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent-text transition hover:bg-accent/15 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              ) : (
                <RefreshCw size={14} aria-hidden />
              )}
              {isStale ? 'Refresh (stale)' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 px-6 py-8 md:px-10">
        <div className="mx-auto max-w-5xl">
          {loading && !creator ? (
            <div className="rounded-xl border border-nativz-border bg-surface p-8 text-center">
              <Loader2 size={18} className="mx-auto animate-spin text-accent-text" aria-hidden />
              <p className="mt-2 text-sm text-text-muted">Fetching creator data…</p>
            </div>
          ) : !creator ? (
            <div className="rounded-xl border border-dashed border-nativz-border bg-surface/30 p-8 text-center">
              <p className="text-sm text-text-muted">
                No data found for @{username}. The creator may not be on TikTok Shop, or the username is wrong.
              </p>
            </div>
          ) : (
            <>
              <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard label="Total GMV" value={formatUsd(creator.stats.gmv.total)} />
                <StatCard
                  label="Units sold (30d)"
                  value={formatCompact(creator.stats.unitsSold30d)}
                />
                <StatCard label="GPM" value={formatUsd(creator.stats.gpm)} />
                <StatCard
                  label="Performance"
                  value={`${creator.stats.performanceScore}/100`}
                />
              </section>

              <section className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
                <Panel title="GMV breakdown">
                  <BreakdownRow label="Video GMV" value={formatUsd(creator.stats.gmv.video)} />
                  <BreakdownRow label="Live GMV" value={formatUsd(creator.stats.gmv.live)} />
                  <BreakdownRow
                    label="Commission range"
                    value={creator.stats.commissionRange ?? '—'}
                  />
                  <BreakdownRow
                    label="Brand collabs"
                    value={String(creator.stats.brandCollabs)}
                  />
                  <BreakdownRow
                    label="Promoted products"
                    value={String(creator.stats.promotedProducts)}
                  />
                </Panel>

                <Panel title="Engagement">
                  <BreakdownRow
                    label="Engagement · video"
                    value={formatPct(creator.stats.engagementRate.video)}
                  />
                  <BreakdownRow
                    label="Engagement · live"
                    value={formatPct(creator.stats.engagementRate.live)}
                  />
                  <BreakdownRow
                    label="Avg views · video"
                    value={formatCompact(creator.stats.avgViews.video)}
                  />
                  <BreakdownRow
                    label="Avg views · live"
                    value={formatCompact(creator.stats.avgViews.live)}
                  />
                  <BreakdownRow
                    label="Posts (30d)"
                    value={`${creator.stats.contentFrequency.video} videos · ${creator.stats.contentFrequency.live} lives`}
                  />
                </Panel>
              </section>

              <section className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
                <DemoPanel
                  title="Age"
                  items={creator.stats.demographics.age}
                />
                <DemoPanel
                  title="Gender"
                  items={creator.stats.demographics.gender}
                />
                <DemoPanel
                  title="Top locations"
                  items={creator.stats.demographics.location.slice(0, 6)}
                />
              </section>

              {fetchedAt && (
                <p className="mt-6 text-xs text-text-muted">
                  Data fetched {new Date(fetchedAt).toLocaleString()}{isStale ? ' · stale' : ''}.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-text-primary">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-5">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <div className="mt-3 space-y-1.5">{children}</div>
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-nativz-border/60 py-1.5 text-sm last:border-b-0">
      <span className="text-text-muted">{label}</span>
      <span className="font-medium tabular-nums text-text-primary">{value}</span>
    </div>
  );
}

function DemoPanel({
  title,
  items,
}: {
  title: string;
  items: CreatorDemographic[];
}) {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-5">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-xs text-text-muted">Not available.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {items.map((item) => (
            <li key={item.label} className="flex items-center gap-3 text-sm">
              <span className="w-24 shrink-0 truncate text-text-muted">{item.label}</span>
              <div className="flex-1 h-1.5 rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.min(100, Math.max(0, item.pct > 1 ? item.pct : item.pct * 100))}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-text-secondary">
                {(item.pct > 1 ? item.pct : item.pct * 100).toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
