'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Globe,
  Loader2,
  Search,
  Check,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Upload,
  Square,
  Smartphone,
  RectangleVertical,
  Sparkles,
  Package,
  Palette,
  Type,
  Zap,
  Info,
  ImagePlus,
  X,
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

type WizardStep = 1 | 2 | 3 | 4;

interface SelectedProduct extends ScrapedProduct {
  offer: string;
  cta: string;
}

interface AdWizardProps {
  clientId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = [
  { num: 1 as const, label: 'Brand & products', icon: Package },
  { num: 2 as const, label: 'Templates', icon: Palette },
  { num: 3 as const, label: 'Copy & offer', icon: Type },
  { num: 4 as const, label: 'Generate', icon: Zap },
];

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
// Component
// ---------------------------------------------------------------------------

export function AdWizard({ clientId }: AdWizardProps) {
  // Step state
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1 — Brand & products
  const [brandUrl, setBrandUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [brand, setBrand] = useState<ScrapedBrand | null>(null);
  const [scrapedProducts, setScrapedProducts] = useState<ScrapedProduct[]>([]);
  const [selectedProductIndices, setSelectedProductIndices] = useState<Set<number>>(new Set());

  // Step 2 — Templates
  const [templates, setTemplates] = useState<KandyTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());
  const [templateVerticalFilter, setTemplateVerticalFilter] = useState<AdVertical | 'all'>('all');
  const [showUploadZone, setShowUploadZone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // Step 3 — Copy & offer
  const [copyMode, setCopyMode] = useState<'ai' | 'custom'>('ai');
  const [products, setProducts] = useState<SelectedProduct[]>([]);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');

  // Step 4 — Generate
  const [adsPerTemplate, setAdsPerTemplate] = useState(2);
  const [generating, setGenerating] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Step 1 — Scan brand
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

      // Auto-select all products
      if (data.products?.length > 0) {
        setSelectedProductIndices(new Set(data.products.map((_: unknown, i: number) => i)));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to scan website');
    } finally {
      setScanning(false);
    }
  }

  function toggleProductSelection(index: number) {
    setSelectedProductIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  // ---------------------------------------------------------------------------
  // Step 2 — Templates
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
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
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
      // Refresh template list
      fetchTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingFiles(false);
      setShowUploadZone(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Step transitions
  // ---------------------------------------------------------------------------

  function goToStep(target: WizardStep) {
    // Sync selected products into the copy/offer step
    if (target === 3) {
      const selected = Array.from(selectedProductIndices).map((i) => scrapedProducts[i]);
      // If we already have products state, preserve offers/CTAs
      setProducts((prev) => {
        return selected.map((sp) => {
          const existing = prev.find((p) => p.name === sp.name);
          return {
            ...sp,
            offer: existing?.offer ?? '',
            cta: existing?.cta ?? '',
          };
        });
      });
    }
    setStep(target);
  }

  const canAdvance = (s: WizardStep): boolean => {
    switch (s) {
      case 1:
        return brand !== null;
      case 2:
        return selectedTemplateIds.size > 0;
      case 3:
        return true;
      case 4:
        return true;
      default:
        return false;
    }
  };

  // ---------------------------------------------------------------------------
  // Step 4 — Generate
  // ---------------------------------------------------------------------------

  const totalAds = selectedTemplateIds.size * adsPerTemplate;

  async function handleGenerate() {
    setGenerating(true);

    try {
      const productConfigs = products.map((p) => ({
        product: {
          name: p.name,
          imageUrl: p.imageUrl,
          description: p.description,
        },
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
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Step indicator */}
      <StepIndicator currentStep={step} onStepClick={(s) => canAdvance(s) || s < step ? goToStep(s) : undefined} />

      {/* Step 1 — Brand & products */}
      {step === 1 && (
        <div className="rounded-xl border border-nativz-border bg-surface p-6 space-y-6">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Enter brand URL</h2>
            <p className="text-sm text-text-muted mt-1">
              Paste a website to scan for brand info and products
            </p>
          </div>

          {/* URL input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="url"
                value={brandUrl}
                onChange={(e) => setBrandUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                placeholder="https://example.com"
                className="w-full rounded-lg border border-nativz-border bg-background pl-9 pr-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/60 transition-colors focus:border-accent focus:outline-none"
                disabled={scanning}
              />
            </div>
            <Button
              onClick={handleScan}
              disabled={scanning || !brandUrl.trim()}
            >
              {scanning ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Search size={14} />
                  Scan
                </>
              )}
            </Button>
          </div>

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
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="animate-pulse rounded-lg bg-white/[0.06] aspect-square" />
                ))}
              </div>
            </div>
          )}

          {/* Brand card */}
          {brand && !scanning && (
            <div className="rounded-lg border border-nativz-border bg-background p-4 flex items-start gap-4">
              {brand.logoUrl && (
                <img
                  src={brand.logoUrl}
                  alt={brand.name}
                  className="h-12 w-12 rounded-lg object-contain bg-white/5 shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-text-primary truncate">{brand.name}</h3>
                {brand.description && (
                  <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{brand.description}</p>
                )}
                {brand.colors.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2">
                    {brand.colors.slice(0, 6).map((color) => (
                      <div
                        key={color}
                        className="h-5 w-5 rounded-full border border-white/10"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Product grid */}
          {scrapedProducts.length > 0 && !scanning && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-text-secondary">
                  Products found
                </p>
                <Badge variant="info">
                  {selectedProductIndices.size} selected
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {scrapedProducts.map((product, index) => {
                  const selected = selectedProductIndices.has(index);
                  return (
                    <button
                      key={`${product.name}-${index}`}
                      onClick={() => toggleProductSelection(index)}
                      className={`relative rounded-lg border-2 overflow-hidden text-left transition-all cursor-pointer ${
                        selected
                          ? 'border-blue-500 ring-2 ring-blue-500/30'
                          : 'border-nativz-border hover:border-accent/30'
                      }`}
                    >
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-full aspect-square object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full aspect-square bg-surface flex items-center justify-center">
                          <Package size={24} className="text-text-muted" />
                        </div>
                      )}
                      <div className="p-2">
                        <p className="text-xs font-medium text-text-primary truncate">
                          {product.name}
                        </p>
                        {product.price && (
                          <p className="text-[11px] text-text-muted">{product.price}</p>
                        )}
                      </div>
                      {selected && (
                        <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center">
                          <Check size={12} className="text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* No products found */}
          {brand && scrapedProducts.length === 0 && !scanning && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-4">
              <p className="text-sm text-amber-300">
                No products were found on this page. You can still continue — just enter your product details manually in the next steps.
              </p>
            </div>
          )}

          {/* Next button */}
          {brand && (
            <div className="pt-2">
              <Button
                className="w-full"
                disabled={!canAdvance(1)}
                onClick={() => goToStep(2)}
              >
                Next: choose templates
                <ChevronRight size={16} />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Step 2 — Templates */}
      {step === 2 && (
        <div className="rounded-xl border border-nativz-border bg-surface p-6 space-y-6">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Choose template styles</h2>
            <p className="text-sm text-text-muted mt-1">
              Select Kandy templates or upload your own ad designs
            </p>
          </div>

          {/* Kandy templates section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-text-primary">Kandy templates</p>
              <select
                value={templateVerticalFilter}
                onChange={(e) => setTemplateVerticalFilter(e.target.value as AdVertical | 'all')}
                className="appearance-none rounded-lg border border-nativz-border bg-background px-3 py-1.5 text-xs text-text-primary transition-colors focus:border-accent focus:outline-none"
              >
                <option value="all">All verticals</option>
                {Object.entries(VERTICAL_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            {loadingTemplates ? (
              <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="animate-pulse rounded-lg bg-white/[0.06] aspect-square" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-4 gap-3 max-h-[400px] overflow-y-auto pr-1">
                {filteredTemplates.map((t) => {
                  const selected = selectedTemplateIds.has(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleTemplate(t.id)}
                      className={`relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                        selected
                          ? 'border-blue-500 ring-2 ring-blue-500/30'
                          : 'border-transparent hover:border-nativz-border'
                      }`}
                    >
                      <img
                        src={t.image_url}
                        alt={t.collection_name}
                        className="w-full aspect-square object-cover"
                        loading="lazy"
                      />
                      {selected && (
                        <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                          <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center">
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
          </div>

          {/* Upload section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-text-primary">Your templates</p>
              <button
                onClick={() => setShowUploadZone(!showUploadZone)}
                className="inline-flex items-center gap-1.5 text-xs text-accent-text hover:underline cursor-pointer"
              >
                <Upload size={12} />
                Upload ads
              </button>
            </div>

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
                <p className="text-xs text-text-muted mt-1">
                  PNG, JPG, or WebP. Up to 50 files.
                </p>
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
          </div>

          {/* Selection count + nav */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => goToStep(1)}
              className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-secondary cursor-pointer transition-colors"
            >
              <ChevronLeft size={16} />
              Back
            </button>
            <div className="flex items-center gap-3">
              {selectedTemplateIds.size > 0 && (
                <Badge variant="info">{selectedTemplateIds.size} templates selected</Badge>
              )}
              <Button
                disabled={!canAdvance(2)}
                onClick={() => goToStep(3)}
              >
                Next: copy & offer
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3 — Copy & offer */}
      {step === 3 && (
        <div className="rounded-xl border border-nativz-border bg-surface p-6 space-y-6">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Offers & copy</h2>
            <p className="text-sm text-text-muted mt-1">
              Add offers and customize ad copy for your products
            </p>
          </div>

          {/* Copy mode toggle */}
          <div className="flex items-center gap-1 bg-background rounded-lg p-0.5 w-fit">
            {(['ai', 'custom'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setCopyMode(mode)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                  copyMode === mode
                    ? 'bg-surface text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {mode === 'ai' ? 'AI generate all copy' : 'Customize per product'}
              </button>
            ))}
          </div>

          {copyMode === 'ai' && (
            <div className="flex items-start gap-2 rounded-lg bg-accent-surface/50 border border-accent/20 px-4 py-3">
              <Info size={14} className="text-accent-text mt-0.5 shrink-0" />
              <p className="text-xs text-accent-text leading-relaxed">
                Headlines, subheadlines, and CTAs will be AI-generated from your brand voice and template styles.
              </p>
            </div>
          )}

          {/* Product cards */}
          {products.length > 0 ? (
            <div className="space-y-3">
              {products.map((product, index) => (
                <div
                  key={`${product.name}-${index}`}
                  className="rounded-lg border border-nativz-border bg-background p-4"
                >
                  <div className="flex items-start gap-3">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="h-14 w-14 rounded-lg object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-14 w-14 rounded-lg bg-surface flex items-center justify-center shrink-0">
                        <Package size={20} className="text-text-muted" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {product.name}
                      </p>
                      {product.price && (
                        <p className="text-xs text-text-muted">{product.price}</p>
                      )}
                    </div>
                  </div>

                  {copyMode === 'custom' && (
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <Input
                        id={`offer-${index}`}
                        label="Offer"
                        value={product.offer}
                        onChange={(e) => {
                          setProducts((prev) =>
                            prev.map((p, i) =>
                              i === index ? { ...p, offer: e.target.value } : p,
                            ),
                          );
                        }}
                        placeholder="e.g., 20% off first order"
                      />
                      <Input
                        id={`cta-${index}`}
                        label="CTA"
                        value={product.cta}
                        onChange={(e) => {
                          setProducts((prev) =>
                            prev.map((p, i) =>
                              i === index ? { ...p, cta: e.target.value } : p,
                            ),
                          );
                        }}
                        placeholder="e.g., Shop now"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-nativz-border bg-background p-4">
              <p className="text-sm text-text-muted">
                No products were selected. Ad copy will be generated based on the brand info.
              </p>
            </div>
          )}

          {/* Aspect ratio selector */}
          <div>
            <p className="text-sm font-medium text-text-secondary mb-3">Aspect ratio</p>
            <div className="grid grid-cols-3 gap-3">
              {ASPECT_RATIOS.slice(0, 3).map((ar) => {
                const Icon = RATIO_ICONS[ar.value] ?? Square;
                const selected = aspectRatio === ar.value;
                return (
                  <button
                    key={ar.value}
                    onClick={() => setAspectRatio(ar.value)}
                    className={`flex flex-col items-center gap-2 rounded-xl border-2 px-4 py-4 transition-all cursor-pointer ${
                      selected
                        ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                        : 'border-nativz-border bg-background hover:border-accent/30'
                    }`}
                  >
                    <Icon
                      size={24}
                      className={selected ? 'text-blue-400' : 'text-text-muted'}
                    />
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
          </div>

          {/* Nav */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => goToStep(2)}
              className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-secondary cursor-pointer transition-colors"
            >
              <ChevronLeft size={16} />
              Back
            </button>
            <Button onClick={() => goToStep(4)}>
              Next: review & generate
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* Step 4 — Review & generate */}
      {step === 4 && (
        <div className="rounded-xl border border-nativz-border bg-surface p-6 space-y-6">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Review & generate</h2>
            <p className="text-sm text-text-muted mt-1">
              Confirm your settings and start generating ads
            </p>
          </div>

          {/* Summary card */}
          <div className="rounded-lg border border-nativz-border bg-background p-5 space-y-3">
            <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
              <div>
                <p className="text-text-muted text-xs">Brand</p>
                <p className="text-text-primary font-medium">{brand?.name ?? 'N/A'}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs">Products</p>
                <p className="text-text-primary font-medium">{products.length || 'None'}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs">Templates</p>
                <p className="text-text-primary font-medium">{selectedTemplateIds.size}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs">Aspect ratio</p>
                <p className="text-text-primary font-medium">
                  {ASPECT_RATIOS.find((ar) => ar.value === aspectRatio)?.label ?? aspectRatio}
                </p>
              </div>
              <div>
                <p className="text-text-muted text-xs">Copy mode</p>
                <p className="text-text-primary font-medium">
                  {copyMode === 'ai' ? 'AI-generated' : 'Custom'}
                </p>
              </div>
              {products.filter((p) => p.offer).length > 0 && (
                <div>
                  <p className="text-text-muted text-xs">Offers</p>
                  <p className="text-text-primary font-medium">
                    {products.filter((p) => p.offer).length} set
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Quantity selector */}
          <div className="space-y-3">
            <label
              htmlFor="ads-per-template"
              className="block text-sm font-medium text-text-secondary"
            >
              Ads per template
            </label>
            <div className="flex items-center gap-4">
              <input
                id="ads-per-template"
                type="range"
                min={1}
                max={10}
                value={adsPerTemplate}
                onChange={(e) => setAdsPerTemplate(parseInt(e.target.value, 10))}
                className="flex-1 accent-blue-500"
              />
              <span className="text-sm font-semibold text-text-primary w-8 text-right">
                {adsPerTemplate}
              </span>
            </div>
            <p className="text-xs text-text-muted">
              Will generate{' '}
              <span className="font-semibold text-text-primary">{totalAds} total ads</span>
              {' '}({selectedTemplateIds.size} templates x {adsPerTemplate} each)
            </p>
          </div>

          {/* Nav + generate */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => goToStep(3)}
              className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-secondary cursor-pointer transition-colors"
            >
              <ChevronLeft size={16} />
              Back
            </button>
            <Button
              size="lg"
              disabled={generating}
              onClick={handleGenerate}
            >
              {generating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Starting generation...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Generate {totalAds} ad{totalAds !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step indicator sub-component
// ---------------------------------------------------------------------------

function StepIndicator({
  currentStep,
  onStepClick,
}: {
  currentStep: WizardStep;
  onStepClick: (step: WizardStep) => void;
}) {
  return (
    <div className="flex items-center justify-between px-2">
      {STEPS.map((s, i) => {
        const isCompleted = currentStep > s.num;
        const isCurrent = currentStep === s.num;
        const Icon = s.icon;

        return (
          <div key={s.num} className="flex items-center flex-1 last:flex-none">
            {/* Step circle + label */}
            <button
              onClick={() => onStepClick(s.num)}
              className={`flex items-center gap-2 cursor-pointer transition-colors group ${
                isCurrent || isCompleted ? '' : 'opacity-40'
              }`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all ${
                  isCurrent
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : isCompleted
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-surface-hover text-text-muted'
                }`}
              >
                {isCompleted ? <Check size={14} /> : s.num}
              </div>
              <span
                className={`text-xs font-medium hidden sm:inline ${
                  isCurrent
                    ? 'text-text-primary'
                    : isCompleted
                      ? 'text-text-secondary'
                      : 'text-text-muted'
                }`}
              >
                {s.label}
              </span>
            </button>

            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div className="flex-1 mx-3">
                <div
                  className={`h-px transition-colors ${
                    currentStep > s.num ? 'bg-blue-500/40' : 'bg-nativz-border'
                  }`}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
