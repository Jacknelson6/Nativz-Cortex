'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ExternalLink,
  Globe2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  ShoppingBag,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ComboSelect } from '@/components/ui/combo-select';
import { Dialog } from '@/components/ui/dialog';

/**
 * NAT-51 — ecom competitor tracker UI. Pairs with the NAT-21 backend:
 * GET/POST/DELETE /api/ecom-competitors + POST /api/ecom-competitors/[id]/refresh.
 * Shows latest product_count / median price / top-3 thumbnails per competitor.
 */

type PortfolioClient = {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
};

interface TopProduct {
  title: string;
  url: string | null;
  price: number | null;
  currency: string | null;
  imageUrl: string | null;
  handle: string | null;
}

interface LatestSnapshot {
  id: string;
  ecom_competitor_id: string;
  scraped_at: string;
  product_count: number | null;
  top_products: TopProduct[] | null;
  signals: {
    currency: string | null;
    pricePercentiles?: { p25: number | null; p50: number | null; p75: number | null };
  } | null;
  source: string | null;
}

interface EcomCompetitor {
  id: string;
  client_id: string;
  domain: string;
  platform: 'shopify' | 'woo' | 'magento' | 'bigcommerce' | 'other';
  display_name: string | null;
  created_at: string;
  latest_snapshot: LatestSnapshot | null;
}

const PLATFORM_LABELS: Record<EcomCompetitor['platform'], string> = {
  shopify: 'Shopify',
  woo: 'WooCommerce',
  magento: 'Magento',
  bigcommerce: 'BigCommerce',
  other: 'Other',
};

function formatPrice(value: number | null | undefined, currency: string | null): string {
  if (value == null) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency ?? 'USD',
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency ?? ''}`.trim();
  }
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const now = Date.now();
  const then = new Date(iso).getTime();
  const deltaSec = Math.round((now - then) / 1000);
  if (deltaSec < 60) return 'just now';
  if (deltaSec < 3600) return `${Math.round(deltaSec / 60)}m ago`;
  if (deltaSec < 86400) return `${Math.round(deltaSec / 3600)}h ago`;
  return `${Math.round(deltaSec / 86400)}d ago`;
}

export function EcomTrackerClient({
  clients,
  initialClientId,
}: {
  clients: PortfolioClient[];
  initialClientId: string | null;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState<string | null>(initialClientId);
  const [competitors, setCompetitors] = useState<EcomCompetitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());

  const loadCompetitors = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ecom-competitors?client_id=${id}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error ?? 'Failed to load');
        return;
      }
      const d = (await res.json()) as { competitors: EcomCompetitor[] };
      setCompetitors(d.competitors ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (clientId) loadCompetitors(clientId);
    else setCompetitors([]);
  }, [clientId, loadCompetitors]);

  function handleSelectClient(id: string) {
    setClientId(id);
    const params = new URLSearchParams();
    params.set('clientId', id);
    router.replace(`/admin/competitor-tracking/ecom?${params.toString()}`, { scroll: false });
  }

  async function handleRefresh(id: string) {
    setRefreshingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/ecom-competitors/${id}/refresh`, { method: 'POST' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error ?? 'Refresh failed');
        return;
      }
      toast.success('Snapshot refreshed');
      if (clientId) await loadCompetitors(clientId);
    } finally {
      setRefreshingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleDelete(competitor: EcomCompetitor) {
    if (!confirm(`Remove ${competitor.display_name ?? competitor.domain} from tracking?`)) return;
    const res = await fetch(`/api/ecom-competitors?id=${competitor.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error((d as { error?: string }).error ?? 'Delete failed');
      return;
    }
    toast.success('Competitor removed');
    if (clientId) loadCompetitors(clientId);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-10">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-surface text-accent-text">
            <ShoppingBag size={18} aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Ecom competitors</h1>
            <p className="text-sm text-text-secondary">
              Track storefronts and product catalogs. Daily cron refreshes stale snapshots.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} disabled={!clientId}>
          <Plus size={14} />
          Add domain
        </Button>
      </header>

      <div className="w-72">
        <ComboSelect
          label="Client"
          options={clients.map((c) => ({ value: c.id, label: c.name }))}
          value={clientId ?? ''}
          onChange={handleSelectClient}
          placeholder="Select a client…"
        />
      </div>

      {!clientId ? (
        <Card>
          <p className="py-12 text-center text-text-muted">
            Pick a client to see their tracked ecom competitors.
          </p>
        </Card>
      ) : loading && competitors.length === 0 ? (
        <Card>
          <p className="flex items-center justify-center gap-2 py-12 text-text-muted">
            <Loader2 size={16} className="animate-spin" /> Loading competitors…
          </p>
        </Card>
      ) : competitors.length === 0 ? (
        <Card className="text-center">
          <Globe2 size={28} className="mx-auto text-text-muted" />
          <p className="mt-3 text-sm font-medium text-text-primary">No ecom competitors yet</p>
          <p className="mt-1 text-xs text-text-muted">
            Paste a storefront URL (Shopify, Woo, etc.) to start tracking product count + pricing
            signals.
          </p>
          <div className="mt-4">
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus size={14} />
              Add first competitor
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {competitors.map((competitor) => (
            <EcomCompetitorCard
              key={competitor.id}
              competitor={competitor}
              refreshing={refreshingIds.has(competitor.id)}
              onRefresh={() => handleRefresh(competitor.id)}
              onDelete={() => handleDelete(competitor)}
            />
          ))}
        </div>
      )}

      {addOpen && clientId && (
        <AddCompetitorModal
          clientId={clientId}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false);
            loadCompetitors(clientId);
          }}
        />
      )}
    </div>
  );
}

function EcomCompetitorCard({
  competitor,
  refreshing,
  onRefresh,
  onDelete,
}: {
  competitor: EcomCompetitor;
  refreshing: boolean;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  const snap = competitor.latest_snapshot;
  const currency = snap?.signals?.currency ?? 'USD';
  const p50 = snap?.signals?.pricePercentiles?.p50 ?? null;
  const topThree = (snap?.top_products ?? []).slice(0, 3);

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-text-primary">
            {competitor.display_name ?? competitor.domain}
          </p>
          <a
            href={`https://${competitor.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent-text"
          >
            {competitor.domain}
            <ExternalLink size={10} aria-hidden />
          </a>
        </div>
        <span className="shrink-0 rounded-full border border-nativz-border bg-surface-hover px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
          {PLATFORM_LABELS[competitor.platform]}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-lg border border-nativz-border bg-surface-hover px-3 py-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Products</p>
          <p className="text-sm font-semibold text-text-primary tabular-nums">
            {snap?.product_count ?? '—'}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Median price</p>
          <p className="text-sm font-semibold text-text-primary tabular-nums">
            {formatPrice(p50, currency)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Last scrape</p>
          <p className="text-sm font-semibold text-text-primary">
            {formatRelativeTime(snap?.scraped_at ?? null)}
          </p>
        </div>
      </div>

      {topThree.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {topThree.map((p, i) => (
            <a
              key={`${competitor.id}-${i}`}
              href={p.url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative aspect-square overflow-hidden rounded-md border border-nativz-border bg-surface-hover"
            >
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.imageUrl}
                  alt={p.title}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-text-muted">
                  <Globe2 size={20} />
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-1 text-[10px] text-white">
                <p className="truncate">{p.title}</p>
                {p.price != null && (
                  <p className="text-[9px] text-white/70">
                    {formatPrice(p.price, p.currency ?? currency)}
                  </p>
                )}
              </div>
            </a>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between pt-1">
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>
          <Trash2 size={14} />
          Remove
        </Button>
      </div>
    </Card>
  );
}

function AddCompetitorModal({
  clientId,
  onClose,
  onAdded,
}: {
  clientId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [domain, setDomain] = useState('');
  const [platform, setPlatform] =
    useState<EcomCompetitor['platform']>('shopify');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/ecom-competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          domain: domain.trim(),
          platform,
          display_name: displayName.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error ?? 'Failed to add');
        return;
      }
      toast.success('Competitor added');
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="" maxWidth="md" bodyClassName="p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="pr-10">
          <h2 className="text-base font-semibold text-text-primary">Track a store</h2>
          <p className="text-xs text-text-muted">
            Paste the storefront domain — we&apos;ll run the Apify scraper on refresh + daily cron.
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-text-muted">Domain</label>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="store.example.com"
            required
            className="w-full rounded-lg border border-nativz-border bg-surface-hover px-3 py-2 text-sm text-text-primary"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-text-muted">Platform</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as EcomCompetitor['platform'])}
            className="w-full rounded-lg border border-nativz-border bg-surface-hover px-3 py-2 text-sm text-text-primary"
          >
            {(Object.entries(PLATFORM_LABELS) as [EcomCompetitor['platform'], string][]).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ),
            )}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-text-muted">Display name (optional)</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Example Co."
            className="w-full rounded-lg border border-nativz-border bg-surface-hover px-3 py-2 text-sm text-text-primary"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving || !domain.trim()}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            Add competitor
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
