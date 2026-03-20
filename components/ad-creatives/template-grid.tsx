'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, Check, Loader2, Square, Smartphone, RectangleVertical } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { KandyTemplate, AspectRatio, AdVertical } from '@/lib/ad-creatives/types';

interface TemplateGridProps {
  templates: KandyTemplate[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  clientId: string;
  onTemplatesAdded?: (templates: KandyTemplate[]) => void;
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

export function TemplateGrid({ templates, selectedIds, onToggle, clientId, onTemplatesAdded }: TemplateGridProps) {
  const [activeRatioFilter, setActiveRatioFilter] = useState<AspectRatio | 'all'>('all');
  const [verticalFilter, setVerticalFilter] = useState<AdVertical | 'all'>('all');
  const [brandFilter, setBrandFilter] = useState<string | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [importingUrl, setImportingUrl] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Group templates by aspect ratio
  const grouped = groupByRatio(templates);

  // Get custom/uploaded templates
  const customTemplates = templates.filter((t) => t.collection_name === 'Custom' || t.collection_name === 'Uploaded' || t.collection_name === 'Imported');

  // Unique brands for filter
  const uniqueBrands = [...new Set(templates.map((t) => t.source_brand).filter(Boolean))] as string[];

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
      if (onTemplatesAdded && uploaded.length > 0) {
        onTemplatesAdded(uploaded);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
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
        if (onTemplatesAdded) {
          onTemplatesAdded([data.template]);
        }
        setImportUrl('');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImportingUrl(false);
    }
  }

  // Unique verticals for filter dropdown
  const uniqueVerticals = [...new Set(templates.map((t) => t.vertical).filter(Boolean))] as AdVertical[];

  return (
    <div className="space-y-4">
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

      {/* Custom uploads section */}
      {customTemplates.length > 0 && (
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

        // Exclude custom templates (shown separately above)
        sectionTemplates = sectionTemplates.filter(
          (t) => t.collection_name !== 'Custom' && t.collection_name !== 'Uploaded',
        );

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

      {/* Import from URL */}
      <div className="rounded-xl border border-nativz-border bg-surface/50 p-4 space-y-2">
        <p className="text-xs text-text-muted">Import from Instagram, Facebook, or any image URL:</p>
        <div className="flex gap-2">
          <input
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleImportUrl()}
            placeholder="https://instagram.com/p/... or any image URL"
            className="flex-1 rounded-lg border border-nativz-border bg-background px-3 py-2 text-xs text-text-primary placeholder:text-text-muted/50 focus:border-accent/50 outline-none"
            disabled={importingUrl}
          />
          <Button size="sm" onClick={handleImportUrl} disabled={importingUrl || !importUrl.trim()}>
            {importingUrl ? <Loader2 size={14} className="animate-spin" /> : 'Import'}
          </Button>
        </div>
      </div>

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
  template: KandyTemplate;
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

function groupByRatio(templates: KandyTemplate[]): Record<string, KandyTemplate[]> {
  const groups: Record<string, KandyTemplate[]> = {};
  for (const t of templates) {
    const ratio = t.aspect_ratio ?? '1:1';
    if (!groups[ratio]) groups[ratio] = [];
    groups[ratio].push(t);
  }
  return groups;
}
