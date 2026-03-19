'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CreativeCard } from './creative-card';
import { Dialog } from '@/components/ui/dialog';
import type { AdCreative, AspectRatio } from '@/lib/ad-creatives/types';

type FilterTab = 'all' | 'favorites';

interface CreativeGalleryProps {
  clientId: string;
  onNavigateToGenerate: () => void;
}

export function CreativeGallery({ clientId, onNavigateToGenerate }: CreativeGalleryProps) {
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [aspectFilter, setAspectFilter] = useState<AspectRatio | 'all'>('all');
  const [selectedCreative, setSelectedCreative] = useState<AdCreative | null>(null);

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

  if (creatives.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-surface mb-4">
          <Sparkles size={28} className="text-accent-text" />
        </div>
        <h2 className="text-lg font-semibold text-text-primary mb-2">No creatives yet</h2>
        <p className="text-sm text-text-muted mb-6 max-w-md">
          Generate your first batch of static ad creatives from brand templates and AI.
        </p>
        <Button onClick={onNavigateToGenerate}>
          <Sparkles size={14} />
          Generate creatives
        </Button>
      </div>
    );
  }

  return (
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

      {/* Masonry grid */}
      {filtered.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-12">
          No creatives match the current filters.
        </p>
      ) : (
        <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
          {filtered.map((creative) => (
            <div key={creative.id} className="break-inside-avoid">
              <CreativeCard
                creative={creative}
                onFavorite={() => toggleFavorite(creative.id)}
                onDelete={() => deleteCreative(creative.id)}
                onClick={() => setSelectedCreative(creative)}
              />
            </div>
          ))}
        </div>
      )}

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
  );
}
