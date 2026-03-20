'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2,
  Check,
  Circle,
  Square,
  Smartphone,
  RectangleVertical,
  Sparkles,
  Type,
  Zap,
  Eye,
  Image,
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
import { ASPECT_RATIOS } from '@/lib/ad-creatives/types';
import type { ScrapedBrand, ScrapedProduct } from '@/lib/ad-creatives/scrape-brand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdWizardProps {
  clientId: string;
  initialBrand?: ScrapedBrand;
  initialProducts?: ScrapedProduct[];
  onGenerationStart?: (batchId: string, placeholderConfig: {
    brandColors: string[];
    templateThumbnails: { templateId: string; imageUrl: string; variationIndex: number }[];
  }) => void;
}

type StepStatus = 'empty' | 'active' | 'complete';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdWizard({ clientId, initialBrand, initialProducts, onGenerationStart }: AdWizardProps) {
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
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [selectedMediaUrls, setSelectedMediaUrls] = useState<Set<string>>(new Set());

  // Mode: auto vs interactive
  const [mode, setMode] = useState<'auto' | 'interactive'>('auto');
  const [promptPreviews, setPromptPreviews] = useState<PromptPreviewData[] | null>(null);
  const [loadingPreviews, setLoadingPreviews] = useState(false);

  // Generate
  const [generating, setGenerating] = useState(false);

  // Section refs for auto-scroll
  const productRef = useRef<HTMLDivElement>(null);
  const templateRef = useRef<HTMLDivElement>(null);
  const formatRef = useRef<HTMLDivElement>(null);
  const generateRef = useRef<HTMLDivElement>(null);

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

  // ---------------------------------------------------------------------------
  // Templates
  // ---------------------------------------------------------------------------

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/ad-creatives/templates?limit=2000');
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
          offer: '',
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
        offer: '',
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
        offer: '',
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

  // ---------------------------------------------------------------------------
  // Step statuses
  // ---------------------------------------------------------------------------

  const brandStatus: StepStatus = brand ? 'complete' : 'active';
  const productStatus: StepStatus = selectedProductIndices.size > 0 ? 'complete' : brand ? 'active' : 'empty';
  const templateStatus: StepStatus = selectedTemplateIds.size > 0 ? 'complete' : brand ? 'active' : 'empty';
  const formatStatus: StepStatus = selectedTemplateIds.size > 0 ? 'complete' : 'empty';
  const generateStatus: StepStatus = selectedTemplateIds.size > 0 && brand ? 'active' : 'empty';

  // ---------------------------------------------------------------------------
  // Render — vertical stepper
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-4xl mx-auto space-y-1">
      {/* Step 1: Brand */}
      <WizardSection step={1} title="Brand" status={brandStatus}>
        {brand ? (
          <BrandEditor brand={brand} onBrandChange={setBrand} clientId={clientId || undefined} />
        ) : (
          <div className="rounded-xl border border-dashed border-nativz-border bg-surface/50 p-8 text-center">
            <p className="text-sm text-text-muted">Waiting for brand scan...</p>
          </div>
        )}
      </WizardSection>

      {/* Step 1.5: Brand Media (shown when brand has media) */}
      {brand && mediaUrls.length > 0 && (
        <WizardSection step={2} title="Brand media" status={selectedMediaUrls.size > 0 ? 'complete' : 'active'}>
          <BrandMediaPanel
            mediaUrls={mediaUrls}
            selectedUrls={selectedMediaUrls}
            onToggle={toggleMediaUrl}
            onUpload={handleMediaUpload}
            clientId={clientId || undefined}
          />
        </WizardSection>
      )}

      {/* Step 2/3: Products / Menu items / Services */}
      {(() => {
        const bType = brand?.businessType;
        const itemLabel = bType === 'restaurant' ? 'Menu items' : bType === 'service' || bType === 'saas' ? 'Services' : 'Products';
        return (
          <WizardSection step={mediaUrls.length > 0 ? 3 : 2} title={itemLabel} status={productStatus} ref={productRef}>
            <ProductGrid
              products={scrapedProducts}
              selectedIndices={selectedProductIndices}
              onToggle={toggleProductSelection}
              onAddProduct={addProduct}
              itemLabel={itemLabel}
            />
          </WizardSection>
        );
      })()}

      {/* Step 3: Templates */}
      <WizardSection step={3} title="Templates" status={templateStatus} ref={templateRef}>
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
      </WizardSection>

      {/* Step 4: Copy & Format (visible once templates selected) */}
      {selectedTemplateIds.size > 0 && (
        <WizardSection step={4} title="Copy & format" status={formatStatus} ref={formatRef}>
          <div className="space-y-5">
            {/* Aspect ratio */}
            <div className="space-y-2">
              <label className="text-xs text-text-muted uppercase tracking-wide">Format</label>
              <div className="flex items-center gap-2">
                {RATIO_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAspectRatio(value)}
                    className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all cursor-pointer ${
                      aspectRatio === value
                        ? 'border-accent bg-accent-surface text-accent-text'
                        : 'border-nativz-border bg-surface text-text-muted hover:border-accent/30'
                    }`}
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Copy mode */}
            <div className="space-y-2">
              <label className="text-xs text-text-muted uppercase tracking-wide">Ad copy</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCopyMode('ai')}
                  className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all cursor-pointer ${
                    copyMode === 'ai'
                      ? 'border-accent bg-accent-surface text-accent-text'
                      : 'border-nativz-border bg-surface text-text-muted hover:border-accent/30'
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
                      : 'border-nativz-border bg-surface text-text-muted hover:border-accent/30'
                  }`}
                >
                  <Type size={15} />
                  Manual
                </button>
              </div>

              {copyMode === 'ai' && (
                <p className="text-xs text-text-muted bg-surface/50 rounded-lg px-3 py-2 border border-nativz-border">
                  Headlines, subheadlines, and CTAs will be AI-generated from your brand voice. Each variation gets unique copy.
                </p>
              )}

              {copyMode === 'manual' && (
                <div className="space-y-2 bg-surface/50 rounded-lg p-3 border border-nativz-border">
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
                    placeholder="CTA (e.g., Shop Now)"
                    className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent/50 outline-none"
                  />
                </div>
              )}
            </div>
          </div>
        </WizardSection>
      )}

      {/* Step 5/6: Generate */}
      {selectedTemplateIds.size > 0 && brand && (
        <WizardSection step={mediaUrls.length > 0 ? 6 : 5} title="Generate" status={generateStatus} ref={generateRef}>
          <div className="space-y-4">
            <VariationStrip
              templates={selectedTemplates}
              variations={variations}
              onVariationChange={handleVariationChange}
              onRemove={handleRemoveTemplate}
            />

            {/* Mode toggle */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setMode('auto'); setPromptPreviews(null); }}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                  mode === 'auto'
                    ? 'border-accent bg-accent-surface text-accent-text'
                    : 'border-nativz-border bg-surface text-text-muted hover:border-accent/30'
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
                    : 'border-nativz-border bg-surface text-text-muted hover:border-accent/30'
                }`}
              >
                <Eye size={13} /> Interactive
              </button>
              <span className="text-[10px] text-text-muted ml-1">
                {mode === 'auto' ? 'Generate immediately' : 'Review prompts first'}
              </span>
            </div>

            {/* Prompt review (interactive mode) */}
            {promptPreviews && mode === 'interactive' && (
              <PromptReview
                previews={promptPreviews}
                onApproveAll={(edited) => {
                  // TODO: Pass edited prompts to generation
                  handleGenerate();
                }}
                onCancel={() => setPromptPreviews(null)}
                generating={generating}
              />
            )}

            {/* Generate buttons */}
            {!promptPreviews && (
              <div className="flex gap-2">
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
        </WizardSection>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wizard section wrapper
// ---------------------------------------------------------------------------

import { forwardRef } from 'react';

const WizardSection = forwardRef<
  HTMLDivElement,
  { step: number; title: string; status: StepStatus; children: React.ReactNode }
>(function WizardSection({ step, title, status, children }, ref) {
  return (
    <div ref={ref} className="flex gap-4 py-4">
      {/* Step indicator */}
      <div className="flex flex-col items-center shrink-0">
        <div
          className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
            status === 'complete'
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : status === 'active'
                ? 'bg-accent/20 text-accent-text border border-accent/30 animate-pulse'
                : 'bg-surface text-text-muted border border-nativz-border'
          }`}
        >
          {status === 'complete' ? <Check size={14} /> : status === 'active' ? <Circle size={8} className="fill-current" /> : step}
        </div>
        <div className="w-px flex-1 bg-nativz-border mt-2" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-4">
        <h3 className="text-sm font-semibold text-text-primary mb-3">{title}</h3>
        {children}
      </div>
    </div>
  );
});
