'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Star, Loader2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog } from '@/components/ui/dialog';
import type { KandyTemplate, AdVertical, AdCategory } from '@/lib/ad-creatives/types';
import { AD_VERTICALS, AD_CATEGORIES } from '@/lib/ad-creatives/types';

const VERTICAL_LABELS: Record<AdVertical, string> = {
  ecommerce: 'E-commerce',
  saas: 'SaaS',
  local_service: 'Local service',
  health_wellness: 'Health & beauty',
  finance: 'Finance',
  education: 'Education',
  real_estate: 'Real estate',
  food_beverage: 'Food & beverage',
  fashion: 'Fashion',
  automotive: 'Automotive',
};

/** Format snake_case vertical keys into readable section headings */
function formatSectionHeading(key: string): string {
  // Check the vertical labels map first
  if (key in VERTICAL_LABELS) return VERTICAL_LABELS[key as AdVertical];
  // Fallback: replace underscores, capitalize first word, lowercase rest
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/, (c) => c.toUpperCase());
}

const CATEGORY_LABELS: Record<AdCategory, string> = {
  promotional: 'Promotional',
  brand_awareness: 'Brand awareness',
  product_showcase: 'Product showcase',
  testimonial: 'Testimonial',
  seasonal: 'Seasonal',
  retargeting: 'Retargeting',
  lead_generation: 'Lead generation',
  event: 'Event',
  educational: 'Educational',
  comparison: 'Comparison',
};

interface TemplateCatalogProps {
  clientId?: string;
  onShowBulkImport?: () => void;
  refreshKey?: number;
}

export function TemplateCatalog({ clientId, onShowBulkImport, refreshKey }: TemplateCatalogProps) {
  const [templates, setTemplates] = useState<KandyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [verticalFilter, setVerticalFilter] = useState<AdVertical | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<AdCategory | 'all'>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<KandyTemplate | null>(null);
  const [togglingFav, setTogglingFav] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/ad-creatives/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates ?? []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates, refreshKey]);

  const toggleFavorite = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const template = templates.find((t) => t.id === id);
    if (!template) return;

    const next = !template.is_favorite;
    setTogglingFav(id);
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, is_favorite: next } : t)),
    );

    try {
      await fetch(`/api/ad-creatives/templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_favorite: next }),
      });
    } catch {
      setTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, is_favorite: !next } : t)),
      );
    } finally {
      setTogglingFav(null);
    }
  };

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (verticalFilter !== 'all' && t.vertical !== verticalFilter) return false;
      if (categoryFilter !== 'all' && t.ad_category !== categoryFilter) return false;
      if (favoritesOnly && !t.is_favorite) return false;
      return true;
    });
  }, [templates, verticalFilter, categoryFilter, favoritesOnly]);

  // Group by vertical
  const grouped = useMemo(() => {
    const map = new Map<string, KandyTemplate[]>();
    for (const t of filtered) {
      const key = t.vertical;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [filtered]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-24" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-48 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-surface mb-4">
          <Loader2 size={28} className="text-accent-text animate-spin" />
        </div>
        <h2 className="text-lg font-semibold text-text-primary mb-2">
          Template catalog is being prepared...
        </h2>
        <p className="text-sm text-text-muted max-w-md">
          Templates are being loaded from the Kandy library. Check back shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {onShowBulkImport && (
          <button
            onClick={onShowBulkImport}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 cursor-pointer"
          >
            <Upload size={14} />
            Bulk import
          </button>
        )}
        <select
          value={verticalFilter}
          onChange={(e) => setVerticalFilter(e.target.value as AdVertical | 'all')}
          className="appearance-none rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none"
        >
          <option value="all">All verticals</option>
          {AD_VERTICALS.map((v) => (
            <option key={v} value={v}>
              {VERTICAL_LABELS[v]}
            </option>
          ))}
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as AdCategory | 'all')}
          className="appearance-none rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none"
        >
          <option value="all">All categories</option>
          {AD_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>

        <button
          onClick={() => setFavoritesOnly(!favoritesOnly)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all cursor-pointer border ${
            favoritesOnly
              ? 'border-amber-500/40 bg-amber-500/15 text-amber-400'
              : 'border-nativz-border bg-surface text-text-muted hover:text-text-secondary'
          }`}
        >
          <Star size={14} className={favoritesOnly ? 'fill-amber-400' : ''} />
          Favorites
        </button>
      </div>

      {/* Grouped sections */}
      {filtered.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-12">
          No templates match the current filters.
        </p>
      ) : (
        Array.from(grouped.entries()).map(([vertical, items]) => (
          <div key={vertical} className="space-y-3">
            <h3 className="text-sm font-semibold text-text-primary">
              {formatSectionHeading(vertical)}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {items.map((template) => (
                <div
                  key={template.id}
                  onClick={() => setSelectedTemplate(template)}
                  className="group relative rounded-xl bg-surface border border-nativz-border overflow-hidden cursor-pointer transition-all hover:border-accent/40 hover:shadow-card-hover hover:-translate-y-0.5"
                >
                  <img
                    src={template.image_url}
                    alt={template.collection_name}
                    className="w-full aspect-square object-cover"
                    loading="lazy"
                  />
                  <div className="p-3 space-y-2">
                    <p className="text-xs font-medium text-text-primary truncate">
                      {CATEGORY_LABELS[template.ad_category]} — {template.collection_name}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="info" className="text-[10px]">
                        {CATEGORY_LABELS[template.ad_category]}
                      </Badge>
                      <Badge variant="default" className="text-[10px]">
                        {template.format || template.aspect_ratio}
                      </Badge>
                    </div>
                  </div>

                  {/* Favorite star */}
                  <button
                    onClick={(e) => toggleFavorite(template.id, e)}
                    disabled={togglingFav === template.id}
                    className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 hover:bg-black/60 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                    aria-label={template.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Star
                      size={14}
                      className={
                        template.is_favorite
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-white'
                      }
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Template detail modal */}
      <Dialog
        open={selectedTemplate !== null}
        onClose={() => setSelectedTemplate(null)}
        title={selectedTemplate?.collection_name ?? 'Template'}
        maxWidth="2xl"
      >
        {selectedTemplate && (
          <div className="space-y-4">
            <img
              src={selectedTemplate.image_url}
              alt={selectedTemplate.collection_name}
              className="w-full rounded-xl"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="info">
                {CATEGORY_LABELS[selectedTemplate.ad_category]}
              </Badge>
              <Badge variant="default">
                {VERTICAL_LABELS[selectedTemplate.vertical]}
              </Badge>
              <Badge variant="default">
                {selectedTemplate.aspect_ratio}
              </Badge>
            </div>
            <div className="rounded-lg bg-background border border-nativz-border p-4">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
                Prompt schema
              </p>
              <pre className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
                {JSON.stringify(selectedTemplate.prompt_schema, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
