'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Copy, Heart, Images, Loader2, Sparkles, Trash2, Download, X } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { CreativeCard } from './creative-card';
import { GalleryPlaceholder } from './gallery-placeholder';
import { Dialog } from '@/components/ui/dialog';
import { downloadCreativesAsZip } from '@/lib/ad-creatives/bulk-download-creatives';
import type { AdCreative } from '@/lib/ad-creatives/types';
import type { AdBatchPlaceholderConfig } from '@/lib/ad-creatives/placeholder-config';

const BULK_MAX = 50;

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

interface CreativeGalleryProps {
  clientId: string;
  /** When false, empty state points users to the Brand DNA tab (CTA lives in the parent toolbar). */
  brandDnaReady?: boolean;
  activeBatchId?: string | null;
  placeholderConfig?: AdBatchPlaceholderConfig | null;
  onBatchComplete?: () => void;
  /** Opens generate wizard pre-filled from the selected creative (Brand DNA ready only). */
  onCreateMoreLikeThis?: (creative: AdCreative) => void;
  /** When true, parent should hide the sticky-bar Generate button (CTA is shown in the empty state). */
  onGalleryEmptyForCtaChange?: (isEmpty: boolean) => void;
  /** Opens the generate wizard from the empty-state CTA. */
  onOpenGenerateWizard?: () => void;
}

export function CreativeGallery({
  clientId,
  brandDnaReady = true,
  activeBatchId,
  placeholderConfig,
  onBatchComplete,
  onCreateMoreLikeThis,
  onGalleryEmptyForCtaChange,
  onOpenGenerateWizard,
}: CreativeGalleryProps) {
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [selectedCreative, setSelectedCreative] = useState<AdCreative | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);
  const [batchCreativeIds, setBatchCreativeIds] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { confirm: confirmBulkDelete, dialog: bulkDeleteDialog } = useConfirm({
    title: 'Delete selected creatives',
    description: 'These ads will be permanently removed. This cannot be undone.',
    confirmLabel: 'Delete',
    variant: 'danger',
  });

  const fetchCreatives = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/ad-creatives`);
      if (res.ok) {
        const data = await res.json();
        setCreatives(data.creatives ?? []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchCreatives();
  }, [fetchCreatives]);

  useEffect(() => {
    if (!onGalleryEmptyForCtaChange) return;
    // While loading, keep parent unchanged (avoids header CTA flicker when re-entering gallery).
    if (loading) return;
    const empty = creatives.length === 0 && !activeBatchId;
    onGalleryEmptyForCtaChange(empty);
  }, [loading, creatives.length, activeBatchId, onGalleryEmptyForCtaChange]);

  // Poll for batch progress when actively generating
  useEffect(() => {
    if (!activeBatchId || !clientId) return;

    async function pollBatch() {
      try {
        const res = await fetch(`/api/clients/${clientId}/ad-creatives/batches/${activeBatchId}`);
        if (!res.ok) return;
        const data = await res.json();

        // Update batch creatives
        const batchCreatives: AdCreative[] = data.creatives ?? [];
        setBatchCreativeIds(new Set(batchCreatives.map((c: AdCreative) => c.id)));

        // Merge batch creatives into main list
        setCreatives((prev) => {
          const existingIds = new Set(prev.map((c) => c.id));
          const newOnes = batchCreatives.filter((c: AdCreative) => !existingIds.has(c.id));
          return newOnes.length > 0 ? [...newOnes, ...prev] : prev;
        });

        // Check if batch is done
        const status = data.batch?.status;
        if (status === 'completed' || status === 'failed' || status === 'partial') {
          if (pollRef.current) clearInterval(pollRef.current);
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
  }, [activeBatchId, clientId, onBatchComplete]);

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

  const selectableCreatives = useMemo(
    () => filtered.filter((c) => !batchCreativeIds.has(c.id)),
    [filtered, batchCreativeIds],
  );

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

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full break-inside-avoid" />
          ))}
        </div>
      </div>
    );
  }

  if (creatives.length === 0 && !activeBatchId) {
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Gallery</p>
              <div className="mx-auto flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/20 to-accent/[0.06] shadow-[0_0_40px_-12px_rgba(59,130,246,0.45)]">
                <Images size={30} className="text-accent-text" strokeWidth={1.5} />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
                  Nothing here yet
                </h2>
                <p className="text-sm leading-relaxed text-text-muted">
                  {brandDnaReady ? (
                    <>Finished ads appear in this grid as each image completes.</>
                  ) : (
                    <>
                      Complete your brand kit on the{' '}
                      <span className="text-text-secondary font-medium">Brand DNA</span> tab, then come back here to
                      generate.
                    </>
                  )}
                </p>
              </div>
              {brandDnaReady && onOpenGenerateWizard && (
                <Button
                  type="button"
                  size="lg"
                  shape="pill"
                  className="mt-2 w-full max-w-xs shadow-lg shadow-accent/15 sm:w-auto"
                  onClick={() => onOpenGenerateWizard()}
                >
                  <Sparkles size={18} strokeWidth={1.75} />
                  Generate creatives
                </Button>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
    {bulkDeleteDialog}
    <div className="space-y-4">
      {/* Filter bar */}
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
      </div>

      {selectionMode && (
        <div className="flex flex-col gap-3 rounded-xl border border-nativz-border bg-surface/80 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-text-primary">
              {selectedIds.size === 0
                ? 'Tap creatives to select'
                : `${selectedIds.size} selected`}
            </span>
            <span className="text-[11px] text-text-muted">Max {BULK_MAX} at once</span>
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
        {/* Active generating batch at the top */}
        {activeBatchId && !batchGroups.some((g) => g.batchId === activeBatchId) && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Loader2 size={12} className="animate-spin text-accent-text" />
              <span className="text-xs font-medium text-accent-text">Generating now</span>
            </div>
            {placeholderConfig && (
              <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
                {placeholderConfig.templateThumbnails.map((thumb, i) => (
                  <div key={`placeholder-${i}`} className="break-inside-avoid">
                    <GalleryPlaceholder
                      brandColors={placeholderConfig.brandColors}
                      templateThumbnailUrl={thumb.imageUrl}
                      skeletonOnly={placeholderConfig.skeletonOnly}
                      status="generating"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Grouped by batch */}
        {batchGroups.map((group, groupIndex) => {
          const isActiveBatch = group.batchId === activeBatchId;
          const firstCreated = group.items[0]?.created_at;
          const completedInBatch = group.items.filter((c) => batchCreativeIds.has(c.id));
          const remainingPlaceholders = isActiveBatch && placeholderConfig
            ? Math.max(0, placeholderConfig.templateThumbnails.length - completedInBatch.length)
            : 0;

          return (
            <div key={group.batchId} className="space-y-3">
              {/* Batch divider (not first group, or any group after an active batch) */}
              {groupIndex > 0 && (
                <div className="flex items-center gap-3 pt-2">
                  <div className="flex-1 h-px bg-nativz-border/60" />
                  {firstCreated && (
                    <span className="text-[11px] text-text-muted shrink-0">
                      {formatBatchDate(firstCreated)}
                    </span>
                  )}
                  <div className="flex-1 h-px bg-nativz-border/60" />
                </div>
              )}

              {isActiveBatch && (
                <div className="flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin text-accent-text" />
                  <span className="text-xs font-medium text-accent-text">Generating now</span>
                </div>
              )}

              <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
                {/* Remaining placeholder slots for this active batch */}
                {isActiveBatch && placeholderConfig && Array.from({ length: remainingPlaceholders }).map((_, i) => (
                  <div key={`placeholder-${i}`} className="break-inside-avoid">
                    <GalleryPlaceholder
                      brandColors={placeholderConfig.brandColors}
                      templateThumbnailUrl={placeholderConfig.templateThumbnails[completedInBatch.length + i]?.imageUrl}
                      skeletonOnly={placeholderConfig.skeletonOnly}
                      status="generating"
                    />
                  </div>
                ))}

                {/* Creatives in this batch */}
                {group.items.map((creative) => (
                  <div key={creative.id} className="break-inside-avoid">
                    {batchCreativeIds.has(creative.id) ? (
                      <GalleryPlaceholder
                        brandColors={placeholderConfig?.brandColors ?? []}
                        status="completed"
                        imageUrl={creative.image_url}
                      />
                    ) : (
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
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && !activeBatchId && (
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
                <span className="text-[11px] text-text-muted rounded-full bg-background border border-nativz-border px-2 py-0.5">
                  {selectedCreative.aspect_ratio}
                </span>
                <span className="text-[11px] text-text-muted rounded-full bg-background border border-nativz-border px-2 py-0.5 max-w-[min(100%,280px)] truncate">
                  {selectedCreative.product_service}
                </span>
              </div>

              <div className="space-y-2 pt-2 border-t border-nativz-border/60">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Image prompt</p>
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
                  <pre className="text-[11px] leading-relaxed text-text-secondary whitespace-pre-wrap font-sans">
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
