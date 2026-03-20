'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  Square,
  Smartphone,
  RectangleVertical,
  Sparkles,
  Type,
  Zap,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { BrandEditor } from './brand-editor';
import { ProductGrid } from './product-grid';
import { TemplateGrid } from './template-grid';
import { VariationStrip } from './variation-strip';
import { BrandMediaPanel } from './brand-media-panel';
import { PromptReview, type PromptPreviewData } from './prompt-review';
import type { KandyTemplate, AspectRatio } from '@/lib/ad-creatives/types';
import type { ScrapedBrand, ScrapedProduct } from '@/lib/ad-creatives/scrape-brand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdWizardProps {
  clientId: string;
  initialBrand?: ScrapedBrand;
  initialProducts?: ScrapedProduct[];
  /** Image URLs discovered during site crawl (optional). */
  initialMediaUrls?: string[];
  onGenerationStart?: (batchId: string, placeholderConfig: {
    brandColors: string[];
    templateThumbnails: { templateId: string; imageUrl: string; variationIndex: number }[];
  }) => void;
}

// ---------------------------------------------------------------------------
// Vertical detection from brand description
// ---------------------------------------------------------------------------

const VERTICAL_KEYWORDS: Record<string, string[]> = {
  ecommerce: ['shop', 'store', 'ecommerce', 'e-commerce', 'retail', 'buy', 'sale', 'discount', 'coupon', 'merch', 'clothing', 'apparel', 'jewelry', 'accessories', 'products', 'cattle', 'ranch', 'meat', 'beef', 'farm', 'livestock', 'poultry', 'seafood', 'wholesale', 'direct-to-consumer', 'd2c', 'dtc', 'subscription box'],
  saas: ['software', 'saas', 'app', 'platform', 'digital', 'cloud', 'ai', 'tool', 'automation', 'api', 'dashboard', 'analytics', 'crm', 'erp', 'b2b'],
  health_wellness: ['health', 'beauty', 'wellness', 'skincare', 'cosmetic', 'supplement', 'vitamin', 'fitness', 'spa', 'clinic', 'medical', 'pharma', 'organic', 'natural'],
  fashion: ['fashion', 'style', 'designer', 'luxury', 'boutique', 'couture', 'dress', 'wear', 'trend'],
  food_beverage: ['food', 'restaurant', 'cafe', 'coffee', 'drink', 'beverage', 'catering', 'kitchen', 'recipe', 'menu', 'toast', 'juice', 'bar', 'grill', 'bakery'],
  finance: ['finance', 'bank', 'invest', 'insurance', 'mortgage', 'loan', 'credit', 'wealth', 'gold', 'currency', 'crypto', 'fund', 'capital'],
  real_estate: ['real estate', 'property', 'home', 'house', 'apartment', 'condo', 'realtor', 'listing', 'rental'],
  automotive: ['auto', 'car', 'vehicle', 'motor', 'dealer', 'truck', 'tire', 'mechanic'],
  education: ['education', 'school', 'university', 'course', 'learning', 'tutor', 'academy', 'training'],
  local_service: ['plumbing', 'electric', 'roofing', 'hvac', 'landscap', 'cleaning', 'repair', 'contractor', 'handyman', 'pest', 'moving'],
  general: [], // fallback
};

function detectVertical(description: string, brandName: string): string {
  const text = `${description} ${brandName}`.toLowerCase();
  let bestMatch = 'general';
  let bestScore = 0;

  for (const [vertical, keywords] of Object.entries(VERTICAL_KEYWORDS)) {
    if (vertical === 'general') continue;
    const score = keywords.filter((kw) => text.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = vertical;
    }
  }

  return bestMatch;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RATIO_OPTIONS: { value: AspectRatio; label: string; icon: typeof Square }[] = [
  { value: '1:1', label: 'Square', icon: Square },
  { value: '9:16', label: 'Story', icon: Smartphone },
  { value: '4:5', label: 'Portrait', icon: RectangleVertical },
];

const FLOW_STEPS = [
  { id: 'brand' as const, title: 'Brand & assets' },
  { id: 'products' as const, title: 'Products & services' },
  { id: 'templates' as const, title: 'Templates' },
  { id: 'format' as const, title: 'Aspect ratio' },
  { id: 'offers' as const, title: 'Offers' },
  { id: 'copy' as const, title: 'Headlines & CTAs' },
  { id: 'generate' as const, title: 'Generate' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdWizard({
  clientId,
  initialBrand,
  initialProducts,
  initialMediaUrls,
  onGenerationStart,
}: AdWizardProps) {
  // Brand
  const [brand, setBrand] = useState<ScrapedBrand | null>(initialBrand ?? null);
  const [scrapedProducts, setScrapedProducts] = useState<ScrapedProduct[]>(initialProducts ?? []);
  const [selectedProductIndices, setSelectedProductIndices] = useState<Set<number>>(
    new Set(initialProducts?.map((_, i) => i) ?? []),
  );

  // Templates
  const [templates, setTemplates] = useState<KandyTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());

  // Per-template variations
  const [variations, setVariations] = useState<Map<string, number>>(new Map());

  // Copy & format
  const [copyMode, setCopyMode] = useState<'ai' | 'manual'>('ai');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [manualHeadline, setManualHeadline] = useState('');
  const [manualSubheadline, setManualSubheadline] = useState('');
  const [manualCta, setManualCta] = useState('');

  // Brand media
  const [mediaUrls, setMediaUrls] = useState<string[]>(initialMediaUrls ?? []);
  const [selectedMediaUrls, setSelectedMediaUrls] = useState<Set<string>>(new Set());
  const [flowIdx, setFlowIdx] = useState(0);
  const [offerText, setOfferText] = useState('');

  // Mode: auto vs interactive
  const [mode, setMode] = useState<'auto' | 'interactive'>('auto');
  const [promptPreviews, setPromptPreviews] = useState<PromptPreviewData[] | null>(null);
  const [loadingPreviews, setLoadingPreviews] = useState(false);

  // Generate
  const [generating, setGenerating] = useState(false);

  // Recommended vertical based on brand
  const recommendedVertical = brand ? detectVertical(brand.description, brand.name) : null;

  // Update brand from parent when it changes
  useEffect(() => {
    if (initialBrand) setBrand(initialBrand);
  }, [initialBrand]);

  useEffect(() => {
    if (initialProducts && initialProducts.length > 0) {
      setScrapedProducts(initialProducts);
      setSelectedProductIndices(new Set(initialProducts.map((_, i) => i)));
    }
  }, [initialProducts]);

  useEffect(() => {
    if (initialMediaUrls && initialMediaUrls.length > 0) {
      setMediaUrls(initialMediaUrls);
      setSelectedMediaUrls((prev) => {
        const next = new Set(prev);
        for (const u of initialMediaUrls) next.add(u);
        return next;
      });
    }
  }, [initialMediaUrls]);

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
      // Silent
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
        // Also remove from variations
        setVariations((vm) => {
          const nextVm = new Map(vm);
          nextVm.delete(id);
          return nextVm;
        });
      } else {
        next.add(id);
        // Set default variation count
        setVariations((vm) => new Map(vm).set(id, 2));
      }
      return next;
    });
  }

  function handleTemplatesAdded(newTemplates: KandyTemplate[]) {
    setTemplates((prev) => [...newTemplates, ...prev]);
  }

  function handleVariationChange(templateId: string, count: number) {
    setVariations((prev) => new Map(prev).set(templateId, count));
  }

  function handleRemoveTemplate(templateId: string) {
    setSelectedTemplateIds((prev) => {
      const next = new Set(prev);
      next.delete(templateId);
      return next;
    });
    setVariations((prev) => {
      const next = new Map(prev);
      next.delete(templateId);
      return next;
    });
  }

  // ---------------------------------------------------------------------------
  // Product helpers
  // ---------------------------------------------------------------------------

  function toggleProductSelection(index: number) {
    setSelectedProductIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function addProduct(product: ScrapedProduct) {
    setScrapedProducts((prev) => [...prev, product]);
    setSelectedProductIndices((prev) => new Set([...prev, scrapedProducts.length]));
  }

  // ---------------------------------------------------------------------------
  // Brand media
  // ---------------------------------------------------------------------------

  function toggleMediaUrl(url: string) {
    setSelectedMediaUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  function handleMediaUpload(urls: string[]) {
    setMediaUrls((prev) => [...prev, ...urls]);
    // Auto-select newly uploaded media
    setSelectedMediaUrls((prev) => {
      const next = new Set(prev);
      for (const url of urls) next.add(url);
      return next;
    });
  }

  // ---------------------------------------------------------------------------
  // Prompt preview (interactive mode)
  // ---------------------------------------------------------------------------

  async function handlePreviewPrompts() {
    if (!brand || selectedTemplateIds.size === 0) return;
    setLoadingPreviews(true);

    try {
      const templateVariations = selectedTemplates.map((t) => ({
        templateId: t.id,
        count: variations.get(t.id) ?? 2,
      }));

      const res = await fetch(`/api/clients/${clientId}/ad-creatives/preview-prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateVariations,
          templateSource: 'kandy',
          productService: brand.name,
          offer: offerText,
          aspectRatio,
          onScreenTextMode: copyMode === 'ai' ? 'ai_generate' : 'manual',
          manualText: copyMode === 'manual' ? {
            headline: manualHeadline || brand.name,
            subheadline: manualSubheadline,
            cta: manualCta || 'Learn more',
          } : undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to generate previews');
      const data = await res.json();
      setPromptPreviews(data.previews ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to preview prompts');
    } finally {
      setLoadingPreviews(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Generate
  // ---------------------------------------------------------------------------

  const selectedTemplates = templates.filter((t) => selectedTemplateIds.has(t.id));
  const totalAds = selectedTemplates.reduce((sum, t) => sum + (variations.get(t.id) ?? 2), 0);

  async function handleGenerate() {
    if (!brand || selectedTemplateIds.size === 0) return;
    setGenerating(true);

    try {
      const selectedProducts = Array.from(selectedProductIndices).map((i) => scrapedProducts[i]).filter(Boolean);
      const productConfigs = selectedProducts.map((p) => ({
        product: { name: p.name, imageUrl: p.imageUrl, description: p.description },
        offer: offerText,
        cta: '',
      }));

      const templateVariations = selectedTemplates.map((t) => ({
        templateId: t.id,
        count: variations.get(t.id) ?? 2,
      }));

      // Build placeholder config for gallery
      const placeholderConfig = {
        brandColors: brand.colors.slice(0, 4),
        templateThumbnails: templateVariations.flatMap((tv) => {
          const tmpl = templates.find((t) => t.id === tv.templateId);
          return Array.from({ length: tv.count }, (_, i) => ({
            templateId: tv.templateId,
            imageUrl: tmpl?.image_url ?? '',
            variationIndex: i,
          }));
        }),
      };

      const body: Record<string, unknown> = {
        templateVariations,
        templateSource: 'kandy' as const,
        productService: brand.name ?? selectedProducts.map((p) => p.name).join(', '),
        offer: offerText,
        onScreenTextMode: copyMode === 'ai' ? 'ai_generate' : 'manual',
        aspectRatio,
        products: productConfigs,
        brandUrl: brand.url,
        placeholderConfig,
      };

      if (copyMode === 'manual') {
        body.manualText = {
          headline: manualHeadline || brand.name,
          subheadline: manualSubheadline || brand.description.slice(0, 100),
          cta: manualCta || 'Learn more',
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
      const batchId = data.batchId ?? data.batch_id;

      // Notify hub to switch to gallery with placeholders
      if (onGenerationStart && batchId) {
        onGenerationStart(batchId, placeholderConfig);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed');
      setGenerating(false);
    }
  }

  const currentStep = FLOW_STEPS[flowIdx] ?? FLOW_STEPS[0];

  function canAdvanceFromCurrentStep(): boolean {
    switch (currentStep.id) {
      case 'brand':
        return !!brand;
      case 'templates':
        return selectedTemplateIds.size > 0 && !loadingTemplates;
      default:
        return true;
    }
  }

  // ---------------------------------------------------------------------------
  // Render — one step at a time
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs text-text-muted">
          Step {flowIdx + 1} of {FLOW_STEPS.length}
        </p>
        <p className="text-sm font-semibold text-text-primary">{currentStep.title}</p>
      </div>

      <div className="rounded-2xl border border-nativz-border bg-surface p-5 min-h-[280px]">
        {currentStep.id === 'brand' && (
          <div className="space-y-6">
            {brand ? (
              <BrandEditor brand={brand} onBrandChange={setBrand} clientId={clientId || undefined} />
            ) : (
              <div className="rounded-xl border border-dashed border-nativz-border bg-background/40 p-8 text-center">
                <p className="text-sm text-text-muted">Waiting for brand scan...</p>
              </div>
            )}
            {brand && mediaUrls.length > 0 && (
              <div className="pt-2 border-t border-nativz-border">
                <p className="text-xs text-text-muted uppercase tracking-wide mb-3">Images from your site</p>
                <BrandMediaPanel
                  mediaUrls={mediaUrls}
                  selectedUrls={selectedMediaUrls}
                  onToggle={toggleMediaUrl}
                  onUpload={handleMediaUpload}
                  clientId={clientId || undefined}
                />
              </div>
            )}
          </div>
        )}

        {currentStep.id === 'products' && (
          <ProductGrid
            products={scrapedProducts}
            selectedIndices={selectedProductIndices}
            onToggle={toggleProductSelection}
            onAddProduct={addProduct}
          />
        )}

        {currentStep.id === 'templates' && (
          <>
            {loadingTemplates ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-text-muted" />
              </div>
            ) : (
              <TemplateGrid
                templates={templates}
                selectedIds={selectedTemplateIds}
                onToggle={toggleTemplate}
                clientId={clientId}
                onTemplatesAdded={handleTemplatesAdded}
                recommendedVertical={recommendedVertical}
              />
            )}
          </>
        )}

        {currentStep.id === 'format' && (
          <div className="space-y-2">
            <label className="text-xs text-text-muted uppercase tracking-wide">Aspect ratio</label>
            <p className="text-xs text-text-muted mb-3">
              Pick the shape that matches where these ads will run.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {RATIO_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAspectRatio(value)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all cursor-pointer ${
                    aspectRatio === value
                      ? 'border-accent bg-accent-surface text-accent-text'
                      : 'border-nativz-border bg-background text-text-muted hover:border-accent/30'
                  }`}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {currentStep.id === 'offers' && (
          <div className="space-y-3">
            <label className="text-xs text-text-muted uppercase tracking-wide">Promotional offer</label>
            <p className="text-xs text-text-muted">
              Optional. If you&apos;re running a sale, free trial, or limited-time deal, add it here so copy and prompts stay accurate.
            </p>
            <textarea
              value={offerText}
              onChange={(e) => setOfferText(e.target.value.slice(0, 300))}
              placeholder="e.g., 20% off first order · Free shipping this week · Buy one get one"
              rows={4}
              className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent/50 outline-none resize-y min-h-[100px]"
            />
            <p className="text-[10px] text-text-muted">{offerText.length}/300</p>
          </div>
        )}

        {currentStep.id === 'copy' && (
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs text-text-muted uppercase tracking-wide">Ad copy</label>
              <p className="text-xs text-text-muted">
                Use AI for variations, or write your own headline, subheadline, and CTA. You can tweak wording anytime before generating.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCopyMode('ai')}
                  className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all cursor-pointer ${
                    copyMode === 'ai'
                      ? 'border-accent bg-accent-surface text-accent-text'
                      : 'border-nativz-border bg-background text-text-muted hover:border-accent/30'
                  }`}
                >
                  <Sparkles size={15} />
                  AI-generated
                </button>
                <button
                  type="button"
                  onClick={() => setCopyMode('manual')}
                  className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all cursor-pointer ${
                    copyMode === 'manual'
                      ? 'border-accent bg-accent-surface text-accent-text'
                      : 'border-nativz-border bg-background text-text-muted hover:border-accent/30'
                  }`}
                >
                  <Type size={15} />
                  Manual
                </button>
              </div>

              {copyMode === 'ai' && (
                <p className="text-xs text-text-muted bg-background/50 rounded-lg px-3 py-2 border border-nativz-border">
                  Headlines, subheadlines, and CTAs will be AI-generated from your brand voice. Each variation gets unique copy.
                </p>
              )}

              {copyMode === 'manual' && (
                <div className="space-y-2 bg-background/50 rounded-lg p-3 border border-nativz-border">
                  <input
                    value={manualHeadline}
                    onChange={(e) => setManualHeadline(e.target.value)}
                    placeholder="Headline (e.g., Real Gold. Real Value.)"
                    className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent/50 outline-none"
                  />
                  <input
                    value={manualSubheadline}
                    onChange={(e) => setManualSubheadline(e.target.value)}
                    placeholder="Subheadline (optional)"
                    className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent/50 outline-none"
                  />
                  <input
                    value={manualCta}
                    onChange={(e) => setManualCta(e.target.value)}
                    placeholder="CTA (e.g., Shop now)"
                    className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent/50 outline-none"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {currentStep.id === 'generate' && !brand && (
          <p className="text-sm text-text-muted text-center py-8">
            Brand context is missing. Go back to the first step or run a new scan.
          </p>
        )}

        {currentStep.id === 'generate' && brand && (
          <div className="space-y-4">
            <VariationStrip
              templates={selectedTemplates}
              variations={variations}
              onVariationChange={handleVariationChange}
              onRemove={handleRemoveTemplate}
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setMode('auto'); setPromptPreviews(null); }}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                  mode === 'auto'
                    ? 'border-accent bg-accent-surface text-accent-text'
                    : 'border-nativz-border bg-background text-text-muted hover:border-accent/30'
                }`}
              >
                <Zap size={13} /> Auto
              </button>
              <button
                type="button"
                onClick={() => setMode('interactive')}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                  mode === 'interactive'
                    ? 'border-accent bg-accent-surface text-accent-text'
                    : 'border-nativz-border bg-background text-text-muted hover:border-accent/30'
                }`}
              >
                <Eye size={13} /> Interactive
              </button>
              <span className="text-[10px] text-text-muted ml-1">
                {mode === 'auto' ? 'Generate immediately' : 'Review prompts first'}
              </span>
            </div>

            {promptPreviews && mode === 'interactive' && (
              <PromptReview
                previews={promptPreviews}
                onApproveAll={() => {
                  handleGenerate();
                }}
                onCancel={() => setPromptPreviews(null)}
                generating={generating}
              />
            )}

            {!promptPreviews && (
              <div className="flex flex-col sm:flex-row gap-2">
                {mode === 'interactive' && (
                  <Button
                    size="lg"
                    variant="outline"
                    className="flex-1"
                    onClick={handlePreviewPrompts}
                    disabled={loadingPreviews || totalAds === 0}
                  >
                    {loadingPreviews ? (
                      <><Loader2 size={16} className="animate-spin" /> Loading previews...</>
                    ) : (
                      <><Eye size={16} /> Review prompts ({totalAds})</>
                    )}
                  </Button>
                )}
                <Button
                  size="lg"
                  className={mode === 'interactive' ? 'flex-1' : 'w-full'}
                  onClick={handleGenerate}
                  disabled={generating || totalAds === 0}
                >
                  {generating ? (
                    <><Loader2 size={16} className="animate-spin" /> Generating...</>
                  ) : (
                    <><Sparkles size={16} /> Generate {totalAds} ad{totalAds !== 1 ? 's' : ''}</>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {currentStep.id !== 'generate' && (
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={flowIdx <= 0}
            onClick={() => setFlowIdx((i) => Math.max(0, i - 1))}
          >
            Back
          </Button>
          <Button
            type="button"
            disabled={!canAdvanceFromCurrentStep() || flowIdx >= FLOW_STEPS.length - 1}
            onClick={() => setFlowIdx((i) => Math.min(FLOW_STEPS.length - 1, i + 1))}
          >
            Continue
          </Button>
        </div>
      )}

      {currentStep.id === 'generate' && (
        <div className="flex justify-start">
          <Button type="button" variant="outline" onClick={() => setFlowIdx((i) => Math.max(0, i - 1))}>
            Back
          </Button>
        </div>
      )}
    </div>
  );
}
