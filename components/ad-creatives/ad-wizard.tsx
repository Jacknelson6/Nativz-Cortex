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
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { BrandEditor } from './brand-editor';
import { ProductGrid } from './product-grid';
import { TemplateGrid } from './template-grid';
import { VariationStrip } from './variation-strip';
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

  // Generate
  const [generating, setGenerating] = useState(false);

  // Section refs for auto-scroll
  const productRef = useRef<HTMLDivElement>(null);
  const templateRef = useRef<HTMLDivElement>(null);
  const formatRef = useRef<HTMLDivElement>(null);
  const generateRef = useRef<HTMLDivElement>(null);

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

      {/* Step 2: Products */}
      <WizardSection step={2} title="Products" status={productStatus} ref={productRef}>
        <ProductGrid
          products={scrapedProducts}
          selectedIndices={selectedProductIndices}
          onToggle={toggleProductSelection}
          onAddProduct={addProduct}
        />
      </WizardSection>

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

      {/* Step 5: Generate */}
      {selectedTemplateIds.size > 0 && brand && (
        <WizardSection step={5} title="Generate" status={generateStatus} ref={generateRef}>
          <div className="space-y-4">
            <VariationStrip
              templates={selectedTemplates}
              variations={variations}
              onVariationChange={handleVariationChange}
              onRemove={handleRemoveTemplate}
            />

            <Button
              size="lg"
              className="w-full"
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
