'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Loader2,
  Square,
  Smartphone,
  RectangleVertical,
  Sparkles,
  Type,
  Zap,
  Eye,
  Library,
  LayoutGrid,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { BrandEditor } from './brand-editor';
import { ProductGrid } from './product-grid';
import { TemplateGrid } from './template-grid';
import { VariationStrip } from './variation-strip';
import { BrandMediaPanel } from './brand-media-panel';
import { BrandDnaGuidelinePanel } from './brand-dna-guideline-panel';
import { BrandDnaWizardRail } from './brand-dna-wizard-rail';
import { AdCreativeGuidelineUploads } from './ad-creative-guideline-uploads';
import { PromptReview, type PromptPreviewData } from './prompt-review';
import {
  AD_GENERATE_MAX_PRODUCTS,
  type AdCreative,
  type AdPromptTemplate,
  type AspectRatio,
  type KandyTemplate,
} from '@/lib/ad-creatives/types';
import type { WizardTemplate } from '@/lib/ad-creatives/wizard-template';
import { adPromptRowToWizardTemplate, withKandyOrigin } from '@/lib/ad-creatives/wizard-template';
import type { ScrapedBrand, ScrapedProduct } from '@/lib/ad-creatives/scrape-brand';
import { isStrongProductCandidate } from '@/lib/ad-creatives/product-name-filters';
import { formatApiValidationError } from '@/lib/utils/format-api-validation-error';
import {
  AD_WIZARD_STEP_META,
  AdWizardFooter,
  AdWizardProgress,
  AdWizardShell,
  WizardSegmentedControl,
  WizardStepHeader,
} from './ad-wizard-chrome';

const WIZARD_ASPECT_RATIOS = new Set<AspectRatio>(['1:1', '9:16', '4:5']);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BrandContextSource = 'brand_dna' | 'knowledge_cache' | 'live_scrape';

interface AdWizardProps {
  clientId: string;
  initialBrand?: ScrapedBrand;
  initialProducts?: ScrapedProduct[];
  /** Image URLs discovered during site crawl (optional). */
  initialMediaUrls?: string[];
  /** Set when hub loaded context from Brand DNA vs cache vs live scrape. */
  brandContextSource?: BrandContextSource;
  /** For “Edit in Brand DNA” link in the inline guideline panel. */
  clientSlug?: string;
  /** When set (e.g. gallery “Create more like this”), wizard pre-fills from this creative. */
  seedCreative?: AdCreative | null;
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

/** Noisy SaaS tokens: substring match false-positives (e.g. "app" in "application") — require whole word. */
const SAAS_WHOLE_WORD = new Set(['app', 'ai', 'api', 'crm', 'erp', 'b2b']);

function keywordMatches(text: string, kw: string, vertical: string): boolean {
  const k = kw.toLowerCase();
  if (k.includes(' ')) return text.includes(k);
  if (vertical === 'saas' && SAAS_WHOLE_WORD.has(k)) {
    try {
      return new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
    } catch {
      return text.includes(k);
    }
  }
  return text.includes(k);
}

function detectVertical(description: string, brandName: string): string {
  const text = `${description} ${brandName}`.toLowerCase();
  let bestMatch = 'general';
  let bestScore = 0;

  const weights: Record<string, number> = {
    food_beverage: 1.35,
    health_wellness: 1.2,
    ecommerce: 1.1,
  };

  for (const [vertical, keywords] of Object.entries(VERTICAL_KEYWORDS)) {
    if (vertical === 'general') continue;
    const raw = keywords.filter((kw) => keywordMatches(text, kw, vertical)).length;
    const w = weights[vertical] ?? 1;
    const score = raw * w;
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

export function AdWizard({
  clientId,
  initialBrand,
  initialProducts,
  initialMediaUrls,
  brandContextSource,
  clientSlug,
  seedCreative,
  onGenerationStart,
}: AdWizardProps) {
  // Brand
  const [brand, setBrand] = useState<ScrapedBrand | null>(initialBrand ?? null);
  const [scrapedProducts, setScrapedProducts] = useState<ScrapedProduct[]>(initialProducts ?? []);
  const [selectedProductIndices, setSelectedProductIndices] = useState<Set<number>>(new Set());
  const productDefaultsAppliedRef = useRef(false);

  const productsFingerprint = useMemo(
    () => initialProducts?.map((p) => `${p.name}\u0000${p.imageUrl ?? ''}`).join('\n') ?? '',
    [initialProducts],
  );

  useEffect(() => {
    productDefaultsAppliedRef.current = false;
  }, [clientId, productsFingerprint]);

  // Templates — Kandy catalog vs client ad library (scraped / uploaded prompt templates)
  const [templateMode, setTemplateMode] = useState<'kandy' | 'ad_library'>('kandy');
  const [templates, setTemplates] = useState<WizardTemplate[]>([]);
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

  /** Overrides `brand.name` in API bodies when seeding from an existing creative. */
  const [productServiceOverride, setProductServiceOverride] = useState<string | null>(null);
  /** Passed as `styleDirectionGlobal` — prior full image prompt (capped server-side). */
  const [repeatStyleDirection, setRepeatStyleDirection] = useState<string | null>(null);
  const seedTemplateAppliedRef = useRef<string | null>(null);

  // Recommended vertical from brand copy — only if Nativz catalog has templates for that industry
  const recommendedVertical = brand ? detectVertical(brand.description, brand.name) : null;

  const kandyVerticalsWithTemplates = useMemo(() => {
    const s = new Set<string>();
    for (const t of templates) {
      if (t.templateOrigin === 'kandy' && t.vertical) s.add(t.vertical);
    }
    return s;
  }, [templates]);

  const effectiveRecommendedVertical = useMemo(() => {
    if (!recommendedVertical || recommendedVertical === 'general') return null;
    return kandyVerticalsWithTemplates.has(recommendedVertical) ? recommendedVertical : null;
  }, [recommendedVertical, kandyVerticalsWithTemplates]);

  // Update brand from parent when it changes
  useEffect(() => {
    if (initialBrand) setBrand(initialBrand);
  }, [initialBrand]);

  useEffect(() => {
    if (!initialProducts?.length) {
      setScrapedProducts([]);
      setSelectedProductIndices(new Set());
      return;
    }
    setScrapedProducts(initialProducts);
    if (productDefaultsAppliedRef.current) return;
    productDefaultsAppliedRef.current = true;
    const preferred = new Set<number>();
    initialProducts.forEach((p, i) => {
      if (isStrongProductCandidate(p)) preferred.add(i);
    });
    setSelectedProductIndices(
      preferred.size > 0 ? preferred : new Set(initialProducts.map((_, i) => i)),
    );
  }, [initialProducts, productsFingerprint]);

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

  useEffect(() => {
    if (!seedCreative) {
      seedTemplateAppliedRef.current = null;
      setProductServiceOverride(null);
      setRepeatStyleDirection(null);
      return;
    }

    seedTemplateAppliedRef.current = null;

    const ar = seedCreative.aspect_ratio;
    setAspectRatio(WIZARD_ASPECT_RATIOS.has(ar) ? ar : '1:1');
    setOfferText(seedCreative.offer ?? '');
    setCopyMode('manual');
    setManualHeadline(seedCreative.on_screen_text?.headline ?? '');
    setManualSubheadline(seedCreative.on_screen_text?.subheadline ?? '');
    setManualCta(seedCreative.on_screen_text?.cta ?? '');
    setTemplateMode(seedCreative.template_source === 'kandy' ? 'kandy' : 'ad_library');
    const ps = seedCreative.product_service?.trim();
    setProductServiceOverride(ps || null);
    const pu = seedCreative.prompt_used?.trim();
    setRepeatStyleDirection(pu ? pu.slice(0, 4000) : null);

    const genIdx = AD_WIZARD_STEP_META.findIndex((s) => s.id === 'generate');
    setFlowIdx(genIdx >= 0 ? genIdx : 0);

    toast.success('Loaded this creative’s settings. Review and run a new batch.');
  }, [seedCreative]);

  useEffect(() => {
    if (!seedCreative || loadingTemplates) return;
    if (templates.length === 0) return;

    const tid = seedCreative.template_id;
    const exists = templates.some((t) => t.id === tid);
    if (!exists) {
      toast.message('Original template not found — pick a layout before generating.');
      const tIdx = AD_WIZARD_STEP_META.findIndex((s) => s.id === 'templates');
      if (tIdx >= 0) setFlowIdx(tIdx);
      return;
    }

    if (seedTemplateAppliedRef.current === seedCreative.id) return;

    setSelectedTemplateIds(new Set([tid]));
    setVariations(new Map([[tid, 2]]));
    seedTemplateAppliedRef.current = seedCreative.id;
  }, [seedCreative, loadingTemplates, templates]);

  const effectiveProductService = useMemo(
    () => (productServiceOverride?.trim() || brand?.name || '').trim(),
    [productServiceOverride, brand?.name],
  );

  // ---------------------------------------------------------------------------
  // Templates
  // ---------------------------------------------------------------------------

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const [kRes, cRes] = await Promise.all([
        fetch('/api/ad-creatives/templates?limit=2000'),
        fetch(`/api/clients/${clientId}/ad-creatives/templates?limit=500`),
      ]);

      const kandyRaw = kRes.ok ? ((await kRes.json()) as { templates?: KandyTemplate[] }).templates ?? [] : [];
      const customRows = cRes.ok ? ((await cRes.json()) as { templates?: AdPromptTemplate[] }).templates ?? [] : [];

      const kandy: WizardTemplate[] = kandyRaw.map((t) => withKandyOrigin(t));
      const custom: WizardTemplate[] = customRows.map((row) => adPromptRowToWizardTemplate(row));

      setTemplates([...kandy, ...custom]);
    } catch {
      toast.error('Could not load templates. Refresh the page or try again.');
    } finally {
      setLoadingTemplates(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  function toggleTemplate(id: string) {
    const picked = templates.find((t) => t.id === id);
    const origin = picked?.templateOrigin ?? 'kandy';

    setSelectedTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setVariations((vm) => {
          const nextVm = new Map(vm);
          nextVm.delete(id);
          return nextVm;
        });
      } else {
        for (const tid of [...next]) {
          const ot = templates.find((t) => t.id === tid);
          if (ot && (ot.templateOrigin ?? 'kandy') !== origin) next.delete(tid);
        }
        next.add(id);
        setVariations((vm) => new Map(vm).set(id, 2));
      }
      return next;
    });
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
    if (scrapedProducts.length > 0 && selectedProductIndices.size === 0) {
      toast.error('Select at least one product before previewing prompts.');
      return;
    }
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
          templateSource: activeTemplateSource,
          productService: effectiveProductService || brand.name,
          offer: offerText,
          aspectRatio,
          onScreenTextMode: copyMode === 'ai' ? 'ai_generate' : 'manual',
          manualText: copyMode === 'manual' ? {
            headline: (manualHeadline.trim() || brand.name).slice(0, 200),
            subheadline: (
              manualSubheadline.trim() ||
              brand.description.trim().slice(0, 120) ||
              brand.name
            ).slice(0, 300),
            cta: (manualCta.trim() || 'Learn more').slice(0, 100),
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
  const activeTemplateSource = templateMode === 'kandy' ? ('kandy' as const) : ('custom' as const);
  const totalAds = selectedTemplates.reduce((sum, t) => sum + (variations.get(t.id) ?? 2), 0);

  async function handleGenerate(editedPreviews?: PromptPreviewData[] | null) {
    if (!brand || selectedTemplateIds.size === 0) return;

    if (scrapedProducts.length > 0 && selectedProductIndices.size === 0) {
      toast.error('Select at least one product, or go back and adjust your catalog.');
      return;
    }

    if (editedPreviews?.length) {
      if (editedPreviews.length !== totalAds) {
        toast.error('Your preview list does not match the current template selection. Close review and load previews again.');
        return;
      }
      for (const p of editedPreviews) {
        const h = p.copy.headline.trim();
        const s = p.copy.subheadline.trim();
        const c = p.copy.cta.trim();
        if (!h || !s || !c) {
          toast.error('Each creative needs a headline, subheadline, and CTA. Expand any row with empty fields.');
          return;
        }
      }
    }

    setGenerating(true);

    try {
      const selectedProducts = Array.from(selectedProductIndices).map((i) => scrapedProducts[i]).filter(Boolean);

      if (selectedProducts.length > AD_GENERATE_MAX_PRODUCTS) {
        toast.message(
          `Including the first ${AD_GENERATE_MAX_PRODUCTS} of ${selectedProducts.length} selected products in this batch. Deselect extras or run generation again for the rest.`,
        );
      }
      const productsForBatch = selectedProducts.slice(0, AD_GENERATE_MAX_PRODUCTS);

      function sanitizeProductImageUrl(u: string | null): string | null {
        if (!u?.trim()) return null;
        try {
          const parsed = new URL(u);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
          return u.trim();
        } catch {
          return null;
        }
      }

      const productConfigs = productsForBatch.map((p) => ({
        product: {
          name: p.name.slice(0, 200),
          imageUrl: sanitizeProductImageUrl(p.imageUrl),
          description: (p.description ?? '').slice(0, 8000),
        },
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
        templateSource: activeTemplateSource,
        productService:
          effectiveProductService ||
          brand.name ||
          productsForBatch.map((p) => p.name).join(', ') ||
          'Product',
        offer: offerText,
        onScreenTextMode: copyMode === 'ai' ? 'ai_generate' : 'manual',
        aspectRatio,
        products: productConfigs,
        brandUrl: brand.url,
        placeholderConfig,
      };

      if (repeatStyleDirection?.trim()) {
        body.styleDirectionGlobal = repeatStyleDirection.trim();
      }

      if (copyMode === 'manual') {
        const sub =
          manualSubheadline.trim() ||
          brand.description.trim().slice(0, 120) ||
          brand.name;
        body.manualText = {
          headline: (manualHeadline.trim() || brand.name).slice(0, 200),
          subheadline: sub.slice(0, 300),
          cta: (manualCta.trim() || 'Learn more').slice(0, 100),
        };
      }

      if (editedPreviews?.length) {
        body.creativeOverrides = editedPreviews.map((p) => ({
          templateId: p.templateId,
          variationIndex: p.variationIndex,
          headline: p.copy.headline.trim().slice(0, 200),
          subheadline: p.copy.subheadline.trim().slice(0, 300),
          cta: p.copy.cta.trim().slice(0, 100),
          ...(p.styleNotes.trim() ? { styleNotes: p.styleNotes.trim().slice(0, 4000) } : {}),
        }));
      }

      const res = await fetch(`/api/clients/${clientId}/ad-creatives/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(formatApiValidationError(data));
      }

      const data = await res.json();
      const batchId = data.batchId ?? data.batch_id;

      // Notify hub to switch to gallery with placeholders
      if (onGenerationStart && batchId) {
        onGenerationStart(batchId, placeholderConfig);
      }
      setPromptPreviews(null);
      setGenerating(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed');
      setGenerating(false);
    }
  }

  const currentStep = AD_WIZARD_STEP_META[flowIdx] ?? AD_WIZARD_STEP_META[0];

  const productsDnaAside =
    brandContextSource === 'brand_dna' && currentStep.id === 'products' ? (
      <p className="text-[11px] text-accent-text/90 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 max-w-[220px] leading-snug">
        Product list is synced from Brand DNA. Edit the catalog there for lasting changes.
      </p>
    ) : undefined;

  function canAdvanceFromCurrentStep(): boolean {
    switch (currentStep.id) {
      case 'brand':
        return !!brand;
      case 'products':
        if (scrapedProducts.length === 0) return true;
        return selectedProductIndices.size > 0;
      case 'templates':
        return selectedTemplateIds.size > 0 && !loadingTemplates;
      default:
        return true;
    }
  }

  const aspectLabel = RATIO_OPTIONS.find((r) => r.value === aspectRatio)?.label ?? aspectRatio;

  // ---------------------------------------------------------------------------
  // Render — one step at a time
  // ---------------------------------------------------------------------------

  return (
    <div
      className={
        brandContextSource === 'brand_dna'
          ? 'flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px] lg:gap-8 lg:items-start w-full max-w-[1600px] mx-auto px-1'
          : 'w-full max-w-3xl mx-auto px-1 space-y-6'
      }
    >
      <div className="min-w-0 space-y-5">
        <AdWizardProgress currentIndex={flowIdx} onStepClick={(i) => setFlowIdx(i)} />

        <AdWizardShell>
          <WizardStepHeader
            title={currentStep.title}
            description={currentStep.description}
            aside={productsDnaAside}
          />

          {currentStep.id === 'brand' && (
            <div className="space-y-8">
              {brandContextSource === 'brand_dna' && brand && (
                <p className="text-sm text-text-muted rounded-xl border border-accent/20 bg-accent/[0.07] px-4 py-3 leading-relaxed">
                  <span className="font-medium text-accent-text">Brand DNA</span>
                  {' — '}
                  Colors, logo, and copy cues match your guideline. Adjust in Brand DNA if something looks off.
                </p>
              )}
              {brand ? (
                <BrandEditor brand={brand} onBrandChange={setBrand} clientId={clientId || undefined} />
              ) : (
                <div className="rounded-xl border border-dashed border-nativz-border bg-background/40 p-10 text-center">
                  <p className="text-sm text-text-muted">Waiting for brand scan…</p>
                </div>
              )}
              {brand && brandContextSource === 'brand_dna' && clientId && (
                <BrandDnaGuidelinePanel clientId={clientId} clientSlug={clientSlug} />
              )}
              {brand && clientId && (
                <AdCreativeGuidelineUploads clientId={clientId} />
              )}
              {brand && mediaUrls.length > 0 && (
                <div className="pt-6 border-t border-nativz-border/80 space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Site imagery</p>
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
              dataSourceHint={
                brandContextSource === 'brand_dna'
                  ? 'Names and images from Brand DNA (structured catalog).'
                  : undefined
              }
            />
          )}

          {currentStep.id === 'templates' && (
            <div className="space-y-6">
              <WizardSegmentedControl
                value={templateMode}
                onChange={(mode) => {
                  setTemplateMode(mode);
                  setSelectedTemplateIds(new Set());
                  setVariations(new Map());
                }}
                options={[
                  { value: 'kandy' as const, label: 'Nativz catalog', icon: LayoutGrid },
                  { value: 'ad_library' as const, label: 'Ad library', icon: Library },
                ]}
              />
              {loadingTemplates ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-text-muted">
                  <Loader2 size={28} className="animate-spin opacity-80" />
                  <p className="text-sm">Loading templates…</p>
                </div>
              ) : (
                <TemplateGrid
                  templates={templates}
                  templateMode={templateMode}
                  selectedIds={selectedTemplateIds}
                  onToggle={toggleTemplate}
                  clientId={clientId}
                  onTemplatesRefresh={fetchTemplates}
                  recommendedVertical={effectiveRecommendedVertical}
                />
              )}
            </div>
          )}

          {currentStep.id === 'format' && (
            <div className="flex flex-wrap gap-2">
              {RATIO_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAspectRatio(value)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-all cursor-pointer min-w-[120px] justify-center ${
                    aspectRatio === value
                      ? 'border-accent-border bg-accent-surface text-accent-text shadow-[0_0_0_1px_rgba(59,130,246,0.15)]'
                      : 'border-nativz-border bg-background/60 text-text-muted hover:border-accent/25 hover:text-text-secondary'
                  }`}
                >
                  <Icon size={16} className="opacity-90" />
                  {label}
                </button>
              ))}
            </div>
          )}

          {currentStep.id === 'offers' && (
            <div className="space-y-3 max-w-xl">
              <textarea
                value={offerText}
                onChange={(e) => setOfferText(e.target.value.slice(0, 300))}
                placeholder="e.g. 20% off first order, free shipping this week, buy one get one"
                rows={5}
                className="w-full rounded-xl border border-nativz-border bg-background px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/45 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/25 resize-y min-h-[120px]"
              />
              <p className="text-xs text-text-muted tabular-nums">{offerText.length}/300</p>
            </div>
          )}

          {currentStep.id === 'copy' && (
            <div className="space-y-6 max-w-xl">
              <WizardSegmentedControl
                value={copyMode}
                onChange={setCopyMode}
                options={[
                  { value: 'ai' as const, label: 'AI-generated', icon: Sparkles },
                  { value: 'manual' as const, label: 'Manual', icon: Type },
                ]}
              />

              {copyMode === 'ai' && (
                <p className="text-sm text-text-muted rounded-xl border border-nativz-border bg-background/40 px-4 py-3 leading-relaxed">
                  We&apos;ll write headlines, subheads, and CTAs from your brand voice. Each variation gets distinct copy.
                </p>
              )}

              {copyMode === 'manual' && (
                <div className="space-y-3 rounded-xl border border-nativz-border bg-background/40 p-4">
                  <input
                    value={manualHeadline}
                    onChange={(e) => setManualHeadline(e.target.value)}
                    placeholder="Headline (e.g. Real gold. Real value.)"
                    className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/45 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/25"
                  />
                  <input
                    value={manualSubheadline}
                    onChange={(e) => setManualSubheadline(e.target.value)}
                    placeholder="Subheadline (optional)"
                    className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/45 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/25"
                  />
                  <input
                    value={manualCta}
                    onChange={(e) => setManualCta(e.target.value)}
                    placeholder="CTA (e.g. Shop now)"
                    className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/45 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/25"
                  />
                </div>
              )}
            </div>
          )}

          {currentStep.id === 'generate' && !brand && (
            <p className="text-sm text-text-muted text-center py-12">
              Brand context is missing. Go back to the first step or run a new scan.
            </p>
          )}

          {currentStep.id === 'generate' && brand && (
            <div className="space-y-8">
              <div className="rounded-xl border border-nativz-border bg-background/35 px-4 py-4 sm:px-5 space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Batch summary</p>
                <p className="text-sm text-text-primary">
                  <span className="font-semibold tabular-nums">{totalAds}</span>
                  {' '}
                  {totalAds === 1 ? 'ad' : 'ads'} · {aspectLabel} ·{' '}
                  {copyMode === 'ai' ? 'AI copy' : 'Manual copy'}
                </p>
                <p className="text-xs text-text-muted leading-relaxed">
                  Adjust per-template variation counts below. Use interactive mode if you want to edit prompts before
                  images run.
                </p>
              </div>

              <VariationStrip
                templates={selectedTemplates}
                variations={variations}
                onVariationChange={handleVariationChange}
                onRemove={handleRemoveTemplate}
              />

              <div className="rounded-xl border border-nativz-border bg-background/35 p-4 sm:p-5 space-y-4">
                <div>
                  <p className="text-sm font-medium text-text-primary">Generation mode</p>
                  <p className="text-xs text-text-muted mt-1 leading-relaxed">
                    Auto sends the batch immediately. Interactive loads prompt previews so you can tweak copy and style
                    notes first.
                  </p>
                </div>
                <WizardSegmentedControl
                  value={mode}
                  onChange={(m) => {
                    setMode(m);
                    if (m === 'auto') setPromptPreviews(null);
                  }}
                  options={[
                    { value: 'auto' as const, label: 'Auto', icon: Zap },
                    { value: 'interactive' as const, label: 'Interactive', icon: Eye },
                  ]}
                />
              </div>

              {promptPreviews && mode === 'interactive' && (
                <PromptReview
                  previews={promptPreviews}
                  onApproveAll={(edited) => {
                    void handleGenerate(edited);
                  }}
                  onCancel={() => setPromptPreviews(null)}
                  generating={generating}
                />
              )}

              {!promptPreviews && (
                <div className="flex flex-col sm:flex-row gap-3">
                  {mode === 'interactive' && (
                    <Button
                      size="lg"
                      variant="outline"
                      className="flex-1 h-12"
                      onClick={handlePreviewPrompts}
                      disabled={
                        loadingPreviews ||
                        totalAds === 0 ||
                        (scrapedProducts.length > 0 && selectedProductIndices.size === 0)
                      }
                    >
                      {loadingPreviews ? (
                        <>
                          <Loader2 size={18} className="animate-spin" /> Loading previews…
                        </>
                      ) : (
                        <>
                          <Eye size={18} /> Review prompts ({totalAds})
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    size="lg"
                    className={`h-12 ${mode === 'interactive' ? 'flex-1' : 'w-full'}`}
                    onClick={() => void handleGenerate()}
                    disabled={
                      generating ||
                      totalAds === 0 ||
                      (scrapedProducts.length > 0 && selectedProductIndices.size === 0)
                    }
                  >
                    {generating ? (
                      <>
                        <Loader2 size={18} className="animate-spin" /> Generating…
                      </>
                    ) : (
                      <>
                        <Sparkles size={18} /> Generate {totalAds} {totalAds === 1 ? 'ad' : 'ads'}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </AdWizardShell>

        <AdWizardFooter>
          <Button
            type="button"
            variant="outline"
            disabled={flowIdx <= 0}
            onClick={() => setFlowIdx((i) => Math.max(0, i - 1))}
          >
            Back
          </Button>
          {currentStep.id !== 'generate' ? (
            <Button
              type="button"
              disabled={!canAdvanceFromCurrentStep() || flowIdx >= AD_WIZARD_STEP_META.length - 1}
              onClick={() => setFlowIdx((i) => Math.min(AD_WIZARD_STEP_META.length - 1, i + 1))}
            >
              Continue
            </Button>
          ) : null}
        </AdWizardFooter>
      </div>

      {brandContextSource === 'brand_dna' && (
        <BrandDnaWizardRail clientId={clientId} clientSlug={clientSlug} />
      )}
    </div>
  );
}
