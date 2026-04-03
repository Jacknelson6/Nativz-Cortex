'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog } from '@/components/ui/dialog';
import type { AdCreativeTemplate, AdPromptTemplate, AdVertical, AdCategory } from '@/lib/ad-creatives/types';
import { AD_VERTICALS, AD_CATEGORIES } from '@/lib/ad-creatives/types';
import { adPromptRowToWizardTemplate } from '@/lib/ad-creatives/wizard-template';

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
  clientId: string;
  onShowBulkImport?: () => void;
  refreshKey?: number;
}

function filterSelectClassName(): string {
  return [
    'min-w-[10.5rem] max-w-[14rem] cursor-pointer appearance-none rounded-lg',
    'bg-background/70 pl-3 pr-9 py-2 text-sm text-text-primary',
    'ring-1 ring-inset ring-white/[0.06] border-0 shadow-sm',
    'transition-[box-shadow,background-color] hover:bg-background/90 hover:ring-white/[0.1]',
    'focus:outline-none focus:ring-2 focus:ring-accent/35 focus:ring-offset-0 focus:bg-background',
  ].join(' ');
}

export function TemplateCatalog({ clientId, onShowBulkImport, refreshKey }: TemplateCatalogProps) {
  const [templates, setTemplates] = useState<AdCreativeTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [verticalFilter, setVerticalFilter] = useState<AdVertical | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<AdCategory | 'all'>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<AdCreativeTemplate | null>(null);

  const fetchTemplates = useCallback(async () => {
    if (!clientId.trim()) {
      setTemplates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/ad-creatives/templates?limit=2000`);
      if (res.ok) {
        const data = (await res.json()) as { templates?: AdPromptTemplate[] };
        const rows = data.templates ?? [];
        setTemplates(rows.map((row) => adPromptRowToWizardTemplate(row)));
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates, refreshKey]);

  /** Industries that actually have ≥1 template (dropdown only lists these). */
  const verticalsPresent = useMemo(() => {
    const found = new Set<string>();
    for (const t of templates) {
      if (t.vertical) found.add(t.vertical);
    }
    return AD_VERTICALS.filter((v) => found.has(v));
  }, [templates]);

  const categoriesPresent = useMemo(() => {
    const found = new Set<string>();
    for (const t of templates) {
      if (t.ad_category) found.add(t.ad_category);
    }
    return AD_CATEGORIES.filter((c) => found.has(c));
  }, [templates]);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (verticalFilter !== 'all' && t.vertical !== verticalFilter) return false;
      if (categoryFilter !== 'all' && t.ad_category !== categoryFilter) return false;
      return true;
    });
  }, [templates, verticalFilter, categoryFilter]);

  // Reset filters if catalog changes and current value no longer exists
  useEffect(() => {
    if (verticalFilter !== 'all' && !verticalsPresent.includes(verticalFilter)) {
      setVerticalFilter('all');
    }
  }, [verticalFilter, verticalsPresent]);

  useEffect(() => {
    if (categoryFilter !== 'all' && !categoriesPresent.includes(categoryFilter)) {
      setCategoryFilter('all');
    }
  }, [categoryFilter, categoriesPresent]);

  // Group by vertical
  const grouped = useMemo(() => {
    const map = new Map<string, AdCreativeTemplate[]>();
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
        <div className="flex items-center gap-3 flex-wrap">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-36" />
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

  if (!clientId.trim()) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h2 className="text-lg font-semibold text-text-primary mb-2">Choose a client</h2>
        <p className="text-sm text-text-muted max-w-md">
          Reference ads and prompt templates are stored per client. Select a client to browse their library.
        </p>
      </div>
    );
  }

  if (!loading && templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h2 className="text-lg font-semibold text-text-primary mb-2">No reference ads yet</h2>
        <p className="text-sm text-text-muted max-w-md">
          Upload winning ads or scrape the Meta Ad Library from the generate flow to build this client’s template
          library.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter bar — only industries / types that exist in the catalog */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
        {onShowBulkImport && (
          <button
            onClick={onShowBulkImport}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 cursor-pointer self-start"
          >
            <Upload size={14} />
            Bulk import
          </button>
        )}

        {verticalsPresent.length > 0 && (
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs font-medium uppercase tracking-wide text-text-muted/90">
              Sort by industry
            </span>
            <div className="relative">
              <select
                value={verticalFilter}
                onChange={(e) => setVerticalFilter(e.target.value as AdVertical | 'all')}
                className={filterSelectClassName()}
                aria-label="Filter templates by industry"
              >
                <option value="all">All industries</option>
                {verticalsPresent.map((v) => (
                  <option key={v} value={v}>
                    {VERTICAL_LABELS[v]}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted/70"
                aria-hidden
              />
            </div>
          </div>
        )}

        {categoriesPresent.length > 1 && (
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs font-medium uppercase tracking-wide text-text-muted/90">
              Template type
            </span>
            <div className="relative">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as AdCategory | 'all')}
                className={filterSelectClassName()}
                aria-label="Filter by template type"
              >
                <option value="all">All types</option>
                {categoriesPresent.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted/70"
                aria-hidden
              />
            </div>
          </div>
        )}
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
                    alt=""
                    className="w-full aspect-square object-cover"
                    loading="lazy"
                  />
                  <div className="flex items-center justify-center gap-1.5 flex-wrap px-2 py-2 bg-surface/95 border-t border-nativz-border/60">
                    <Badge variant="default" className="text-[10px] font-normal">
                      {template.format || template.aspect_ratio}
                    </Badge>
                    {template.ad_category ? (
                      <Badge variant="info" className="text-[10px] font-normal">
                        {CATEGORY_LABELS[template.ad_category]}
                      </Badge>
                    ) : null}
                  </div>
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
        title="Template preview"
        maxWidth="2xl"
      >
        {selectedTemplate && (
          <div className="space-y-4">
            <p className="text-sm text-text-muted leading-relaxed">
              Reference layout for static ad generation. Prompt and layout details are built when you generate ads, not
              stored on the template card.
            </p>
            <img
              src={selectedTemplate.image_url}
              alt=""
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
          </div>
        )}
      </Dialog>
    </div>
  );
}
