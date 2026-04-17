'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Clock,
  Loader2,
  Search as SearchIcon,
  ShoppingBag,
  Users as UsersIcon,
} from 'lucide-react';
import { toast } from 'sonner';

interface RecentSearch {
  id: string;
  query: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  products_found: number;
  creators_found: number;
  client_id: string | null;
  created_at: string;
  completed_at: string | null;
}

interface Props {
  recentSearches: RecentSearch[];
}

const STATUS_LABEL: Record<RecentSearch['status'], string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Done',
  failed: 'Failed',
};

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

export function TikTokShopSearchPage({ recentSearches }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [maxProducts, setMaxProducts] = useState(10);
  const [minFollowers, setMinFollowers] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState('');

  const filteredRecent = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return recentSearches;
    return recentSearches.filter((r) => r.query.toLowerCase().includes(q));
  }, [filter, recentSearches]);

  async function handleSearch(): Promise<void> {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      toast.error('Query is too short');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/insights/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmed,
          maxProducts,
          minFollowers: minFollowers > 0 ? minFollowers : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Search failed to start');
        return;
      }
      toast.success('Searching TikTok Shop…');
      router.push(`/admin/competitor-tracking/tiktok-shop/${data.jobId}`);
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <header className="border-b border-nativz-border bg-surface/40 px-6 py-5 md:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-surface text-accent-text">
            <ShoppingBag size={20} aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-text-primary md:text-2xl">
              TikTok Shop
            </h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Discover top creators in any TikTok Shop category — ranked by GMV, engagement, and activity.
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 px-6 py-8 md:px-10">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl border border-nativz-border bg-surface-hover/40 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] md:p-6">
            <label htmlFor="tt-shop-query" className="text-sm font-medium text-text-primary">
              Category keyword
            </label>
            <div className="relative mt-2">
              <SearchIcon
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
                aria-hidden
              />
              <input
                id="tt-shop-query"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !submitting) {
                    e.preventDefault();
                    void handleSearch();
                  }
                }}
                placeholder="e.g. hair accessories, skincare serum, fitness equipment"
                autoComplete="off"
                autoFocus
                className="w-full rounded-xl border border-nativz-border bg-background py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="tt-max-products" className="text-xs font-medium text-text-secondary">
                  Max products to scan
                </label>
                <input
                  id="tt-max-products"
                  type="number"
                  min={1}
                  max={10}
                  value={maxProducts}
                  onChange={(e) => setMaxProducts(Math.min(10, Math.max(1, Number(e.target.value) || 10)))}
                  className="mt-1.5 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="tt-min-followers" className="text-xs font-medium text-text-secondary">
                  Min followers (optional)
                </label>
                <input
                  id="tt-min-followers"
                  type="number"
                  min={0}
                  step={1000}
                  value={minFollowers}
                  onChange={(e) => setMinFollowers(Math.max(0, Number(e.target.value) || 0))}
                  className="mt-1.5 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <p className="text-xs text-text-muted">
                ~1–3 minutes. Cost ≈ $0.20 per search.
              </p>
              <button
                type="button"
                onClick={() => void handleSearch()}
                disabled={submitting || query.trim().length < 2}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white shadow-[0_0_20px_-6px_rgba(91,163,230,0.55)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                ) : (
                  <ArrowRight size={16} aria-hidden />
                )}
                <span>{submitting ? 'Starting…' : 'Search'}</span>
              </button>
            </div>
          </div>

          <section className="mt-10">
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-base font-semibold text-text-primary">Recent searches</h2>
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by query…"
                className="w-40 rounded-lg border border-nativz-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-text-muted focus:border-accent focus:outline-none md:w-56"
              />
            </div>
            {filteredRecent.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-nativz-border bg-surface/30 p-6 text-center text-sm text-text-muted">
                No searches yet — run one above to get started.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {filteredRecent.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/admin/competitor-tracking/tiktok-shop/${s.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-nativz-border bg-surface px-4 py-3 transition hover:border-accent/40 hover:bg-surface-hover"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text-primary">{s.query}</p>
                        <div className="mt-1 flex items-center gap-3 text-xs text-text-muted">
                          <span className="inline-flex items-center gap-1">
                            <Clock size={12} aria-hidden />
                            {formatRelative(s.created_at)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <ShoppingBag size={12} aria-hidden />
                            {s.products_found} products
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <UsersIcon size={12} aria-hidden />
                            {s.creators_found} creators
                          </span>
                        </div>
                      </div>
                      <span
                        className={
                          s.status === 'completed'
                            ? 'rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300'
                            : s.status === 'failed'
                              ? 'rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-300'
                              : 'rounded-full border border-nativz-border bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted'
                        }
                      >
                        {STATUS_LABEL[s.status]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
