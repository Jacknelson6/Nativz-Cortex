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
import { BatchCtaField } from './batch-cta-field';
import { DEFAULT_BATCH_CTA } from '@/lib/ad-creatives/batch-cta-presets';
import {
  AD_GENERATE_MAX_PRODUCTS,
  type AdCreative,
  type AdPromptTemplate,
  type AspectRatio,
  type BrandLayoutMode,
} from '@/lib/ad-creatives/types';
import type { WizardTemplate } from '@/lib/ad-creatives/wizard-template';
import { adPromptRowToWizardTemplate } from '@/lib/ad-creatives/wizard-template';
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
import { NanoBananaTemplateGrid } from './nano-banana-template-grid';
import type { NanoCatalogListItem } from '@/lib/ad-creatives/nano-banana/to-wizard-template';
import { nanoCatalogItemToWizardTemplate } from '@/lib/ad-creatives/nano-banana/to-wizard-template';
import type { AdBatchPlaceholderConfig } from '@/lib/ad-creatives/placeholder-config';

const WIZARD_ASPECT_RATIOS = new Set<AspectRatio>(['1:1', '9:16', '4:5']);

function buildNanoGlobalVariations(
  selectedIds: Set<string>,
  variationMap: Map<string, number>,
  catalog: NanoCatalogListItem[],
): { slug: string; count: number }[] {
  return [...selectedIds]
    .map((slug) => ({
      slug,
      count: variationMap.get(slug) ?? 2,
      order: catalog.find((n) => n.slug === slug)?.sortOrder ?? 999,
    }))
    .sort((a, b) => a.order - b.order)
    .map(({ slug, count }) => ({ slug, count }));
}

function firstSelectedProductImageUrl(
  scrapedProducts: ScrapedProduct[],
  selectedProductIndices: Set<number>,
): string | undefined {
  const sorted = [...selectedProductIndices].sort((a, b) => a - b);
  for (const i of sorted) {
    const u = scrapedProducts[i]?.imageUrl?.trim();
    if (!u) continue;
    try {
      const parsed = new URL(u);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return u;
    } catch {
      /* skip */
    }
  }
  return undefined;
}

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
  onGenerationStart?: (batchId: string, placeholderConfig: AdBatchPlaceholderConfig) => void;
}

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

  // Templates — client ad library (scraped / uploaded prompt templates)
  const [templates, setTemplates] = useState<WizardTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());

  // Per-template variations
  const [variations, setVariations] = useState<Map<string, number>>(new Map());

  /** Client library vs global Nano Banana catalog */
  const [templateSource, setTemplateSource] = useState<'client' | 'nano'>('nano');
  const [nanoCatalog, setNanoCatalog] = useState<NanoCatalogListItem[]>([]);
  const [loadingNanoCatalog, setLoadingNanoCatalog] = useState(false);

  // Copy & format
  const [copyMode, setCopyMode] = useState<'ai' | 'manual'>('ai');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [brandLayoutMode, setBrandLayoutMode] = useState<BrandLayoutMode>('reference_image');
  const [manualHeadline, setManualHeadline] = useState('');
  const [manualSubheadline, setManualSubheadline] = useState('');
  const [manualCta, setManualCta] = useState('');
  /** Shared CTA for every variation when using AI copy */
  const [batchCta, setBatchCta] = useState(DEFAULT_BATCH_CTA);

  // Brand media
  const [mediaUrls, setMediaUrls] = useState<string[]>(initialMediaUrls ?? []);
  const [selectedMediaUrls, setSelectedMediaUrls] = useState<Set<string>>(new Set());
  const [flowIdx, setFlowIdx] = useState(0);
  const [offerText, setOfferText] = useState('');

  // Mode: auto vs interactive
  const [mode, setMode] = useState<'auto' | 'interactive'>('auto');
  const [promptPreviews, setPromptPreviews] = useState<PromptPreviewData[] | null>(null);
  /** Reuse preview API’s one-shot brief on generate to avoid a second LLM call */
  const [previewCreativeBrief, setPreviewCreativeBrief] = useState<string | null>(null);
  const [loadingPreviews, setLoadingPreviews] = useState(false);

  // Generate
  const [generating, setGenerating] = useState(false);

  /** Overrides `brand.name` in API bodies when seeding from an existing creative. */
  const [productServiceOverride, setProductServiceOverride] = useState<string | null>(null);
  /** Passed as `styleDirectionGlobal` — prior full image prompt (capped server-side). */
  const [repeatStyleDirection, setRepeatStyleDirection] = useState<string | null>(null);
  const seedTemplateAppliedRef = useRef<string | null>(null);

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
    const ps = seedCreative.product_service?.trim();
    setProductServiceOverride(ps || null);
    const pu = seedCreative.prompt_used?.trim();
    setRepeatStyleDirection(pu ? pu.slice(0, 4000) : null);

    const genIdx = AD_WIZARD_STEP_META.findIndex((s) => s.id === 'generate');
    setFlowIdx(genIdx >= 0 ? genIdx : 0);

    toast.success('Loaded this creative’s settings. Review and run a new batch.');
  }, [seedCreative]);

  useEffect(() => {
    if (!seedCreative) return;

    const meta = seedCreative.metadata;
    const globalSlug =
      meta &&
      typeof meta === 'object' &&
      'global_slug' in meta &&
      typeof (meta as { global_slug: unknown }).global_slug === 'string'
        ? (meta as { global_slug: string }).global_slug.trim()
        : '';

    if (globalSlug) {
      setTemplateSource('nano');
      if (seedTemplateAppliedRef.current === seedCreative.id) return;
      setSelectedTemplateIds(new Set([globalSlug]));
      setVariations(new Map([[globalSlug, 2]]));
      seedTemplateAppliedRef.current = seedCreative.id;
      return;
    }

    if (loadingTemplates) return;
    if (templates.length === 0) return;
    setTemplateSource('client');

    const tid = seedCreative.template_id;
    if (!tid) {
      toast.message('This creative used a global catalog style — pick templates before generating.');
      const tIdx = AD_WIZARD_STEP_META.findIndex((s) => s.id === 'templates');
      if (tIdx >= 0) setFlowIdx(tIdx);
      return;
    }
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
      const cRes = await fetch(`/api/clients/${clientId}/ad-creatives/templates?limit=2000`);
      const customRows = cRes.ok ? ((await cRes.json()) as { templates?: AdPromptTemplate[] }).templates ?? [] : [];
      setTemplates(customRows.map((row) => adPromptRowToWizardTemplate(row)));
    } catch {
      toast.error('Could not load templates. Refresh the page or try again.');
    } finally {
      setLoadingTemplates(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const fetchNanoCatalog = useCallback(async () => {
    setLoadingNanoCatalog(true);
    try {
      const res = await fetch('/api/ad-creatives/global-templates');
      const data = (await res.json()) as { templates?: NanoCatalogListItem[] };
      setNanoCatalog(Array.isArray(data.templates) ? data.templates : []);
    } catch {
      toast.error('Could not load global templates.');
      setNanoCatalog([]);
    } finally {
      setLoadingNanoCatalog(false);
    }
  }, []);

  useEffect(() => {
    void fetchNanoCatalog();
  }, [fetchNanoCatalog]);

  function toggleTemplate(id: string) {
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

      const globalTemplateVariations =
        templateSource === 'nano'
          ? buildNanoGlobalVariations(selectedTemplateIds, variations, nanoCatalog)
          : null;

      const res = await fetch(`/api/clients/${clientId}/ad-creatives/preview-prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          templateSource === 'nano'
            ? {
                globalTemplateVariations,
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
                ...(repeatStyleDirection?.trim()
                  ? { styleDirectionGlobal: repeatStyleDirection.trim() }
                  : {}),
                ...(copyMode === 'ai'
                  ? { batchCta: (batchCta.trim() || DEFAULT_BATCH_CTA).slice(0, 30) }
                  : {}),
              }
            : {
                templateVariations,
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
                ...(repeatStyleDirection?.trim()
                  ? { styleDirectionGlobal: repeatStyleDirection.trim() }
                  : {}),
                ...(copyMode === 'ai'
                  ? { batchCta: (batchCta.trim() || DEFAULT_BATCH_CTA).slice(0, 30) }
                  : {}),
                brandLayoutMode,
              },
        ),
      });

      if (!res.ok) throw new Error('Failed to generate previews');
      const data = await res.json();
      setPromptPreviews(data.previews ?? []);
      const b = typeof data.creativeBrief === 'string' ? data.creativeBrief.trim() : '';
      setPreviewCreativeBrief(b.length > 0 ? b : null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to preview prompts');
    } finally {
      setLoadingPreviews(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Generate
  // ---------------------------------------------------------------------------

  const selectedTemplates = useMemo(() => {
    if (templateSource === 'nano') {
      const out: ReturnType<typeof nanoCatalogItemToWizardTemplate>[] = [];
      for (const slug of selectedTemplateIds) {
        const item = nanoCatalog.find((n) => n.slug === slug);
        if (item) out.push(nanoCatalogItemToWizardTemplate(item));
      }
      return out;
    }
    return templates.filter((t) => selectedTemplateIds.has(t.id));
  }, [templateSource, selectedTemplateIds, templates, nanoCatalog]);

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

      if (selectedProducts.length > AD_GENERATE_MAX_PRODUCTS && templateSource !== 'nano') {
        toast.message(
          `Including the first ${AD_GENERATE_MAX_PRODUCTS} of ${selectedProducts.length} selected products in this batch. Deselect extras or run generation again for the rest.`,
        );
      }
      const productsForBatch = selectedProducts.slice(0, AD_GENERATE_MAX_PRODUCTS);
      const productsForRequest =
        templateSource === 'nano' ? productsForBatch.slice(0, 1) : productsForBatch;

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

      const productConfigs = productsForRequest.map((p) => ({
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

      const nanoGtv =
        templateSource === 'nano'
          ? buildNanoGlobalVariations(selectedTemplateIds, variations, nanoCatalog)
          : null;

      const placeholderConfig: AdBatchPlaceholderConfig =
        templateSource === 'nano' && nanoGtv
          ? {
              brandColors: brand.colors.slice(0, 4),
              skeletonOnly: true,
              templateThumbnails: nanoGtv.flatMap((tv) =>
                Array.from({ length: tv.count }, (_, i) => ({
                  templateId: tv.slug,
                  imageUrl: '',
                  variationIndex: i,
                })),
              ),
            }
          : {
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

      const nanoProductImageUrl = firstSelectedProductImageUrl(scrapedProducts, selectedProductIndices);

      const body: Record<string, unknown> =
        templateSource === 'nano' && nanoGtv
          ? {
              globalTemplateVariations: nanoGtv,
              productService:
                effectiveProductService ||
                brand.name ||
                productsForRequest.map((p) => p.name).join(', ') ||
                'Product',
              offer: offerText,
              onScreenTextMode: copyMode === 'ai' ? 'ai_generate' : 'manual',
              aspectRatio,
              products: productConfigs,
              brandUrl: brand.url,
              placeholderConfig,
              ...(nanoProductImageUrl ? { productImageUrls: [nanoProductImageUrl] } : {}),
            }
          : {
              templateVariations,
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
              brandLayoutMode,
            };

      if (repeatStyleDirection?.trim()) {
        body.styleDirectionGlobal = repeatStyleDirection.trim();
      }

      if (copyMode === 'ai') {
        body.batchCta = (batchCta.trim() || DEFAULT_BATCH_CTA).slice(0, 30);
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

      if (previewCreativeBrief) {
        body.creativeBrief = previewCreativeBrief;
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
      setPreviewCreativeBrief(null);
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
        if (templateSource === 'nano') {
          return selectedTemplateIds.size > 0 && !loadingNanoCatalog;
        }
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
                value={templateSource}
                onChange={(src) => {
                  setTemplateSource(src);
                  setSelectedTemplateIds(new Set());
                  setVariations(new Map());
                }}
                options={[
                  { value: 'nano' as const, label: 'Nano Banana', icon: Sparkles },
                  { value: 'client' as const, label: 'Client library', icon: LayoutGrid },
                ]}
              />
              {templateSource === 'nano' ? (
                <NanoBananaTemplateGrid
                  items={nanoCatalog}
                  loading={loadingNanoCatalog}
                  selectedIds={selectedTemplateIds}
                  onToggle={toggleTemplate}
                />
              ) : loadingTemplates ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-text-muted">
                  <Loader2 size={28} className="animate-spin opacity-80" />
                  <p className="text-sm">Loading templates…</p>
                </div>
              ) : (
                <TemplateGrid
                  templates={templates}
                  selectedIds={selectedTemplateIds}
                  onToggle={toggleTemplate}
                  clientId={clientId}
                  onTemplatesRefresh={fetchTemplates}
                />
              )}
            </div>
          )}

          {currentStep.id === 'format' && (
            <div className="space-y-6">
              <div>
                <p className="text-sm font-medium text-text-primary mb-3">Aspect ratio</p>
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
              </div>
              {templateSource !== 'nano' && (
                <div className="space-y-2 pt-2 border-t border-nativz-border/80 max-w-xl">
                  <label htmlFor="wizard-brand-layout" className="text-sm font-medium text-text-primary">
                    Layout reference for image model
                  </label>
                  <select
                    id="wizard-brand-layout"
                    value={brandLayoutMode}
                    onChange={(e) => setBrandLayoutMode(e.target.value as BrandLayoutMode)}
                    className="w-full rounded-xl border border-nativz-border bg-background px-3 py-2.5 text-sm text-text-primary focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/25"
                  >
                    <option value="reference_image">Template screenshot + JSON prompt (default)</option>
                    <option value="schema_only">Schema only (no template PNG)</option>
                    <option value="schema_plus_wireframe">Schema + zone wireframe</option>
                  </select>
                  <p className="text-[11px] text-text-muted leading-relaxed">
                    Full ad (copy, hero, brand mark) is generated in one Gemini pass. Default uses the template PNG as a
                    loose layout guide plus the assembled prompt. Use schema only if the reference keeps pulling wrong
                    heroes.
                  </p>
                </div>
              )}
              {templateSource === 'nano' && (
                <p className="text-[11px] text-text-muted leading-relaxed max-w-xl pt-2 border-t border-nativz-border/80">
                  Nano Banana uses global style prompts only — no client template screenshot is sent to the model.
                </p>
              )}
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
                <div className="rounded-xl border border-nativz-border bg-background/40 px-4 py-4">
                  <BatchCtaField
                    id="wizard-batch-cta"
                    value={batchCta}
                    onChange={setBatchCta}
                  />
                </div>
              )}

              {copyMode === 'manual' && (
                <div className="space-y-5 rounded-xl border border-nativz-border bg-background/40 p-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-text-primary">Headline</p>
                    <input
                      value={manualHeadline}
                      onChange={(e) => setManualHeadline(e.target.value)}
                      placeholder="e.g. Show up when buyers ask AI for recommendations"
                      className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/45 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/25"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-text-primary">Subheadline</p>
                    <input
                      value={manualSubheadline}
                      onChange={(e) => setManualSubheadline(e.target.value)}
                      placeholder="e.g. Track citations and share of voice across answer engines"
                      className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/45 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/25"
                    />
                  </div>
                  <div className="space-y-2 pt-1 border-t border-nativz-border/80">
                    <p className="text-sm font-medium text-text-primary">Call to action</p>
                    <input
                      value={manualCta}
                      onChange={(e) => setManualCta(e.target.value)}
                      placeholder="e.g. Try for free"
                      className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/45 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/25"
                    />
                  </div>
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
                  {copyMode === 'ai'
                    ? `AI copy · CTA: ${batchCta.trim() || DEFAULT_BATCH_CTA}`
                    : 'Manual copy'}
                  {' · '}
                  {templateSource === 'nano'
                    ? 'Nano Banana (global style)'
                    : brandLayoutMode === 'schema_only'
                      ? 'Schema only'
                      : brandLayoutMode === 'schema_plus_wireframe'
                        ? 'Schema + wireframe'
                        : 'Template + JSON prompt'}
                </p>
                <p className="text-xs text-text-muted leading-relaxed">
                  {templateSource === 'nano' && scrapedProducts.length > 0 ? (
                    <>
                      The first selected product with a valid image URL is used as the primary packshot reference. Adjust
                      selection order on the products step if needed.
                    </>
                  ) : (
                    <>
                      Adjust per-template variation counts below. Use interactive mode if you want to edit prompts before
                      images run.
                    </>
                  )}
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
                    if (m === 'auto') {
                      setPromptPreviews(null);
                      setPreviewCreativeBrief(null);
                    }
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
                  onCancel={() => {
                    setPromptPreviews(null);
                    setPreviewCreativeBrief(null);
                  }}
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
