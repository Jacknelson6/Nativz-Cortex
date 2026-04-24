'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  BarChart3,
  Check,
  Clock,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  ShoppingBag,
  Store,
  User,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import type { RankedCreator, SearchResults } from '@/lib/tiktok-shop/types';
import { accountTypeLabel, type AccountType } from '@/lib/tiktok-shop/account-type';
import { AnalysisChatDrawer } from '@/components/analyses/analysis-chat-drawer';

interface SearchRow {
  id: string;
  query: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  products_found: number;
  creators_found: number;
  creators_enriched: number;
  max_products: number;
  min_followers: number | null;
  market_country_code: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  error_message: string | null;
  results: SearchResults | null;
  client_id: string | null;
}

const STALE_MS = 24 * 60 * 60 * 1000;

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function TikTokShopResultsClient({ initial }: { initial: SearchRow }) {
  const router = useRouter();
  const [search, setSearch] = useState<SearchRow>(initial);
  const [rerunning, setRerunning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isRunning = search.status === 'queued' || search.status === 'running';
  const isStale =
    search.status === 'completed' &&
    search.completed_at !== null &&
    Date.now() - new Date(search.completed_at).getTime() > STALE_MS;

  useEffect(() => {
    if (!isRunning) return;
    let cancelled = false;

    async function poll(): Promise<void> {
      try {
        const res = await fetch(`/api/insights/search/${search.id}`, { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.search) setSearch(data.search as SearchRow);
      } catch {
        /* transient; retry */
      }
      if (!cancelled && (search.status === 'queued' || search.status === 'running')) {
        pollRef.current = setTimeout(poll, 3000);
      }
    }

    pollRef.current = setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [isRunning, search.id, search.status]);

  async function handleRerun(): Promise<void> {
    setRerunning(true);
    try {
      const res = await fetch('/api/insights/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: search.query,
          maxProducts: search.max_products,
          minFollowers: search.min_followers ?? undefined,
          marketCountryCode: search.market_country_code,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Re-run failed to start');
        return;
      }
      toast.success('Re-running…');
      router.push(`/admin/competitor-tracking/tiktok-shop/${data.jobId}`);
    } finally {
      setRerunning(false);
    }
  }

  function handleExport(): void {
    const creators = search.results?.creators ?? [];
    if (creators.length === 0) {
      toast.error('Nothing to export yet');
      return;
    }
    const rows = [
      [
        'Rank',
        'Username',
        'Nickname',
        'Account Type',
        'Primary Category',
        'Followers',
        'Composite Score',
        'Traffic Index',
        'E-commerce Potential',
        'Products in Search',
        'GMV Total',
        'Performance',
        'Profile URL',
      ],
      ...creators.map((c, i) => [
        String(i + 1),
        `@${c.username}`,
        c.nickname ?? '',
        accountTypeLabel(c.accountType),
        c.categories[0] ?? '',
        String(c.followers),
        String(c.compositeScore),
        String(c.trafficIndex),
        String(c.ecommercePotentialIndex),
        String(c.categoryProductCount),
        String(c.stats?.gmv.total ?? 0),
        String(c.stats?.performanceScore ?? 0),
        `https://www.tiktok.com/@${c.username}`,
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
          .join(','),
      )
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tiktok-shop-${search.query.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const creators = search.results?.creators ?? [];
  const top = useMemo(() => creators.slice(0, 5), [creators]);
  const rest = useMemo(() => creators.slice(5), [creators]);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <header className="border-b border-nativz-border bg-surface/40 px-6 py-5 md:px-10">
        <Link
          href="/admin/competitor-tracking/tiktok-shop"
          className="inline-flex items-center gap-1 text-xs font-medium text-text-muted transition-colors hover:text-text-secondary"
        >
          <ArrowLeft size={12} aria-hidden />
          Back to search
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-text-primary md:text-2xl">
              {search.query}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-muted">
              <span className="inline-flex items-center gap-1">
                <Clock size={12} aria-hidden />
                {formatRelative(search.created_at)}
              </span>
              <span>·</span>
              <span>{search.market_country_code}</span>
              <span>·</span>
              <span>max {search.max_products} products</span>
              {search.min_followers ? (
                <>
                  <span>·</span>
                  <span>≥ {formatCompact(search.min_followers)} followers</span>
                </>
              ) : null}
              {isStale && (
                <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-medium uppercase tracking-wide text-amber-300">
                  Stale — &gt; 24h old
                </span>
              )}
            </div>

            {search.results?.primaryBenchmark && (
              <p className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border border-accent/20 bg-accent/5 px-2.5 py-1 text-[11px] font-medium text-accent-text">
                <BadgeCheck size={12} aria-hidden />
                <span className="truncate">
                  {search.results.primaryBenchmark.category} drives{' '}
                  {Math.round(search.results.primaryBenchmark.gmvShare * 100)}% of{' '}
                  {search.results.primaryBenchmark.countryCode} TikTok Shop GMV
                  {search.results.primaryBenchmark.note
                    ? ` · ${search.results.primaryBenchmark.note}`
                    : ''}
                </span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {search.status === 'completed' && (
              <>
                {search.client_id && (
                  <Link
                    href={`/admin/analytics?clientId=${search.client_id}&tab=benchmarking`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-nativz-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-accent/40 hover:text-text-primary"
                  >
                    <BarChart3 size={14} aria-hidden />
                    Open in benchmarking
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleExport}
                  className="inline-flex items-center gap-1.5 rounded-full border border-nativz-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-accent/40 hover:text-text-primary"
                >
                  <Download size={14} aria-hidden />
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => void handleRerun()}
                  disabled={rerunning}
                  className="inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent-text transition hover:bg-accent/15 disabled:opacity-50"
                >
                  {rerunning ? (
                    <Loader2 size={14} className="animate-spin" aria-hidden />
                  ) : (
                    <RefreshCw size={14} aria-hidden />
                  )}
                  Re-run
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <AnalysisChatDrawer
        scopeType="tiktok_shop_search"
        scopeId={search.id}
        scopeLabel={search.query}
        strategyLabHref={`/lab?attach=tiktok_shop_search:${search.id}`}
      />

      <div className="flex-1 px-6 py-8 md:px-10">
        <div className="mx-auto max-w-5xl">
          {search.status === 'failed' && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5">
              <p className="text-sm font-medium text-red-300">Search failed</p>
              <p className="mt-1 text-sm text-text-secondary">
                {search.error_message ?? 'Unknown error.'}
              </p>
              <button
                type="button"
                onClick={() => void handleRerun()}
                disabled={rerunning}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent-text transition hover:bg-accent/15 disabled:opacity-50"
              >
                {rerunning ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />}
                Retry
              </button>
            </div>
          )}

          {isRunning && <RunningState search={search} />}

          {search.status === 'completed' && creators.length === 0 && (
            <div className="rounded-xl border border-dashed border-nativz-border bg-surface/30 p-8 text-center">
              <p className="text-sm text-text-muted">
                No creators returned for this category. Try a broader keyword.
              </p>
            </div>
          )}

          {search.status === 'completed' && creators.length > 0 && (
            <>
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
                  Top creators
                </h2>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {top.map((c, i) => (
                    <TopCreatorCard key={c.username} creator={c} rank={i + 1} />
                  ))}
                </div>
              </section>

              {rest.length > 0 && (
                <section className="mt-10">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
                    All creators · {creators.length}
                  </h2>
                  <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-hover/60 text-left text-[11px] uppercase tracking-wide text-text-muted">
                        <tr>
                          <th className="w-10 px-3 py-2.5">#</th>
                          <th className="px-3 py-2.5">Creator</th>
                          <th className="px-3 py-2.5">Followers</th>
                          <th className="px-3 py-2.5" title="Products from this search the creator appears on">
                            Products
                          </th>
                          <th className="px-3 py-2.5">GMV</th>
                          <th className="px-3 py-2.5" title="Reach signal — engagement × followers, avg views, posting cadence">
                            Traffic
                          </th>
                          <th className="px-3 py-2.5" title="Conversion signal — GMV, GPM, performance, brand collabs, units sold">
                            E-com
                          </th>
                          <th className="px-3 py-2.5">Score</th>
                          <th className="w-20 px-3 py-2.5"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-nativz-border/70">
                        {rest.map((c, i) => (
                          <tr key={c.username} className="hover:bg-surface-hover/40">
                            <td className="px-3 py-2.5 text-text-muted">{i + 6}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2.5">
                                <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-background">
                                  {c.avatarUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={c.avatarUrl} alt={c.username} className="h-full w-full object-cover" />
                                  ) : null}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate font-medium text-text-primary">
                                      {c.nickname ?? c.username}
                                    </span>
                                    <AccountTypeBadge type={c.accountType} compact />
                                  </div>
                                  <div className="flex items-center gap-1.5 text-xs text-text-muted">
                                    <span className="truncate">@{c.username}</span>
                                    {c.categories[0] && (
                                      <>
                                        <span>·</span>
                                        <span className="truncate">{c.categories[0]}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-text-secondary">
                              {formatCompact(c.followers)}
                            </td>
                            <td className="px-3 py-2.5 text-text-secondary">
                              {c.categoryProductCount}
                            </td>
                            <td className="px-3 py-2.5 text-text-secondary">
                              {c.stats ? formatUsd(c.stats.gmv.total) : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-text-secondary tabular-nums">
                              {c.trafficIndex}
                            </td>
                            <td className="px-3 py-2.5 text-text-secondary tabular-nums">
                              {c.ecommercePotentialIndex}
                            </td>
                            <td className="px-3 py-2.5">
                              <ScorePill score={c.compositeScore} />
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <div className="inline-flex items-center gap-1">
                                {search.client_id && (
                                  <TrackInBenchmarksButton
                                    clientId={search.client_id}
                                    username={c.username}
                                  />
                                )}
                                <Link
                                  href={`/admin/competitor-tracking/tiktok-shop/creator/${encodeURIComponent(c.username)}`}
                                  className="inline-flex items-center rounded-md border border-nativz-border bg-background px-2 py-1 text-xs font-medium text-text-secondary transition hover:border-accent/40 hover:text-text-primary"
                                >
                                  View
                                </Link>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RunningState({ search }: { search: SearchRow }) {
  const phase =
    search.status === 'queued'
      ? 'Queued…'
      : search.creators_enriched > 0
        ? `Enriching creators · ${search.creators_enriched} / ${search.creators_found}`
        : search.creators_found > 0
          ? `Found ${search.creators_found} creators · starting enrichment`
          : search.products_found > 0
            ? `Found ${search.products_found} products · collecting affiliates`
            : 'Discovering products on TikTok Shop…';

  const pct = search.creators_found > 0
    ? Math.min(95, 20 + Math.round((search.creators_enriched / Math.max(1, search.creators_found)) * 75))
    : search.products_found > 0
      ? 20
      : 5;

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-6">
      <div className="flex items-center gap-3">
        <Loader2 size={18} className="animate-spin text-accent-text" aria-hidden />
        <p className="text-sm font-medium text-text-primary">{phase}</p>
      </div>
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-background">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1">
          <ShoppingBag size={12} aria-hidden /> {search.products_found} products
        </span>
        <span className="inline-flex items-center gap-1">
          <Users size={12} aria-hidden /> {search.creators_found} creators
        </span>
      </div>
    </div>
  );
}

function TopCreatorCard({ creator, rank }: { creator: RankedCreator; rank: number }) {
  return (
    <Link
      href={`/admin/competitor-tracking/tiktok-shop/creator/${encodeURIComponent(creator.username)}`}
      className="group flex items-start gap-3 rounded-xl border border-nativz-border bg-surface p-4 transition hover:border-accent/40 hover:bg-surface-hover"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-nativz-border bg-background text-sm font-semibold text-text-muted">
        {creator.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={creator.avatarUrl} alt={creator.username} className="h-full w-full object-cover" />
        ) : (
          <span>#{rank}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate font-medium text-text-primary">
            {creator.nickname ?? creator.username}
          </p>
          {creator.stats?.brandCollabs && creator.stats.brandCollabs > 5 ? (
            <BadgeCheck size={14} className="text-accent-text" aria-hidden />
          ) : null}
          <AccountTypeBadge type={creator.accountType} />
        </div>
        <p className="truncate text-xs text-text-muted">
          @{creator.username}
          {creator.categories[0] ? ` · ${creator.categories[0]}` : ''}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-secondary">
          <span>{formatCompact(creator.followers)} followers</span>
          {creator.stats && creator.stats.gmv.total > 0 && (
            <span>{formatUsd(creator.stats.gmv.total)} GMV</span>
          )}
          <span>{creator.categoryProductCount} products</span>
        </div>
        <div className="mt-2 flex items-center gap-3 text-[11px] tabular-nums text-text-muted">
          <span title="Traffic Index — reach + activity + engagement">
            Traffic <span className="text-text-secondary">{creator.trafficIndex}</span>
          </span>
          <span title="E-commerce Potential — conversion + GMV + brand trust">
            E-com <span className="text-text-secondary">{creator.ecommercePotentialIndex}</span>
          </span>
        </div>
      </div>
      <ScorePill score={creator.compositeScore} />
    </Link>
  );
}

function AccountTypeBadge({
  type,
  compact = false,
}: {
  type: AccountType;
  compact?: boolean;
}) {
  if (type === 'unknown') return null;
  const Icon = type === 'brand_store' ? Store : type === 'agency_operated' ? Users : User;
  const tone =
    type === 'brand_store'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
      : type === 'agency_operated'
        ? 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300'
        : 'border-nativz-border bg-background text-text-muted';
  return (
    <span
      title={`${accountTypeLabel(type)} account`}
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 ${
        compact ? 'text-[9px]' : 'text-[10px]'
      } font-medium uppercase tracking-wide ${tone}`}
    >
      <Icon size={compact ? 9 : 10} aria-hidden />
      {accountTypeLabel(type)}
    </span>
  );
}

function ScorePill({ score }: { score: number }) {
  const tone =
    score >= 70
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : score >= 40
        ? 'border-accent/30 bg-accent/10 text-accent-text'
        : 'border-nativz-border bg-background text-text-muted';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`}
    >
      {score}
    </span>
  );
}

function TrackInBenchmarksButton({
  clientId,
  username,
}: {
  clientId: string;
  username: string;
}) {
  const [state, setState] = useState<'idle' | 'saving' | 'tracked'>('idle');

  async function handleClick() {
    if (state !== 'idle') return;
    setState('saving');
    try {
      const res = await fetch('/api/analytics/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          platform: 'tiktok',
          profile_url: `https://www.tiktok.com/@${username}`,
          username,
        }),
      });
      const data = await res.json().catch(() => ({ error: 'Failed to track' }));
      if (res.ok) {
        toast.success(`Tracking @${username}`);
        setState('tracked');
        return;
      }
      if (res.status === 409) {
        toast.info(`@${username} is already tracked`);
        setState('tracked');
        return;
      }
      toast.error(data.error ?? 'Could not add competitor');
      setState('idle');
    } catch {
      toast.error('Could not add competitor');
      setState('idle');
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state !== 'idle'}
      title={state === 'tracked' ? 'Tracked in benchmarks' : 'Add to benchmarks'}
      className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition ${
        state === 'tracked'
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
          : 'border-accent/35 bg-accent/10 text-accent-text hover:bg-accent/15'
      } disabled:opacity-60`}
    >
      {state === 'saving' ? (
        <Loader2 size={12} className="animate-spin" aria-hidden />
      ) : state === 'tracked' ? (
        <Check size={12} aria-hidden />
      ) : (
        <Plus size={12} aria-hidden />
      )}
      <span className="ml-1">{state === 'tracked' ? 'Tracked' : 'Track'}</span>
    </button>
  );
}
