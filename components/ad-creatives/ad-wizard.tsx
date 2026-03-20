'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Globe,
  Loader2,
  Search,
  Check,
  Upload,
  Square,
  Smartphone,
  RectangleVertical,
  Sparkles,
  Package,
  Info,
  ImagePlus,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { GenerationProgress } from './generation-progress';
import type { KandyTemplate, AspectRatio, AdVertical } from '@/lib/ad-creatives/types';
import { ASPECT_RATIOS } from '@/lib/ad-creatives/types';
import type { ScrapedBrand, ScrapedProduct } from '@/lib/ad-creatives/scrape-brand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SelectedProduct extends ScrapedProduct {
  offer: string;
  cta: string;
}

interface AdWizardProps {
  clientId: string;
  initialBrand?: ScrapedBrand;
  initialProducts?: ScrapedProduct[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RATIO_ICONS: Record<string, typeof Square> = {
  '1:1': Square,
  '9:16': Smartphone,
  '4:5': RectangleVertical,
};

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

// ---------------------------------------------------------------------------
// Inline selector — the [bracketed] clickable pill
// ---------------------------------------------------------------------------

function InlineSelector({
  label,
  value,
  onClick,
  active,
}: {
  label: string;
  value?: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1 text-sm font-medium transition-all cursor-pointer ${
        value
          ? 'border-accent/40 bg-accent-surface text-accent-text'
          : active
            ? 'border-accent/40 bg-accent-surface/50 text-accent-text animate-pulse'
            : 'border-nativz-border bg-background text-text-muted hover:border-accent/30 hover:text-text-secondary'
      }`}
    >
      {value || label}
      <ChevronDown size={12} className="opacity-60" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdWizard({ clientId, initialBrand, initialProducts }: AdWizardProps) {
  // Brand
  const [brandUrl, setBrandUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [brand, setBrand] = useState<ScrapedBrand | null>(initialBrand ?? null);
  const [scrapedProducts, setScrapedProducts] = useState<ScrapedProduct[]>(initialProducts ?? []);
  const [selectedProductIndices, setSelectedProductIndices] = useState<Set<number>>(
    new Set(initialProducts?.map((_, i) => i) ?? []),
  );

  // Templates
  const [templates, setTemplates] = useState<KandyTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());
  const [templateVerticalFilter, setTemplateVerticalFilter] = useState<AdVertical | 'all'>('all');
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showUploadZone, setShowUploadZone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // Copy & format
  const [copyMode, setCopyMode] = useState<'ai' | 'custom'>('ai');
  const [products, setProducts] = useState<SelectedProduct[]>([]);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [showFormatSelector, setShowFormatSelector] = useState(false);

  // Generate
  const [adsPerTemplate, setAdsPerTemplate] = useState(2);
  const [generating, setGenerating] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);

  // Section refs for auto-scroll
  const templateRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const generateRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Scan brand
  // ---------------------------------------------------------------------------

  async function handleScan() {
    let url = brandUrl.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
      setBrandUrl(url);
    }

    setScanning(true);
    setBrand(null);
    setScrapedProducts([]);
    setSelectedProductIndices(new Set());

    try {
      const res = await fetch('/api/ad-creatives/scrape-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Scan failed');
      }

      const data = await res.json();
      setBrand(data.brand ?? null);
      setScrapedProducts(data.products ?? []);

      if (data.products?.length > 0) {
        setSelectedProductIndices(new Set(data.products.map((_: unknown, i: number) => i)));
      }

      // Auto-scroll to templates after scan
      setTimeout(() => templateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to scan website');
    } finally {
      setScanning(false);
    }
  }

  function toggleProductSelection(index: number) {
    setSelectedProductIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  // ---------------------------------------------------------------------------
  // Templates
  // ---------------------------------------------------------------------------

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
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  function toggleTemplate(id: string) {
    setSelectedTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filteredTemplates =
    templateVerticalFilter === 'all'
      ? templates
      : templates.filter((t) => t.vertical === templateVerticalFilter);

  async function handleFileUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploadingFiles(true);

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
      toast.success(`Imported ${data.templates?.length ?? 0} templates`);
      fetchTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingFiles(false);
      setShowUploadZone(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Sync products when selections change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (brand && scrapedProducts.length > 0) {
      const selected = Array.from(selectedProductIndices).map((i) => scrapedProducts[i]);
      setProducts((prev) =>
        selected.map((sp) => {
          const existing = prev.find((p) => p.name === sp.name);
          return { ...sp, offer: existing?.offer ?? '', cta: existing?.cta ?? '' };
        }),
      );
    }
  }, [selectedProductIndices, scrapedProducts, brand]);

  // ---------------------------------------------------------------------------
  // Generate
  // ---------------------------------------------------------------------------

  const totalAds = selectedTemplateIds.size * adsPerTemplate;

  async function handleGenerate() {
    setGenerating(true);

    try {
      const productConfigs = products.map((p) => ({
        product: { name: p.name, imageUrl: p.imageUrl, description: p.description },
        offer: p.offer,
        cta: p.cta,
      }));

      const body: Record<string, unknown> = {
        templateIds: Array.from(selectedTemplateIds),
        templateSource: 'kandy' as const,
        productService: brand?.name ?? products.map((p) => p.name).join(', '),
        offer: products[0]?.offer ?? '',
        onScreenTextMode: copyMode === 'ai' ? 'ai_generate' : 'manual',
        aspectRatio,
        numVariations: adsPerTemplate,
        products: productConfigs,
        brandUrl: brand?.url,
      };

      if (copyMode === 'custom' && products.length > 0) {
        body.manualText = {
          headline: products[0]?.name ?? '',
          subheadline: products[0]?.description ?? '',
          cta: products[0]?.cta || 'Shop now',
        };
      }

      const res = await fetch(`/api/clients/${clientId}/ad-creatives/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Generation failed');
      }

      const data = await res.json();
      setActiveBatchId(data.batchId ?? data.batch_id ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed');
      setGenerating(false);
    }
  }

  // Show progress view if batch is active
  if (activeBatchId) {
    return (
      <GenerationProgress
        clientId={clientId}
        batchId={activeBatchId}
        onComplete={() => {
          setActiveBatchId(null);
          setGenerating(false);
        }}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const canGenerate = brand !== null && selectedTemplateIds.size > 0;
  const selectedRatioLabel = ASPECT_RATIOS.find((ar) => ar.value === aspectRatio)?.label ?? aspectRatio;

  // ---------------------------------------------------------------------------
  // Render — single-page conversational flow
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-3xl mx-auto py-4">
      {/* Conversational prompt container */}
      <div className="rounded-2xl border border-nativz-border bg-surface p-8 space-y-10">
        {/* ── Section 1: Brand ─────────────────────────────── */}
        <div className="space-y-5">
          <p className="text-lg font-medium text-text-primary leading-relaxed">
            I want to create ads for{' '}
            {brand ? (
              <span className="inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-surface px-3 py-1 align-middle">
                {brand.logoUrl && (
                  <img src={brand.logoUrl} alt="" className="h-5 w-5 rounded object-contain bg-white/10" />
                )}
                <span className="text-sm font-semibold text-accent-text">{brand.name}</span>
                <button
                  onClick={() => { setBrand(null); setBrandUrl(''); setScrapedProducts([]); setSelectedProductIndices(new Set()); }}
                  className="text-accent-text/60 hover:text-accent-text cursor-pointer ml-1"
                >
                  &times;
                </button>
              </span>
            ) : (
              <span className="text-text-muted">...</span>
            )}
          </p>

          {/* URL input — always visible when no brand */}
          {!brand && (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="url"
                  value={brandUrl}
                  onChange={(e) => setBrandUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                  placeholder="Paste a website URL to scan"
                  className="w-full rounded-lg border border-nativz-border bg-background pl-9 pr-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/60 transition-colors focus:border-accent focus:outline-none"
                  disabled={scanning}
                />
              </div>
              <Button onClick={handleScan} disabled={scanning || !brandUrl.trim()}>
                {scanning ? (
                  <><Loader2 size={14} className="animate-spin" /> Scanning...</>
                ) : (
                  <><Search size={14} /> Scan</>
                )}
              </Button>
            </div>
          )}

          {/* Scanning skeleton */}
          {scanning && (
            <div className="space-y-4">
              <div className="animate-pulse flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-white/[0.06]" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-40 rounded bg-white/[0.06]" />
                  <div className="h-3 w-60 rounded bg-white/[0.06]" />
                </div>
              </div>
            </div>
          )}

          {/* Brand card — shown inline after scan */}
          {brand && !scanning && (
            <div className="rounded-lg border border-nativz-border bg-background p-4 flex items-start gap-4">
              {brand.logoUrl && (
                <img src={brand.logoUrl} alt={brand.name} className="h-12 w-12 rounded-lg object-contain bg-white/5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-text-primary truncate">{brand.name}</h3>
                {brand.description && (
                  <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{brand.description}</p>
                )}
                {brand.colors.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2">
                    {brand.colors.slice(0, 6).map((color) => (
                      <div key={color} className="h-5 w-5 rounded-full border border-white/10" style={{ backgroundColor: color }} title={color} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Section 2: Products ──────────────────────────── */}
        {brand && scrapedProducts.length > 0 && (
          <div className="space-y-4">
            <p className="text-lg font-medium text-text-primary leading-relaxed">
              promoting{' '}
              <span className="text-accent-text font-semibold">
                {selectedProductIndices.size} product{selectedProductIndices.size !== 1 ? 's' : ''}
              </span>
              {' '}as my focus items.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {scrapedProducts.map((product, index) => {
                const selected = selectedProductIndices.has(index);
                return (
                  <button
                    key={`${product.name}-${index}`}
                    onClick={() => toggleProductSelection(index)}
                    className={`relative rounded-lg border-2 overflow-hidden text-left transition-all cursor-pointer ${
                      selected
                        ? 'border-accent ring-2 ring-accent/20'
                        : 'border-nativz-border hover:border-accent/30'
                    }`}
                  >
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name} className="w-full aspect-square object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full aspect-square bg-surface flex items-center justify-center">
                        <Package size={24} className="text-text-muted" />
                      </div>
                    )}
                    <div className="p-2">
                      <p className="text-xs font-medium text-text-primary truncate">{product.name}</p>
                      {product.price && <p className="text-[11px] text-text-muted">{product.price}</p>}
                    </div>
                    {selected && (
                      <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-accent flex items-center justify-center">
                        <Check size={12} className="text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-text-muted">
              Click to select or deselect products. The more you provide, the more variation in your ads.
            </p>
          </div>
        )}

        {brand && scrapedProducts.length === 0 && !scanning && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-4">
            <p className="text-sm text-amber-300">
              No products were found on this page. Ad copy will be generated from the brand info.
            </p>
          </div>
        )}

        {/* ── Section 3: Templates ─────────────────────────── */}
        {brand && (
          <div ref={templateRef} className="space-y-4">
            <p className="text-lg font-medium text-text-primary leading-relaxed">
              I want to style them after{' '}
              {selectedTemplateIds.size > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-lg border border-accent/30 bg-accent-surface px-3 py-1 text-sm font-semibold text-accent-text align-middle">
                  {selectedTemplateIds.size} template{selectedTemplateIds.size !== 1 ? 's' : ''}
                  <button
                    onClick={() => setShowTemplateSelector(!showTemplateSelector)}
                    className="text-accent-text/60 hover:text-accent-text cursor-pointer ml-1"
                  >
                    <ChevronDown size={12} />
                  </button>
                </span>
              ) : (
                <InlineSelector
                  label="select templates"
                  onClick={() => setShowTemplateSelector(!showTemplateSelector)}
                  active={showTemplateSelector}
                />
              )}
            </p>

            {/* Template selector panel */}
            {showTemplateSelector && (
              <div className="rounded-xl border border-nativz-border bg-background p-4 space-y-4">
                {/* Header with filter + upload */}
                <div className="flex items-center justify-between">
                  <select
                    value={templateVerticalFilter}
                    onChange={(e) => setTemplateVerticalFilter(e.target.value as AdVertical | 'all')}
                    className="appearance-none rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-xs text-text-primary transition-colors focus:border-accent focus:outline-none"
                  >
                    <option value="all">All verticals</option>
                    {Object.entries(VERTICAL_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    {selectedTemplateIds.size > 0 && (
                      <Badge variant="info">{selectedTemplateIds.size} selected</Badge>
                    )}
                    <button
                      onClick={() => setShowUploadZone(!showUploadZone)}
                      className="inline-flex items-center gap-1.5 text-xs text-accent-text hover:underline cursor-pointer"
                    >
                      <Upload size={12} /> Upload
                    </button>
                  </div>
                </div>

                {/* Upload zone */}
                {showUploadZone && (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-nativz-border p-6 transition-all cursor-pointer hover:border-accent/40 hover:bg-surface/50"
                  >
                    {uploadingFiles ? (
                      <Loader2 size={24} className="text-accent-text animate-spin mb-2" />
                    ) : (
                      <ImagePlus size={24} className="text-text-muted mb-2" />
                    )}
                    <p className="text-sm text-text-primary">
                      {uploadingFiles ? 'Uploading...' : 'Drop images or click to browse'}
                    </p>
                    <p className="text-xs text-text-muted mt-1">PNG, JPG, or WebP. Up to 50 files.</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      onChange={(e) => handleFileUpload(e.target.files)}
                      className="hidden"
                    />
                  </div>
                )}

                {/* Template grid */}
                {loadingTemplates ? (
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="animate-pulse rounded-lg bg-white/[0.06] aspect-square" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-3 max-h-[360px] overflow-y-auto pr-1">
                    {filteredTemplates.map((t) => {
                      const selected = selectedTemplateIds.has(t.id);
                      return (
                        <button
                          key={t.id}
                          onClick={() => toggleTemplate(t.id)}
                          className={`relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                            selected
                              ? 'border-accent ring-2 ring-accent/20'
                              : 'border-transparent hover:border-nativz-border'
                          }`}
                        >
                          <img src={t.image_url} alt={t.collection_name} className="w-full aspect-square object-cover" loading="lazy" />
                          {selected && (
                            <div className="absolute inset-0 bg-accent/15 flex items-center justify-center">
                              <div className="h-6 w-6 rounded-full bg-accent flex items-center justify-center">
                                <Check size={14} className="text-white" />
                              </div>
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                            <p className="text-[10px] text-white truncate">{t.collection_name}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Done button */}
                {selectedTemplateIds.size > 0 && (
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => {
                        setShowTemplateSelector(false);
                        setTimeout(() => copyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
                      }}
                    >
                      Done
                      <Check size={14} />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Section 4: Copy & format ─────────────────────── */}
        {brand && selectedTemplateIds.size > 0 && (
          <div ref={copyRef} className="space-y-5">
            <p className="text-lg font-medium text-text-primary leading-relaxed">
              with{' '}
              <InlineSelector
                label={copyMode === 'ai' ? 'AI-generated' : 'custom'}
                value={copyMode === 'ai' ? 'AI-generated' : 'custom'}
                onClick={() => setCopyMode(copyMode === 'ai' ? 'custom' : 'ai')}
              />
              {' '}copy in{' '}
              <InlineSelector
                label={selectedRatioLabel}
                value={selectedRatioLabel}
                onClick={() => setShowFormatSelector(!showFormatSelector)}
              />
              {' '}format.
            </p>

            {copyMode === 'ai' && (
              <div className="flex items-start gap-2 rounded-lg bg-accent-surface/50 border border-accent/20 px-4 py-3">
                <Info size={14} className="text-accent-text mt-0.5 shrink-0" />
                <p className="text-xs text-accent-text leading-relaxed">
                  Headlines, subheadlines, and CTAs will be AI-generated from your brand voice. The more templates you select, the more variation you get.
                </p>
              </div>
            )}

            {/* Format selector panel */}
            {showFormatSelector && (
              <div className="grid grid-cols-3 gap-3">
                {ASPECT_RATIOS.slice(0, 3).map((ar) => {
                  const Icon = RATIO_ICONS[ar.value] ?? Square;
                  const selected = aspectRatio === ar.value;
                  return (
                    <button
                      key={ar.value}
                      onClick={() => {
                        setAspectRatio(ar.value);
                        setShowFormatSelector(false);
                      }}
                      className={`flex flex-col items-center gap-2 rounded-xl border-2 px-4 py-4 transition-all cursor-pointer ${
                        selected
                          ? 'border-accent bg-accent-surface ring-2 ring-accent/20'
                          : 'border-nativz-border bg-background hover:border-accent/30'
                      }`}
                    >
                      <Icon size={24} className={selected ? 'text-accent-text' : 'text-text-muted'} />
                      <div className="text-center">
                        <p className={`text-sm font-medium ${selected ? 'text-text-primary' : 'text-text-secondary'}`}>
                          {ar.label}
                        </p>
                        <p className="text-[11px] text-text-muted">{ar.value}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Custom copy inputs */}
            {copyMode === 'custom' && products.length > 0 && (
              <div className="space-y-3">
                {products.map((product, index) => (
                  <div key={`${product.name}-${index}`} className="rounded-lg border border-nativz-border bg-background p-4">
                    <div className="flex items-start gap-3">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="h-14 w-14 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="h-14 w-14 rounded-lg bg-surface flex items-center justify-center shrink-0">
                          <Package size={20} className="text-text-muted" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{product.name}</p>
                        {product.price && <p className="text-xs text-text-muted">{product.price}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <Input
                        id={`offer-${index}`}
                        label="Offer"
                        value={product.offer}
                        onChange={(e) => setProducts((prev) => prev.map((p, i) => i === index ? { ...p, offer: e.target.value } : p))}
                        placeholder="e.g., 20% off first order"
                      />
                      <Input
                        id={`cta-${index}`}
                        label="CTA"
                        value={product.cta}
                        onChange={(e) => setProducts((prev) => prev.map((p, i) => i === index ? { ...p, cta: e.target.value } : p))}
                        placeholder="e.g., Shop now"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Section 5: Generate ──────────────────────────── */}
        {canGenerate && (
          <div ref={generateRef} className="space-y-5">
            <p className="text-lg font-medium text-text-primary leading-relaxed">
              Generate{' '}
              <span className="inline-flex items-center gap-1 rounded-lg border border-accent/30 bg-accent-surface px-3 py-1 align-middle">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={adsPerTemplate}
                  onChange={(e) => setAdsPerTemplate(Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))}
                  className="w-8 bg-transparent text-sm font-semibold text-accent-text text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </span>
              {' '}ad{adsPerTemplate !== 1 ? 's' : ''} per template.
            </p>

            {/* Summary */}
            <div className="rounded-lg border border-nativz-border bg-background px-5 py-4">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-6">
                  <div>
                    <span className="text-text-muted text-xs">Brand</span>
                    <p className="font-medium text-text-primary">{brand?.name}</p>
                  </div>
                  <div>
                    <span className="text-text-muted text-xs">Templates</span>
                    <p className="font-medium text-text-primary">{selectedTemplateIds.size}</p>
                  </div>
                  <div>
                    <span className="text-text-muted text-xs">Format</span>
                    <p className="font-medium text-text-primary">{selectedRatioLabel}</p>
                  </div>
                  <div>
                    <span className="text-text-muted text-xs">Copy</span>
                    <p className="font-medium text-text-primary">{copyMode === 'ai' ? 'AI' : 'Custom'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-text-muted text-xs">Total</span>
                  <p className="text-lg font-bold text-accent-text">{totalAds} ads</p>
                </div>
              </div>
            </div>

            {/* Generate button */}
            <Button
              size="lg"
              className="w-full"
              disabled={generating}
              onClick={handleGenerate}
            >
              {generating ? (
                <><Loader2 size={16} className="animate-spin" /> Starting generation...</>
              ) : (
                <><Sparkles size={16} /> Generate {totalAds} ad{totalAds !== 1 ? 's' : ''}</>
              )}
            </Button>
          </div>
        )}

        {/* Prompt hint when nothing started */}
        {!brand && !scanning && !brandUrl && (
          <p className="text-sm text-text-muted/60 text-center pt-4">
            Paste a brand URL above to get started.
          </p>
        )}
      </div>
    </div>
  );
}
