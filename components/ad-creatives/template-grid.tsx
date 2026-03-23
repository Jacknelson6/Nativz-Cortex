'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, Check, Loader2, Square, Smartphone, RectangleVertical, Library, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { AspectRatio, AdVertical } from '@/lib/ad-creatives/types';
import type { WizardTemplate } from '@/lib/ad-creatives/wizard-template';

interface TemplateGridProps {
  templates: WizardTemplate[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  clientId: string;
  /** Refetch client templates after bulk upload or ad library scrape */
  onTemplatesRefresh?: () => void;
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
  selectedIds,
  onToggle,
  clientId,
  onTemplatesRefresh,
}: TemplateGridProps) {
  const visible = templates;

  const [activeRatioFilter, setActiveRatioFilter] = useState<AspectRatio | 'all'>('all');
  const [verticalFilter, setVerticalFilter] = useState<AdVertical | 'all'>('all');
  const [brandFilter, setBrandFilter] = useState<string | 'all'>('all');
  const [uploading, setUploading] = useState(false);
  const [libraryUrl, setLibraryUrl] = useState('');
  const [scrapingLibrary, setScrapingLibrary] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const grouped = groupByRatio(visible);

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
        body: JSON.stringify({ url: u, ad_category: 'promotional' }),
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

  // Unique verticals for filter dropdown
  const uniqueVerticals = [...new Set(visible.map((t) => t.vertical).filter(Boolean))] as AdVertical[];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Library size={18} className="text-accent-text shrink-0 mt-0.5" />
            <p className="text-sm font-medium text-text-primary pt-0.5">Import from Meta Ad Library</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
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

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap rounded-xl border border-nativz-border/80 bg-background/40 p-2">
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

        {/* Industry filter — options are only verticals present in the loaded templates */}
        {uniqueVerticals.length > 1 && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted/90 px-0.5">
              Industry
            </span>
            <div className="relative">
              <select
                value={verticalFilter}
                onChange={(e) => setVerticalFilter(e.target.value as AdVertical | 'all')}
                className="min-w-[9.5rem] cursor-pointer appearance-none rounded-lg bg-background/70 pl-2.5 pr-8 py-1.5 text-xs text-text-primary ring-1 ring-inset ring-white/[0.06] border-0 hover:bg-background/90 focus:outline-none focus:ring-2 focus:ring-accent/35"
                aria-label="Filter catalog by industry"
              >
                <option value="all">All industries</option>
                {uniqueVerticals.map((v) => (
                  <option key={v} value={v}>
                    {VERTICAL_LABELS[v] ?? v}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-muted/70"
                aria-hidden
              />
            </div>
          </div>
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

      {visible.length === 0 && (
        <p className="text-sm text-text-muted text-center py-10 rounded-xl border border-dashed border-nativz-border px-4">
          No templates yet for this client. Scrape a Meta Ad Library URL above, or upload reference ad images with{' '}
          <span className="text-text-secondary">Upload</span>.
        </p>
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
      className={`relative rounded-xl overflow-hidden border transition-all duration-150 cursor-pointer group shadow-sm hover:shadow-md hover:-translate-y-0.5 ${
        selected
          ? 'border-accent ring-2 ring-accent/35 shadow-[0_0_0_1px_rgba(4,107,210,0.2)]'
          : 'border-nativz-border/90 hover:border-accent/40'
      }`}
    >
      {selected && (
        <div className="absolute top-1.5 right-1.5 z-10 h-6 w-6 rounded-full bg-accent flex items-center justify-center shadow-md">
          <Check size={13} className="text-white" strokeWidth={2.5} />
        </div>
      )}
      <div className="aspect-square bg-gradient-to-b from-background to-surface">
        {template.image_url ? (
          <img
            src={template.image_url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            loading="lazy"
            referrerPolicy="no-referrer"
            aria-hidden
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-text-muted/30">
            <Square size={20} />
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-1 px-1.5 py-1 bg-surface/95 border-t border-nativz-border/60">
        <span className="text-[9px] font-medium tabular-nums text-text-muted/90 uppercase tracking-wide">
          {template.format || template.aspect_ratio}
        </span>
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
