'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Upload, Check, Loader2, Square, Smartphone, RectangleVertical, Sparkles, Library } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { AdCategory, AspectRatio, AdVertical } from '@/lib/ad-creatives/types';
import { AD_CATEGORIES } from '@/lib/ad-creatives/types';
import type { WizardTemplate } from '@/lib/ad-creatives/wizard-template';

const AD_CATEGORY_LABELS: Record<AdCategory, string> = {
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

interface TemplateGridProps {
  templates: WizardTemplate[];
  /** Catalog vs scraped / uploaded client templates */
  templateMode: 'kandy' | 'ad_library';
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  clientId: string;
  /** Refetch Kandy + client templates after bulk upload or ad library scrape */
  onTemplatesRefresh?: () => void;
  recommendedVertical?: string | null;
}

const RATIO_SECTIONS: { ratio: AspectRatio; label: string; icon: typeof Square }[] = [
  { ratio: '1:1', label: 'Square (1:1)', icon: Square },
  { ratio: '9:16', label: 'Story (9:16)', icon: Smartphone },
  { ratio: '4:5', label: 'Portrait (4:5)', icon: RectangleVertical },
];

const VERTICAL_LABELS: Record<string, string> = {
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

export function TemplateGrid({
  templates,
  templateMode,
  selectedIds,
  onToggle,
  clientId,
  onTemplatesRefresh,
  recommendedVertical,
}: TemplateGridProps) {
  const visible = useMemo(() => {
    if (templateMode === 'ad_library') return templates.filter((t) => t.templateOrigin === 'custom');
    return templates;
  }, [templates, templateMode]);

  const [activeRatioFilter, setActiveRatioFilter] = useState<AspectRatio | 'all'>('all');
  const [verticalFilter, setVerticalFilter] = useState<AdVertical | 'all'>('all');
  const [brandFilter, setBrandFilter] = useState<string | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [importingUrl, setImportingUrl] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [libraryUrl, setLibraryUrl] = useState('');
  const [libraryCategory, setLibraryCategory] = useState<AdCategory>('promotional');
  const [scrapingLibrary, setScrapingLibrary] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Auto-set vertical filter when recommendation is detected
  useEffect(() => {
    if (recommendedVertical && recommendedVertical !== 'general') {
      setVerticalFilter(recommendedVertical as AdVertical);
    }
  }, [recommendedVertical]);

  const grouped = groupByRatio(visible);

  const customTemplates = visible.filter(
    (t) =>
      t.templateOrigin === 'custom' ||
      t.collection_name === 'Custom' ||
      t.collection_name === 'Uploaded' ||
      t.collection_name === 'Imported' ||
      t.collection_name === 'Ad library',
  );

  const uniqueBrands = [...new Set(visible.map((t) => t.source_brand).filter(Boolean))] as string[];

  const handleFilterClick = useCallback((ratio: AspectRatio) => {
    setActiveRatioFilter((prev) => (prev === ratio ? 'all' : ratio));
    const ref = sectionRefs.current[ratio];
    if (ref) {
      ref.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);

    const formData = new FormData();
    formData.append('ad_category', 'promotional');
    for (const file of Array.from(fileList).slice(0, 50)) {
      formData.append('files', file);
    }

    try {
      const res = await fetch(`/api/clients/${clientId}/ad-creatives/templates/bulk`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Upload failed');
      }

      const data = await res.json();
      const uploaded = data.templates ?? [];
      toast.success(`Imported ${uploaded.length} templates`);

      // Optimistic: add to local state immediately
      onTemplatesRefresh?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleAdLibraryScrape() {
    const u = libraryUrl.trim();
    if (!u) return;
    setScrapingLibrary(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/ad-creatives/templates/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u, ad_category: libraryCategory }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Scrape failed');

      const imported = typeof data.imported === 'number' ? data.imported : 0;
      const errs = Array.isArray(data.errors) ? data.errors : [];
      if (imported > 0) {
        toast.success(`Imported ${imported} static ad${imported === 1 ? '' : 's'} as templates`);
        setLibraryUrl('');
        onTemplatesRefresh?.();
      } else {
        toast.error(errs[0] ?? 'No ads could be imported from this URL');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Scrape failed');
    } finally {
      setScrapingLibrary(false);
    }
  }

  async function handleImportUrl() {
    if (!importUrl.trim()) return;
    setImportingUrl(true);
    try {
      const res = await fetch('/api/ad-creatives/templates/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Import failed');
      }
      const data = await res.json();
      if (data.template) {
        toast.success(`Imported from ${data.template.source_brand ?? 'URL'}`);
        onTemplatesRefresh?.();
        setImportUrl('');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImportingUrl(false);
    }
  }

  // Unique verticals for filter dropdown
  const uniqueVerticals = [...new Set(visible.map((t) => t.vertical).filter(Boolean))] as AdVertical[];

  return (
    <div className="space-y-4">
      {templateMode === 'ad_library' && (
        <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Library size={18} className="text-accent-text shrink-0 mt-0.5" />
            <div className="space-y-1 min-w-0">
              <p className="text-sm font-medium text-text-primary">Import from Meta Ad Library</p>
              <p className="text-xs text-text-muted leading-relaxed">
                Paste the full URL of a Meta Ad Library search or advertiser page. We pull static image URLs from the
                page when they appear in the HTML (heavy JS pages may return few results — use image upload as a
                fallback).
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <select
              aria-label="Ad category for scraped templates"
              value={libraryCategory}
              onChange={(e) => setLibraryCategory(e.target.value as AdCategory)}
              className="rounded-lg border border-nativz-border bg-background px-3 py-2 text-xs text-text-secondary shrink-0 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
            >
              {AD_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {AD_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <input
              value={libraryUrl}
              onChange={(e) => setLibraryUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdLibraryScrape()}
              placeholder="https://www.facebook.com/ads/library/?active_status=active&ad_type=all&..."
              className="flex-1 rounded-lg border border-nativz-border bg-background px-3 py-2 text-xs text-text-primary placeholder:text-text-muted/50 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
              disabled={scrapingLibrary}
            />
            <Button
              size="sm"
              className="shrink-0"
              onClick={() => void handleAdLibraryScrape()}
              disabled={scrapingLibrary || !libraryUrl.trim()}
            >
              {scrapingLibrary ? <Loader2 size={14} className="animate-spin" /> : 'Scrape ads'}
            </Button>
          </div>
        </div>
      )}

      {/* Recommendation banner */}
      {templateMode === 'kandy' && recommendedVertical && recommendedVertical !== 'general' && (
        <div className="rounded-lg border border-accent/20 bg-accent-surface/20 px-3 py-2 flex items-center gap-2">
          <Sparkles size={14} className="text-accent-text shrink-0" />
          <p className="text-xs text-text-secondary">
            <span className="font-medium text-accent-text">Recommended:</span>{' '}
            Showing {VERTICAL_LABELS[recommendedVertical] ?? recommendedVertical} templates based on your brand.
            <button
              type="button"
              onClick={() => setVerticalFilter('all')}
              className="ml-1.5 text-text-muted hover:text-text-primary underline cursor-pointer"
            >
              Show all
            </button>
          </p>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Aspect ratio filter buttons */}
        <div className="flex items-center gap-1 bg-surface rounded-xl p-1">
          {RATIO_SECTIONS.map(({ ratio, label, icon: Icon }) => {
            const count = grouped[ratio]?.length ?? 0;
            const selectedInSection = grouped[ratio]?.filter((t) => selectedIds.has(t.id)).length ?? 0;
            return (
              <button
                key={ratio}
                type="button"
                onClick={() => handleFilterClick(ratio)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                  activeRatioFilter === ratio
                    ? 'bg-background text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                <Icon size={13} />
                {label.split(' ')[0]}
                <span className="text-text-muted/60">({count})</span>
                {selectedInSection > 0 && (
                  <span className="bg-accent text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none">
                    {selectedInSection}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Brand filter */}
        {uniqueBrands.length > 1 && (
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-xs text-text-secondary"
          >
            <option value="all">All brands</option>
            {uniqueBrands.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        )}

        {/* Vertical filter */}
        {uniqueVerticals.length > 1 && (
          <select
            value={verticalFilter}
            onChange={(e) => setVerticalFilter(e.target.value as AdVertical | 'all')}
            className="rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-xs text-text-secondary"
          >
            <option value="all">All verticals</option>
            {uniqueVerticals.map((v) => (
              <option key={v} value={v}>{VERTICAL_LABELS[v] ?? v}</option>
            ))}
          </select>
        )}

        {/* Upload + Import buttons */}
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>
      </div>

      {templateMode === 'ad_library' && visible.length === 0 && (
        <p className="text-sm text-text-muted text-center py-10 rounded-xl border border-dashed border-nativz-border px-4">
          No templates yet for this client. Scrape a Meta Ad Library URL above, or upload reference ad images with{' '}
          <span className="text-text-secondary">Upload</span>.
        </p>
      )}

      {/* Custom uploads (shown alongside Kandy catalog) */}
      {templateMode === 'kandy' && customTemplates.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Your uploads</h4>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {customTemplates.map((t) => (
              <TemplateCard key={t.id} template={t} selected={selectedIds.has(t.id)} onToggle={onToggle} />
            ))}
          </div>
        </div>
      )}

      {/* Ratio sections */}
      {RATIO_SECTIONS.map(({ ratio, label, icon: Icon }) => {
        let sectionTemplates = grouped[ratio] ?? [];

        // Apply vertical filter
        if (verticalFilter !== 'all') {
          sectionTemplates = sectionTemplates.filter((t) => t.vertical === verticalFilter);
        }

        // Apply brand filter
        if (brandFilter !== 'all') {
          sectionTemplates = sectionTemplates.filter((t) => t.source_brand === brandFilter);
        }

        // Apply search
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          sectionTemplates = sectionTemplates.filter((t) =>
            (t.collection_name ?? '').toLowerCase().includes(q) ||
            (t.source_brand ?? '').toLowerCase().includes(q),
          );
        }

        if (templateMode === 'kandy') {
          sectionTemplates = sectionTemplates.filter(
            (t) =>
              t.templateOrigin !== 'custom' &&
              t.collection_name !== 'Custom' &&
              t.collection_name !== 'Uploaded' &&
              t.collection_name !== 'Imported' &&
              t.collection_name !== 'Ad library',
          );
        }

        if (sectionTemplates.length === 0) return null;

        const isDimmed = activeRatioFilter !== 'all' && activeRatioFilter !== ratio;
        const selectedCount = sectionTemplates.filter((t) => selectedIds.has(t.id)).length;

        return (
          <div
            key={ratio}
            ref={(el) => { sectionRefs.current[ratio] = el; }}
            className={`transition-opacity duration-300 ${isDimmed ? 'opacity-40' : 'opacity-100'}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon size={14} className="text-text-muted" />
              <h4 className="text-xs font-medium text-text-muted uppercase tracking-wide">{label}</h4>
              {selectedCount > 0 && (
                <span className="bg-accent text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none">
                  {selectedCount} selected
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {sectionTemplates.map((t) => (
                <TemplateCard key={t.id} template={t} selected={selectedIds.has(t.id)} onToggle={onToggle} />
              ))}
            </div>
          </div>
        );
      })}

      {templateMode === 'kandy' && (
        <div className="rounded-xl border border-nativz-border bg-surface/50 p-4 space-y-2">
          <p className="text-xs text-text-muted">Import a single reference into the Nativz catalog from Instagram, Facebook, or any page with an Open Graph image:</p>
          <div className="flex gap-2">
            <input
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleImportUrl()}
              placeholder="https://instagram.com/p/... or any image URL"
              className="flex-1 rounded-lg border border-nativz-border bg-background px-3 py-2 text-xs text-text-primary placeholder:text-text-muted/50 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
              disabled={importingUrl}
            />
            <Button size="sm" onClick={handleImportUrl} disabled={importingUrl || !importUrl.trim()}>
              {importingUrl ? <Loader2 size={14} className="animate-spin" /> : 'Import'}
            </Button>
          </div>
        </div>
      )}

      {/* Drop zone overlay for drag-drop */}
      <div
        className="rounded-xl border-2 border-dashed border-nativz-border/50 p-4 text-center text-xs text-text-muted"
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleUpload(e.dataTransfer.files);
        }}
      >
        Drag and drop template images here, or use the Upload button above
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template card
// ---------------------------------------------------------------------------

function TemplateCard({
  template,
  selected,
  onToggle,
}: {
  template: WizardTemplate;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(template.id)}
      className={`relative rounded-lg overflow-hidden border transition-all cursor-pointer group ${
        selected
          ? 'border-accent ring-2 ring-accent/30'
          : 'border-nativz-border hover:border-accent/30'
      }`}
    >
      {selected && (
        <div className="absolute top-1 right-1 z-10 h-5 w-5 rounded-full bg-accent flex items-center justify-center shadow-sm">
          <Check size={12} className="text-white" />
        </div>
      )}
      <div className="aspect-square bg-background">
        {template.image_url ? (
          <img
            src={template.image_url}
            alt={template.collection_name ?? 'Template'}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-text-muted/30">
            <Square size={20} />
          </div>
        )}
      </div>
      <div className="px-1.5 py-1 bg-surface">
        <p className="text-[10px] text-text-muted truncate">{template.collection_name ?? 'Template'}</p>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByRatio(templates: WizardTemplate[]): Record<string, WizardTemplate[]> {
  const groups: Record<string, WizardTemplate[]> = {};
  for (const t of templates) {
    const ratio = t.aspect_ratio ?? '1:1';
    if (!groups[ratio]) groups[ratio] = [];
    groups[ratio].push(t);
  }
  return groups;
}
