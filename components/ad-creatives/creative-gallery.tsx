'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Filter, Images, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { CreativeCard } from './creative-card';
import { GalleryPlaceholder } from './gallery-placeholder';
import { Dialog } from '@/components/ui/dialog';
import type { AdCreative, AspectRatio } from '@/lib/ad-creatives/types';

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

interface PlaceholderConfig {
  brandColors: string[];
  templateThumbnails: { templateId: string; imageUrl: string; variationIndex: number }[];
}

interface CreativeGalleryProps {
  clientId: string;
  /** When false, empty state points users to the Brand DNA tab (CTA lives in the parent toolbar). */
  brandDnaReady?: boolean;
  activeBatchId?: string | null;
  placeholderConfig?: PlaceholderConfig | null;
  onBatchComplete?: () => void;
}

export function CreativeGallery({
  clientId,
  brandDnaReady = true,
  activeBatchId,
  placeholderConfig,
  onBatchComplete,
}: CreativeGalleryProps) {
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [aspectFilter, setAspectFilter] = useState<AspectRatio | 'all'>('all');
  const [selectedCreative, setSelectedCreative] = useState<AdCreative | null>(null);
  const [batchCreativeIds, setBatchCreativeIds] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    await fetch(`/api/clients/${clientId}/ad-creatives`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creativeId: id }),
    }).catch(() => {
      fetchCreatives(); // Refetch on failure
    });
  };

  const filtered = creatives.filter((c) => {
    if (filterTab === 'favorites' && !c.is_favorite) return false;
    if (aspectFilter !== 'all' && c.aspect_ratio !== aspectFilter) return false;
    return true;
  });

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
                    <>
                      Use <span className="text-text-secondary font-medium">Generate creatives</span> in the top bar
                      — finished ads appear in this grid as they complete.
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
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-surface rounded-lg p-0.5">
          {(['all', 'favorites'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterTab(tab)}
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

        <div className="flex items-center gap-2">
          <Filter size={14} className="text-text-muted" />
          <select
            value={aspectFilter}
            onChange={(e) => setAspectFilter(e.target.value as AspectRatio | 'all')}
            className="appearance-none rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-xs text-text-primary transition-colors focus:border-accent focus:outline-none"
          >
            <option value="all">All formats</option>
            <option value="1:1">Square (1:1)</option>
            <option value="9:16">Story (9:16)</option>
            <option value="4:5">Portrait (4:5)</option>
            <option value="16:9">Landscape (16:9)</option>
            <option value="1.91:1">Facebook / Google</option>
          </select>
        </div>
      </div>

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
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] text-text-muted rounded-full bg-background border border-nativz-border px-2 py-0.5">
                  {selectedCreative.aspect_ratio}
                </span>
                <span className="text-[11px] text-text-muted rounded-full bg-background border border-nativz-border px-2 py-0.5">
                  {selectedCreative.product_service}
                </span>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
    </>
  );
}
