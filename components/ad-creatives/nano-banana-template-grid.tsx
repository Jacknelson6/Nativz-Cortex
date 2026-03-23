'use client';

import { useMemo } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { NanoCatalogListItem } from '@/lib/ad-creatives/nano-banana/to-wizard-template';

const TYPE_LABELS: Record<string, string> = {
  headline_hero: 'Headline & hero',
  social_proof: 'Social proof',
  ugc_native: 'UGC / native',
  promo_offer: 'Promo & offer',
  comparison: 'Comparison',
  editorial: 'Editorial',
  faux_ui: 'Faux UI',
  experimental: 'Experimental',
};

interface NanoBananaTemplateGridProps {
  items: NanoCatalogListItem[];
  loading: boolean;
  selectedIds: Set<string>;
  onToggle: (slug: string) => void;
}

export function NanoBananaTemplateGrid({
  items,
  loading,
  selectedIds,
  onToggle,
}: NanoBananaTemplateGridProps) {
  const sorted = useMemo(
    () => [...items].sort((a, b) => a.sortOrder - b.sortOrder),
    [items],
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-text-muted">
        <Loader2 size={28} className="animate-spin opacity-80" />
        <p className="text-sm">Loading Nano Banana catalog…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {sorted.map((it) => {
          const selected = selectedIds.has(it.slug);
          return (
            <button
              key={it.slug}
              type="button"
              onClick={() => onToggle(it.slug)}
              className={`group text-left rounded-xl border overflow-hidden transition-all cursor-pointer ${
                selected
                  ? 'border-accent-border bg-accent/10 ring-1 ring-accent/25'
                  : 'border-nativz-border bg-background/50 hover:border-accent/30'
              }`}
            >
              <div className="aspect-square bg-surface relative">
                <img
                  src={it.previewUrl}
                  alt=""
                  className="h-full w-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <span className="absolute top-2 left-2 text-[10px] font-medium tabular-nums px-1.5 py-0.5 rounded bg-black/50 text-white">
                  #{it.sortOrder}
                </span>
                {selected && (
                  <span className="absolute top-2 right-2 h-6 w-6 rounded-full bg-accent flex items-center justify-center text-white shadow-md">
                    <Check size={14} strokeWidth={3} />
                  </span>
                )}
              </div>
              <div className="p-2.5 space-y-0.5">
                <p className="text-xs font-medium text-text-primary line-clamp-2 leading-snug">{it.name}</p>
                <p className="text-[10px] text-text-muted truncate">{TYPE_LABELS[it.nanoType] ?? it.nanoType}</p>
              </div>
            </button>
          );
        })}
      </div>

      {sorted.length === 0 && (
        <p className="text-sm text-text-muted text-center py-8">No styles in the catalog.</p>
      )}
    </div>
  );
}
