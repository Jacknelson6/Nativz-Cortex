'use client';

import { useMemo, useState, useCallback } from 'react';
import Image from 'next/image';
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

function slugHue(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i += 1) {
    h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

function NanoTemplateThumb({
  previewUrl,
  sortOrder,
  name,
  slug,
}: {
  previewUrl: string;
  sortOrder: number;
  name: string;
  slug: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const onLoad = useCallback(() => setLoaded(true), []);
  const onError = useCallback(() => setLoaded(false), []);
  const h = useMemo(() => slugHue(slug), [slug]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-surface relative">
      <div
        className="absolute inset-0 opacity-90"
        style={{
          background: `linear-gradient(145deg, hsl(${h} 42% 28%) 0%, hsl(${(h + 48) % 360} 35% 14%) 55%, hsl(${(h + 96) % 360} 28% 10%) 100%)`,
        }}
        aria-hidden
      />
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-center transition-opacity duration-200 z-[1] ${
          loaded ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        aria-hidden
      >
        <span className="text-lg font-semibold tabular-nums text-white/35">#{sortOrder}</span>
        <span className="text-[10px] font-medium leading-tight text-white/45 line-clamp-2 px-1">{name}</span>
      </div>
      <Image
        src={previewUrl}
        alt=""
        fill
        sizes="(max-width: 640px) 50vw, 25vw"
        unoptimized
        loading="lazy"
        className={`object-cover transition-opacity duration-200 ${
          loaded ? 'opacity-95 z-[2] group-hover:opacity-100' : 'opacity-0 z-0'
        }`}
        onLoadingComplete={onLoad}
        onError={onError}
      />
    </div>
  );
}

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
        <p className="text-sm">Loading template catalog…</p>
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
              <div className="aspect-square relative">
                <NanoTemplateThumb
                  previewUrl={it.previewUrl}
                  sortOrder={it.sortOrder}
                  name={it.name}
                  slug={it.slug}
                />
                <span className="absolute top-2 left-2 z-[2] text-[10px] font-medium tabular-nums px-1.5 py-0.5 rounded bg-black/50 text-white">
                  #{it.sortOrder}
                </span>
                {selected && (
                  <span className="absolute top-2 right-2 z-[2] h-6 w-6 rounded-full bg-accent flex items-center justify-center text-white shadow-md">
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
