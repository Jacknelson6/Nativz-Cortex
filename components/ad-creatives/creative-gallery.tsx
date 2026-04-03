'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Copy, Heart, Images, RefreshCw, Sparkles, Trash2, Download, X, CircleStop } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { CreativeCard } from './creative-card';
import { GalleryPlaceholder } from './gallery-placeholder';
import { Dialog } from '@/components/ui/dialog';
import { downloadCreativesAsZip } from '@/lib/ad-creatives/bulk-download-creatives';
import type { AdCreative } from '@/lib/ad-creatives/types';
import { sortAdCreativesForGallery } from '@/lib/ad-creatives/sort-creatives';
import type { AdBatchPlaceholderConfig } from '@/lib/ad-creatives/placeholder-config';

const BULK_MAX = 50;

/** API default page size is 24; max is 100. Load every page so the grid matches Supabase. */
const GALLERY_FETCH_LIMIT = 100;

async function fetchAllAdCreativesForGallery(clientId: string): Promise<AdCreative[]> {
  const limit = GALLERY_FETCH_LIMIT;
  let page = 1;
  const byId = new Map<string, AdCreative>();
  let reportedTotal: number | null = null;

  for (let guard = 0; guard < 200; guard++) {
    const res = await fetch(
      `/api/clients/${encodeURIComponent(clientId)}/ad-creatives?limit=${limit}&page=${page}`,
    );
    if (!res.ok) break;
    const data = (await res.json()) as { creatives?: AdCreative[]; total?: number };
    if (typeof data.total === 'number') reportedTotal = data.total;
    const batch = data.creatives ?? [];
    for (const c of batch) {
      if (c?.id) byId.set(c.id, c);
    }
    if (batch.length === 0) break;
    if (batch.length < limit) break;
    if (reportedTotal !== null && byId.size >= reportedTotal) break;
    page++;
  }

  return sortAdCreativesForGallery([...byId.values()]);
}

function formatBatchDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const dayMs = 86_400_000;
  const diff = now.getTime() - d.getTime();
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (diff < dayMs && d.getDate() === now.getDate()) return `Today, ${timeStr}`;
  if (diff < 2 * dayMs) return `Yesterday, ${timeStr}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + `, ${timeStr}`;
}

type FilterTab = 'all' | 'favorites';

type BatchProgressSnapshot = {
  status: string;
  completed: number;
  failed: number;
  total: number;
  batchCreatedAt: string | null;
  checkedAt: string;
};

interface CreativeGalleryProps {
  clientId: string;
  /** When false, empty state points users to the Brand DNA tab (CTA lives in the parent toolbar). */
  brandDnaReady?: boolean;
  activeBatchId?: string | null;
  placeholderConfig?: AdBatchPlaceholderConfig | null;
  onBatchComplete?: () => void;
  /** Opens generate wizard pre-filled from the selected creative (Brand DNA ready only). */
  onCreateMoreLikeThis?: (creative: AdCreative) => void;
}

export function CreativeGallery({
  clientId,
  brandDnaReady = true,
  activeBatchId,
  placeholderConfig,
  onBatchComplete,
  onCreateMoreLikeThis,
}: CreativeGalleryProps) {
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [selectedCreative, setSelectedCreative] = useState<AdCreative | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);
  /** Batch started outside this session (e.g. CLI) — parent may not have activeBatchId. */
  const [discoveredBatchId, setDiscoveredBatchId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<BatchProgressSnapshot | null>(null);
  const [refreshingGallery, setRefreshingGallery] = useState(false);
  const [stoppingBatch, setStoppingBatch] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const effectiveBatchId = activeBatchId ?? discoveredBatchId ?? null;

  const mergeBatchPollPayload = useCallback(
    (data: {
      batch?: {
        status?: string;
        completed_count?: number;
        failed_count?: number;
        total_count?: number;
        created_at?: string;
      };
      creatives?: AdCreative[];
    }) => {
      const b = data.batch;
      if (b?.status) {
        setBatchProgress({
          status: b.status,
          completed: Number(b.completed_count ?? 0),
          failed: Number(b.failed_count ?? 0),
          total: Number(b.total_count ?? 0),
          batchCreatedAt: typeof b.created_at === 'string' ? b.created_at : null,
          checkedAt: new Date().toISOString(),
        });
      }
      const batchCreatives: AdCreative[] = data.creatives ?? [];
      setCreatives((prev) => {
        if (batchCreatives.length === 0) return prev;
        const byId = new Map<string, AdCreative>(prev.map((c) => [c.id, c]));
        for (const c of batchCreatives) {
          byId.set(c.id, c);
        }
        return sortAdCreativesForGallery([...byId.values()]);
      });
    },
    [],
  );

  const { confirm: confirmBulkDelete, dialog: bulkDeleteDialog } = useConfirm({
    title: 'Delete selected creatives',
    description: 'These ads will be permanently removed. This cannot be undone.',
    confirmLabel: 'Delete',
    variant: 'danger',
  });

  const fetchCreatives = useCallback(async () => {
    try {
      const list = await fetchAllAdCreativesForGallery(clientId);
      setCreatives(list);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchCreatives();
  }, [fetchCreatives]);

  // Pick up in-flight batches (CLI / other tab) when parent did not set activeBatchId
  useEffect(() => {
    if (!clientId) return;
    if (activeBatchId) {
      setDiscoveredBatchId(null);
      return;
    }
    let cancelled = false;
    async function discover() {
      try {
        const res = await fetch(
          `/api/clients/${clientId}/ad-creatives/batches?status=generating,queued`,
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const batches = data.batches ?? [];
        const active = batches.find(
          (b: { status: string }) => b.status === 'generating' || b.status === 'queued',
        );
        if (!cancelled) setDiscoveredBatchId((active as { id?: string } | undefined)?.id ?? null);
      } catch {
        /* ignore */
      }
    }
    void discover();
    const t = setInterval(() => void discover(), 6000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [clientId, activeBatchId]);

  useEffect(() => {
    if (!effectiveBatchId) setBatchProgress(null);
  }, [effectiveBatchId]);

  // Poll for batch progress when actively generating
  useEffect(() => {
    if (!effectiveBatchId || !clientId) return;

    async function pollBatch() {
      try {
        const res = await fetch(`/api/clients/${clientId}/ad-creatives/batches/${effectiveBatchId}`);
        if (!res.ok) return;
        const data = await res.json();
        mergeBatchPollPayload(data);

        const status = data.batch?.status;
        if (
          status === 'completed' ||
          status === 'failed' ||
          status === 'partial' ||
          status === 'cancelled'
        ) {
          if (pollRef.current) clearInterval(pollRef.current);
          setDiscoveredBatchId(null);
          onBatchComplete?.();
        }
      } catch {
        // Keep polling
      }
    }

    pollBatch();
    pollRef.current = setInterval(pollBatch, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [effectiveBatchId, clientId, mergeBatchPollPayload, onBatchComplete]);

  const discoverActiveBatchId = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch(
        `/api/clients/${clientId}/ad-creatives/batches?status=generating,queued`,
      );
      if (!res.ok) return null;
      const data = await res.json();
      const batches = data.batches ?? [];
      const active = batches.find(
        (b: { status: string }) => b.status === 'generating' || b.status === 'queued',
      ) as { id?: string } | undefined;
      return active?.id ?? null;
    } catch {
      return null;
    }
  }, [clientId]);

  const handleStopBatch = useCallback(async () => {
    if (!effectiveBatchId) return;
    setStoppingBatch(true);
    try {
      const res = await fetch(
        `/api/clients/${clientId}/ad-creatives/batches/${effectiveBatchId}/cancel`,
        { method: 'POST' },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Could not stop batch');
        return;
      }
      toast.success('Stopping generation — images already in flight may still finish');
      if (pollRef.current) clearInterval(pollRef.current);
      const resBatch = await fetch(`/api/clients/${clientId}/ad-creatives/batches/${effectiveBatchId}`);
      if (resBatch.ok) {
        const payload = await resBatch.json();
        mergeBatchPollPayload(payload);
      }
      setDiscoveredBatchId(null);
      onBatchComplete?.();
    } catch {
      toast.error('Could not stop batch');
    } finally {
      setStoppingBatch(false);
    }
  }, [clientId, effectiveBatchId, mergeBatchPollPayload, onBatchComplete]);

  const handleRefreshGallery = useCallback(async () => {
    setRefreshingGallery(true);
    try {
      const list = await fetchAllAdCreativesForGallery(clientId);
      setCreatives(list);

      let batchId = effectiveBatchId;
      if (!batchId) {
        const found = await discoverActiveBatchId();
        if (found) setDiscoveredBatchId(found);
        batchId = found;
      }

      if (batchId) {
        const resBatch = await fetch(`/api/clients/${clientId}/ad-creatives/batches/${batchId}`);
        if (resBatch.ok) {
          const payload = await resBatch.json();
          mergeBatchPollPayload(payload);
          const st = payload.batch?.status;
          if (st === 'completed' || st === 'failed' || st === 'partial' || st === 'cancelled') {
            setDiscoveredBatchId(null);
            onBatchComplete?.();
          }
        }
      }

      toast.success('Gallery refreshed');
    } catch {
      toast.error('Could not refresh. Try again.');
    } finally {
      setRefreshingGallery(false);
    }
  }, [
    clientId,
    effectiveBatchId,
    discoverActiveBatchId,
    mergeBatchPollPayload,
    onBatchComplete,
  ]);

  const toggleFavorite = async (id: string) => {
    const creative = creatives.find((c) => c.id === id);
    if (!creative) return;

    const next = !creative.is_favorite;
    setCreatives((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_favorite: next } : c)),
    );

    await fetch(`/api/clients/${clientId}/ad-creatives`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creativeId: id, is_favorite: next }),
    }).catch(() => {
      // Revert on failure
      setCreatives((prev) =>
        prev.map((c) => (c.id === id ? { ...c, is_favorite: !next } : c)),
      );
    });
  };

  const deleteCreative = async (id: string) => {
    setCreatives((prev) => prev.filter((c) => c.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    await fetch(`/api/clients/${clientId}/ad-creatives`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creativeId: id }),
    }).catch(() => {
      fetchCreatives(); // Refetch on failure
    });
  };

  const filtered = useMemo(() => {
    return creatives.filter((c) => {
      if (filterTab === 'favorites' && !c.is_favorite) return false;
      return true;
    });
  }, [creatives, filterTab]);

  const selectableCreatives = filtered;

  useEffect(() => {
    const allow = new Set(selectableCreatives.map((c) => c.id));
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (allow.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [selectableCreatives]);

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function toggleCreativeSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= BULK_MAX) {
          toast.message(`You can select up to ${BULK_MAX} ads at once.`);
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  }

  function selectAllVisible() {
    const ids = selectableCreatives.map((c) => c.id).slice(0, BULK_MAX);
    setSelectedIds(new Set(ids));
    if (selectableCreatives.length > BULK_MAX) {
      toast.message(`Only the first ${BULK_MAX} visible ads were selected. Deselect some or run another batch.`);
    }
  }

  async function bulkSetFavorite(isFavorite: boolean) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkWorking(true);
    const idSet = new Set(ids);
    const prev = creatives.map((c) => ({ id: c.id, f: c.is_favorite }));
    setCreatives((list) =>
      list.map((c) => (idSet.has(c.id) ? { ...c, is_favorite: isFavorite } : c)),
    );
    try {
      const res = await fetch(`/api/clients/${clientId}/ad-creatives`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creativeIds: ids, is_favorite: isFavorite }),
      });
      if (!res.ok) throw new Error('Update failed');
      const data = await res.json().catch(() => ({}));
      const n = typeof data.updatedCount === 'number' ? data.updatedCount : ids.length;
      toast.success(isFavorite ? `Added ${n} to favorites` : `Removed ${n} from favorites`);
    } catch {
      setCreatives((list) =>
        list.map((c) => {
          const p = prev.find((x) => x.id === c.id);
          return p ? { ...c, is_favorite: p.f } : c;
        }),
      );
      toast.error('Could not update favorites');
    } finally {
      setBulkWorking(false);
    }
  }

  async function bulkDownloadZip() {
    const chosen = creatives.filter((c) => selectedIds.has(c.id));
    if (chosen.length === 0) return;
    setBulkWorking(true);
    try {
      const { added, skipped } = await downloadCreativesAsZip(chosen, `ad-creatives-${clientId.slice(0, 8)}`);
      if (skipped > 0) {
        toast.message(`Downloaded ${added} files in the zip. ${skipped} could not be fetched.`);
      } else {
        toast.success(`Downloaded ${added} creatives as a zip`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setBulkWorking(false);
    }
  }

  async function bulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const ok = await confirmBulkDelete();
    if (!ok) return;
    setBulkWorking(true);
    setCreatives((prev) => prev.filter((c) => !selectedIds.has(c.id)));
    setSelectedIds(new Set());
    try {
      const res = await fetch(`/api/clients/${clientId}/ad-creatives`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creativeIds: ids }),
      });
      if (!res.ok) throw new Error('Delete failed');
      const data = await res.json().catch(() => ({}));
      const n = typeof data.deletedCount === 'number' ? data.deletedCount : ids.length;
      toast.success(`Deleted ${n} creatives`);
    } catch {
      fetchCreatives();
      toast.error('Could not delete some creatives');
    } finally {
      setBulkWorking(false);
    }
  }

  // Group filtered creatives by batch_id, preserving newest-first order
  const batchGroups = useMemo(() => {
    const seenBatches: string[] = [];
    const map = new Map<string, AdCreative[]>();
    for (const c of filtered) {
      const key = c.batch_id ?? 'unknown';
      if (!map.has(key)) {
        seenBatches.push(key);
        map.set(key, []);
      }
      map.get(key)!.push(c);
    }
    return seenBatches.map((batchId) => ({
      batchId,
      items: map.get(batchId)!,
    }));
  }, [filtered]);

  const isBatchGenerating =
    !!effectiveBatchId &&
    !!batchProgress &&
    (batchProgress.status === 'generating' || batchProgress.status === 'queued');

  const expectedSlotsTotal = useMemo(() => {
    if (batchProgress && batchProgress.total > 0) return batchProgress.total;
    if (placeholderConfig?.templateThumbnails.length)
      return placeholderConfig.templateThumbnails.length;
    return 0;
  }, [batchProgress, placeholderConfig]);

  const activeBatchCreativesSorted = useMemo(() => {
    if (!effectiveBatchId) return [];
    return filtered
      .filter((c) => c.batch_id === effectiveBatchId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [filtered, effectiveBatchId]);

  /** In-flight batch with no rows in `filtered` yet (copy step / first image) still needs skeleton grid. */
  const displayGroups = useMemo(() => {
    if (!effectiveBatchId) return batchGroups;
    const has = batchGroups.some((g) => g.batchId === effectiveBatchId);
    if (has) return batchGroups;
    if (!isBatchGenerating && activeBatchCreativesSorted.length === 0) return batchGroups;
    return [{ batchId: effectiveBatchId, items: activeBatchCreativesSorted }, ...batchGroups];
  }, [batchGroups, effectiveBatchId, isBatchGenerating, activeBatchCreativesSorted]);

  const skeletonBrandColors = placeholderConfig?.brandColors?.length
    ? placeholderConfig.brandColors
    : ['#1e293b', '#334155'];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-surface p-0.5">
            <Skeleton className="h-8 w-14 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
          <Skeleton className="h-8 w-16 rounded-md border border-nativz-border" />
        </div>
        <div className="columns-2 gap-4 space-y-4 md:columns-3 lg:columns-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full break-inside-avoid rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (creatives.length === 0 && !effectiveBatchId) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-10 sm:py-14 px-4">
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-nativz-border/70 bg-surface px-8 py-14 text-center shadow-[0_28px_80px_-40px_rgba(0,0,0,0.75)]">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_55%_at_50%_-25%,rgba(59,130,246,0.14),transparent)]"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-16 left-1/2 h-40 w-[120%] -translate-x-1/2 rounded-full bg-accent/[0.06] blur-3xl"
              aria-hidden
            />
            <div className="relative space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Gallery</p>
              <div className="mx-auto flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/20 to-accent/[0.06] shadow-[0_0_40px_-12px_rgba(59,130,246,0.45)]">
                <Images size={30} className="text-accent-text" strokeWidth={1.5} />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
                  Nothing here yet
                </h2>
                <p className="text-sm leading-relaxed text-text-muted">
                  {brandDnaReady ? (
                    <>
                      Finished ads appear in this grid as each image completes. Use the{' '}
                      <span className="text-text-secondary font-medium">Generate</span> button below to start a batch.
                    </>
                  ) : (
                    <>
                      Complete your brand kit on the{' '}
                      <span className="text-text-secondary font-medium">Brand DNA</span> tab, then come back here to
                      generate.
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 items-center justify-center mt-2 w-full max-w-xs mx-auto sm:max-w-none">
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  shape="pill"
                  className="w-full border-nativz-border sm:w-auto"
                  disabled={refreshingGallery}
                  onClick={() => void handleRefreshGallery()}
                >
                  <RefreshCw size={18} className={refreshingGallery ? 'animate-spin' : ''} />
                  Refresh gallery
                </Button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
    {bulkDeleteDialog}
    <div className="space-y-4 pb-24 sm:pb-28">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-surface rounded-lg p-0.5">
            {(['all', 'favorites'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setFilterTab(tab);
                  if (selectionMode) exitSelectionMode();
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                  filterTab === tab
                    ? 'bg-background text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {tab === 'all' ? 'All' : 'Favorites'}
              </button>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant={selectionMode ? 'secondary' : 'outline'}
            className="h-8 text-xs border-nativz-border"
            onClick={() => {
              if (selectionMode) exitSelectionMode();
              else setSelectionMode(true);
            }}
          >
            {selectionMode ? 'Cancel' : 'Select'}
          </Button>
          <span className="text-xs text-text-muted tabular-nums px-1">
            {creatives.length} {creatives.length === 1 ? 'ad' : 'ads'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {effectiveBatchId &&
            (!batchProgress ||
              batchProgress.status === 'generating' ||
              batchProgress.status === 'queued') && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5 border-amber-500/35 text-amber-200 hover:bg-amber-500/10 hover:text-amber-100"
                disabled={stoppingBatch || refreshingGallery}
                onClick={() => void handleStopBatch()}
              >
                <CircleStop size={14} />
                {stoppingBatch ? 'Stopping…' : 'Stop generation'}
              </Button>
            )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5 border-nativz-border shrink-0"
            disabled={refreshingGallery}
            onClick={() => void handleRefreshGallery()}
          >
            <RefreshCw size={14} className={refreshingGallery ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </div>
      </div>

      {selectionMode && (
        <div className="flex flex-col gap-3 rounded-xl border border-nativz-border bg-surface/80 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-text-primary">
              {selectedIds.size === 0
                ? 'Tap creatives to select'
                : `${selectedIds.size} selected`}
            </span>
            <span className="text-xs text-text-muted">Max {BULK_MAX} at once</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={selectableCreatives.length === 0 || bulkWorking}
              onClick={selectAllVisible}
            >
              Select all visible
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 text-xs gap-1"
              disabled={selectedIds.size === 0 || bulkWorking}
              onClick={() => setSelectedIds(new Set())}
            >
              <X size={14} />
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1"
              disabled={selectedIds.size === 0 || bulkWorking}
              onClick={() => void bulkDownloadZip()}
            >
              <Download size={14} />
              Download zip
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1"
              disabled={selectedIds.size === 0 || bulkWorking}
              onClick={() => void bulkSetFavorite(true)}
            >
              <Heart size={14} />
              Favorite
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1"
              disabled={selectedIds.size === 0 || bulkWorking}
              onClick={() => void bulkSetFavorite(false)}
            >
              Unfavorite
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              className="h-8 text-xs gap-1"
              disabled={selectedIds.size === 0 || bulkWorking}
              onClick={() => void bulkDelete()}
            >
              <Trash2 size={14} />
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Batch-grouped grid */}
      <div className="space-y-6">
        {displayGroups.map((group, groupIndex) => {
          const isActiveBatch = effectiveBatchId != null && group.batchId === effectiveBatchId;
          const firstCreated = group.items[0]?.created_at;
          const itemsSorted = [...group.items].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          );
          const skeletonCount =
            isActiveBatch && isBatchGenerating && expectedSlotsTotal > 0
              ? Math.max(0, expectedSlotsTotal - itemsSorted.length)
              : 0;

          return (
            <div key={group.batchId} className="space-y-3">
              {groupIndex > 0 && (
                <div className="flex items-center gap-3 pt-2">
                  <div className="flex-1 h-px bg-nativz-border/60" />
                  {firstCreated && (
                    <span className="text-xs text-text-muted shrink-0">
                      {formatBatchDate(firstCreated)}
                    </span>
                  )}
                  <div className="flex-1 h-px bg-nativz-border/60" />
                </div>
              )}

              <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
                {itemsSorted.map((creative) => (
                  <div key={creative.id} className="break-inside-avoid">
                    <CreativeCard
                      creative={creative}
                      onFavorite={() => toggleFavorite(creative.id)}
                      onDelete={() => deleteCreative(creative.id)}
                      onClick={() => setSelectedCreative(creative)}
                      selectionMode={selectionMode}
                      selected={selectedIds.has(creative.id)}
                      onToggleSelect={() => toggleCreativeSelected(creative.id)}
                      onOpenDetail={() => setSelectedCreative(creative)}
                    />
                  </div>
                ))}
                {Array.from({ length: skeletonCount }).map((_, i) => {
                  const thumb = placeholderConfig?.templateThumbnails[itemsSorted.length + i];
                  return (
                    <div key={`sk-${group.batchId}-${i}`} className="break-inside-avoid">
                      <GalleryPlaceholder
                        brandColors={skeletonBrandColors}
                        templateThumbnailUrl={thumb?.imageUrl}
                        skeletonOnly={placeholderConfig?.skeletonOnly}
                        status="generating"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && !effectiveBatchId && (
          <p className="text-sm text-text-muted text-center py-12">
            No creatives match the current filters.
          </p>
        )}
      </div>

      {/* Detail modal */}
      <Dialog
        open={selectedCreative !== null}
        onClose={() => setSelectedCreative(null)}
        title="Creative detail"
        maxWidth="2xl"
      >
        {selectedCreative && (
          <div className="space-y-4">
            <img
              src={selectedCreative.image_url}
              alt={selectedCreative.on_screen_text?.headline ?? 'Creative'}
              className="w-full rounded-xl"
            />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-text-primary">
                {selectedCreative.on_screen_text?.headline ?? ''}
              </h3>
              {selectedCreative.on_screen_text?.subheadline && (
                <p className="text-xs text-text-secondary">
                  {selectedCreative.on_screen_text.subheadline}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-text-muted rounded-full bg-background border border-nativz-border px-2 py-0.5">
                  {selectedCreative.aspect_ratio}
                </span>
                <span className="text-xs text-text-muted rounded-full bg-background border border-nativz-border px-2 py-0.5 max-w-[min(100%,280px)] truncate">
                  {selectedCreative.product_service}
                </span>
              </div>

              <div className="space-y-2 pt-2 border-t border-nativz-border/60">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Image prompt</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs text-text-muted hover:text-text-secondary"
                    disabled={!selectedCreative.prompt_used?.trim()}
                    onClick={async () => {
                      const text = selectedCreative.prompt_used?.trim() ?? '';
                      if (!text) return;
                      try {
                        await navigator.clipboard.writeText(text);
                        toast.success('Prompt copied');
                      } catch {
                        toast.error('Could not copy');
                      }
                    }}
                  >
                    <Copy size={14} />
                    Copy
                  </Button>
                </div>
                <div className="rounded-xl border border-nativz-border bg-background/40 px-3 py-2 max-h-40 overflow-y-auto">
                  <pre className="text-xs leading-relaxed text-text-secondary whitespace-pre-wrap font-sans">
                    {selectedCreative.prompt_used?.trim() || 'No prompt was stored for this creative.'}
                  </pre>
                </div>
                {brandDnaReady && onCreateMoreLikeThis && (
                  <Button
                    type="button"
                    size="sm"
                    shape="pill"
                    className="w-full sm:w-auto gap-2 border border-nativz-border bg-background/50 hover:bg-background/70"
                    onClick={() => {
                      onCreateMoreLikeThis(selectedCreative);
                      setSelectedCreative(null);
                    }}
                  >
                    <Sparkles size={15} className="text-accent-text" />
                    Create more like this
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
    </>
  );
}
