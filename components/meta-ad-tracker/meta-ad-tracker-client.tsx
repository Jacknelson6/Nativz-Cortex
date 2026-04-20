'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ExternalLink,
  Facebook,
  Film,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ComboSelect } from '@/components/ui/combo-select';

/**
 * NAT-53 — Meta Ad Library tracker UI. Reuses the thumbnails-grid style
 * from the prospect-audit scraper. Pairs with the NAT-22 backend:
 * GET/POST/DELETE /api/meta-ad-tracker/pages +
 * POST /api/meta-ad-tracker/pages/[id]/refresh.
 */

type PortfolioClient = { id: string; name: string };

interface Creative {
  id: string;
  tracked_page_id: string;
  ad_archive_id: string | null;
  scraped_at: string;
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean | null;
  started_on: string | null;
  ended_on: string | null;
  image_urls: string[] | null;
  video_urls: string[] | null;
  thumbnail_url: string | null;
  body_text: string | null;
  headline: string | null;
  cta_text: string | null;
  landing_url: string | null;
  platforms: string[] | null;
}

interface TrackedPage {
  id: string;
  client_id: string;
  page_id: string | null;
  page_name: string | null;
  library_url: string;
  country: string | null;
  created_at: string;
  creative_count: number;
  recent_creatives: Creative[];
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

export function MetaAdTrackerClient({
  clients,
  initialClientId,
}: {
  clients: PortfolioClient[];
  initialClientId: string | null;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState<string | null>(initialClientId);
  const [pages, setPages] = useState<TrackedPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [showInactive, setShowInactive] = useState(false);

  const loadPages = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/meta-ad-tracker/pages?client_id=${id}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error ?? 'Failed to load');
        return;
      }
      const d = (await res.json()) as { pages: TrackedPage[] };
      setPages(d.pages ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (clientId) loadPages(clientId);
    else setPages([]);
  }, [clientId, loadPages]);

  function handleSelectClient(id: string) {
    setClientId(id);
    const params = new URLSearchParams();
    params.set('clientId', id);
    router.replace(`/admin/competitor-tracking/meta-ads?${params.toString()}`, {
      scroll: false,
    });
  }

  async function handleRefresh(id: string) {
    setRefreshingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/meta-ad-tracker/pages/${id}/refresh`, { method: 'POST' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error ?? 'Refresh failed');
        return;
      }
      const d = (await res.json()) as { scraped: number; inserted: number; updated: number };
      toast.success(`Refreshed — ${d.scraped} ads (${d.inserted} new, ${d.updated} updated)`);
      if (clientId) await loadPages(clientId);
    } finally {
      setRefreshingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleDelete(page: TrackedPage) {
    const label = page.page_name ?? page.page_id ?? page.library_url;
    if (!confirm(`Stop tracking ${label}? All stored creatives will be removed.`)) return;
    const res = await fetch(`/api/meta-ad-tracker/pages?id=${page.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error((d as { error?: string }).error ?? 'Delete failed');
      return;
    }
    toast.success('Tracked page removed');
    if (clientId) loadPages(clientId);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-10">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-surface text-accent-text">
            <Facebook size={18} aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Meta Ad Library</h1>
            <p className="text-sm text-text-secondary">
              Track competitor Facebook Pages — daily cron refreshes creatives with
              image/video previews + last-seen dates.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} disabled={!clientId}>
          <Plus size={14} />
          Add page
        </Button>
      </header>

      <div className="flex flex-wrap items-end gap-4">
        <div className="w-72">
          <ComboSelect
            label="Client"
            options={clients.map((c) => ({ value: c.id, label: c.name }))}
            value={clientId ?? ''}
            onChange={handleSelectClient}
            placeholder="Select a client…"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-nativz-border bg-surface-hover"
          />
          Show ended/archived ads
        </label>
      </div>

      {!clientId ? (
        <Card>
          <p className="py-12 text-center text-text-muted">
            Pick a client to see their tracked Facebook Pages.
          </p>
        </Card>
      ) : loading && pages.length === 0 ? (
        <Card>
          <p className="flex items-center justify-center gap-2 py-12 text-text-muted">
            <Loader2 size={16} className="animate-spin" /> Loading pages…
          </p>
        </Card>
      ) : pages.length === 0 ? (
        <Card className="text-center">
          <Facebook size={28} className="mx-auto text-text-muted" />
          <p className="mt-3 text-sm font-medium text-text-primary">No tracked pages yet</p>
          <p className="mt-1 text-xs text-text-muted">
            Paste a Meta Ad Library URL to start watching a competitor's active creatives.
          </p>
          <div className="mt-4">
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus size={14} />
              Add first page
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {pages.map((page) => (
            <TrackedPageCard
              key={page.id}
              page={page}
              showInactive={showInactive}
              refreshing={refreshingIds.has(page.id)}
              onRefresh={() => handleRefresh(page.id)}
              onDelete={() => handleDelete(page)}
            />
          ))}
        </div>
      )}

      {addOpen && clientId && (
        <AddPageModal
          clientId={clientId}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false);
            loadPages(clientId);
          }}
        />
      )}
    </div>
  );
}

function TrackedPageCard({
  page,
  showInactive,
  refreshing,
  onRefresh,
  onDelete,
}: {
  page: TrackedPage;
  showInactive: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  const creatives = useMemo(() => {
    if (showInactive) return page.recent_creatives;
    return page.recent_creatives.filter((c) => c.is_active !== false);
  }, [page.recent_creatives, showInactive]);

  const activeCount = page.recent_creatives.filter((c) => c.is_active !== false).length;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-text-primary">
            {page.page_name ?? page.page_id ?? 'Untitled page'}
          </p>
          <a
            href={page.library_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent-text"
          >
            Open in Ad Library
            <ExternalLink size={10} aria-hidden />
          </a>
        </div>
        <div className="flex items-center gap-2">
          {page.country && (
            <span className="shrink-0 rounded-full border border-nativz-border bg-surface-hover px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
              {page.country}
            </span>
          )}
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
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-lg border border-nativz-border bg-surface-hover px-3 py-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Active creatives</p>
          <p className="text-sm font-semibold text-text-primary tabular-nums">{activeCount}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Total tracked</p>
          <p className="text-sm font-semibold text-text-primary tabular-nums">
            {page.creative_count}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Last scrape</p>
          <p className="text-sm font-semibold text-text-primary">
            {formatRelativeTime(page.recent_creatives[0]?.scraped_at ?? null)}
          </p>
        </div>
      </div>

      {creatives.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {creatives.map((creative) => (
            <CreativeThumb key={creative.id} creative={creative} />
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-xs text-text-muted">
          {showInactive
            ? 'No creatives captured yet — run Refresh to fetch.'
            : 'No active creatives right now. Toggle "Show ended/archived ads" to see history.'}
        </p>
      )}
    </Card>
  );
}

function CreativeThumb({ creative }: { creative: Creative }) {
  const hasVideo = (creative.video_urls ?? []).length > 0;
  const inactive = creative.is_active === false;

  return (
    <a
      href={creative.landing_url ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className={`group relative block overflow-hidden rounded-lg border border-nativz-border bg-surface-hover ${
        inactive ? 'opacity-50' : ''
      }`}
      title={creative.headline ?? creative.body_text ?? ''}
    >
      <div className="aspect-[9/16] w-full">
        {creative.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={creative.thumbnail_url}
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-text-muted">
            <Facebook size={20} />
          </div>
        )}
      </div>
      {hasVideo && (
        <div className="absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1">
          <Film size={10} className="text-white" aria-hidden />
        </div>
      )}
      {inactive && (
        <div className="absolute left-1.5 top-1.5 rounded bg-red-500/80 px-1.5 py-0.5 text-[9px] font-medium text-white">
          ended
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-black/75 px-2 py-1.5 text-[10px] text-white">
        {creative.headline && <p className="truncate font-medium">{creative.headline}</p>}
        {creative.cta_text && <p className="text-[9px] text-white/70">{creative.cta_text}</p>}
      </div>
    </a>
  );
}

function AddPageModal({
  clientId,
  onClose,
  onAdded,
}: {
  clientId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [libraryUrl, setLibraryUrl] = useState('');
  const [pageName, setPageName] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!libraryUrl.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/meta-ad-tracker/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          library_url: libraryUrl.trim(),
          page_name: pageName.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error ?? 'Failed to add');
        return;
      }
      toast.success('Page added — hit Refresh to fetch creatives');
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg space-y-4 rounded-xl border border-nativz-border bg-surface p-6"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Track a Facebook Page</h2>
            <p className="mt-1 text-xs text-text-muted">
              Open the Meta Ad Library, filter to the Page you want, and paste the full URL here.
              Country + page_id are extracted automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-text-muted">Library URL</label>
          <input
            type="url"
            value={libraryUrl}
            onChange={(e) => setLibraryUrl(e.target.value)}
            placeholder="https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=US&view_all_page_id=…"
            required
            className="w-full rounded-lg border border-nativz-border bg-surface-hover px-3 py-2 text-sm text-text-primary"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-text-muted">Page name (optional)</label>
          <input
            type="text"
            value={pageName}
            onChange={(e) => setPageName(e.target.value)}
            placeholder="e.g. Competitor Co."
            className="w-full rounded-lg border border-nativz-border bg-surface-hover px-3 py-2 text-sm text-text-primary"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving || !libraryUrl.trim()}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            Add page
          </Button>
        </div>
      </form>
    </div>
  );
}
