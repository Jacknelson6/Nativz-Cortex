'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import { NANO_BANANA_TYPE_GROUPS } from '@/lib/ad-creatives/nano-banana/catalog';
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
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((it) => (typeFilter === 'all' ? true : it.nanoType === typeFilter))
      .filter((it) => (q ? it.name.toLowerCase().includes(q) || it.slug.includes(q) : true))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [items, query, typeFilter]);

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
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <p className="text-sm text-text-muted max-w-xl leading-relaxed">
          Global styles — no layout reference image is sent to the model. Add product photos on the brand step when you
          want exact packshots in-frame.
        </p>
        <div className="flex flex-wrap gap-2 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search styles…"
              className="w-full sm:w-44 rounded-lg border border-nativz-border bg-background pl-8 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/25"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/25"
          >
            <option value="all">All types</option>
            {NANO_BANANA_TYPE_GROUPS.map((g) => (
              <option key={g} value={g}>
                {TYPE_LABELS[g] ?? g}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {filtered.map((it) => {
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

      {filtered.length === 0 && (
        <p className="text-sm text-text-muted text-center py-8">No styles match your filters.</p>
      )}
    </div>
  );
}
