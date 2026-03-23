'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Info,
  Sparkles,
  Loader2,
  Square,
  RectangleVertical,
  Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { GenerationProgress } from './generation-progress';
import type { AdCreativeTemplate, AspectRatio, BrandLayoutMode, AdPromptTemplate } from '@/lib/ad-creatives/types';
import { ASPECT_RATIOS } from '@/lib/ad-creatives/types';
import { adPromptRowToWizardTemplate } from '@/lib/ad-creatives/wizard-template';
import { BatchCtaField } from './batch-cta-field';
import { DEFAULT_BATCH_CTA } from '@/lib/ad-creatives/batch-cta-presets';

type CopyMode = 'ai' | 'manual';

const RATIO_ICONS: Record<string, typeof Square> = {
  '1:1': Square,
  '9:16': Smartphone,
  '4:5': RectangleVertical,
};

interface GenerationFormProps {
  clientId: string;
  onNavigateToTemplates: () => void;
}

interface CollapsibleSectionProps {
  title: string;
  number: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ title, number, defaultOpen = true, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-surface-hover transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-surface text-accent-text text-xs font-semibold">
            {number}
          </span>
          <span className="text-sm font-semibold text-text-primary">{title}</span>
        </div>
        {open ? (
          <ChevronUp size={16} className="text-text-muted" />
        ) : (
          <ChevronDown size={16} className="text-text-muted" />
        )}
      </button>
      {open && <div className="px-5 pb-5 pt-1">{children}</div>}
    </div>
  );
}

export function GenerationForm({ clientId, onNavigateToTemplates }: GenerationFormProps) {
  // Template selection
  const [templates, setTemplates] = useState<AdCreativeTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());

  // Product & offer
  const [productService, setProductService] = useState('');
  const [offer, setOffer] = useState('');

  // Ad copy
  const [copyMode, setCopyMode] = useState<CopyMode>('ai');
  const [headline, setHeadline] = useState('');
  const [subheadline, setSubheadline] = useState('');
  const [cta, setCta] = useState('');
  const [batchCta, setBatchCta] = useState(DEFAULT_BATCH_CTA);

  // Format
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [brandLayoutMode, setBrandLayoutMode] = useState<BrandLayoutMode>('reference_image');
  const [numVariations, setNumVariations] = useState(3);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/ad-creatives/templates?limit=2000`);
      if (res.ok) {
        const data = (await res.json()) as { templates?: AdPromptTemplate[] };
        const rows = data.templates ?? [];
        setTemplates(rows.map((row) => adPromptRowToWizardTemplate(row)));
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingTemplates(false);
    }
  }, [clientId]);

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

  const isValid = productService.trim().length > 0 && selectedTemplateIds.size > 0;

  async function handleGenerate() {
    if (!isValid) return;

    setGenerating(true);

    try {
      const body: Record<string, unknown> = {
        templateIds: Array.from(selectedTemplateIds),
        productService: productService.trim(),
        offer: offer.trim(),
        onScreenTextMode: copyMode === 'ai' ? 'ai_generate' : 'manual',
        aspectRatio,
        numVariations,
        brandLayoutMode,
      };

      if (copyMode === 'manual') {
        body.manualText = { headline, subheadline, cta };
      } else {
        body.batchCta = (batchCta.trim() || DEFAULT_BATCH_CTA).slice(0, 30);
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

  // Display subset of templates (first 12)
  const displayTemplates = templates.slice(0, 12);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Section 1 — Template styles */}
      <CollapsibleSection title="Template styles" number={1}>
        {loadingTemplates ? (
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-lg bg-white/[0.06] aspect-square" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
              {displayTemplates.map((t) => {
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
                          <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-3">
              {selectedTemplateIds.size > 0 && (
                <Badge variant="info">
                  {selectedTemplateIds.size} selected
                </Badge>
              )}
              <button
                onClick={onNavigateToTemplates}
                className="text-xs text-accent-text hover:underline cursor-pointer ml-auto"
              >
                Browse all templates
              </button>
            </div>
          </>
        )}
      </CollapsibleSection>

      {/* Section 2 — Product & offer */}
      <CollapsibleSection title="Product & offer" number={2}>
        <div className="space-y-4">
          <Input
            id="product-service"
            label="Product or service"
            value={productService}
            onChange={(e) => setProductService(e.target.value)}
            placeholder="e.g., Organic mushroom matcha powder"
            required
          />
          <Input
            id="offer"
            label="Offer (optional)"
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
            placeholder="e.g., 20% off first month"
          />
        </div>
      </CollapsibleSection>

      {/* Section 3 — Ad copy */}
      <CollapsibleSection title="Ad copy" number={3}>
        <div className="space-y-4">
          {/* Toggle */}
          <div className="flex items-center gap-1 bg-background rounded-lg p-0.5 w-fit">
            {(['ai', 'manual'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setCopyMode(mode)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                  copyMode === mode
                    ? 'bg-surface text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {mode === 'ai' ? 'AI generate' : 'Manual'}
              </button>
            ))}
          </div>

          {copyMode === 'ai' ? (
            <div className="rounded-lg border border-nativz-border bg-surface/50 px-4 py-4">
              <BatchCtaField id="hub-batch-cta" value={batchCta} onChange={setBatchCta} />
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-accent-surface/50 border border-accent/20 px-3 py-2.5">
                <Info size={14} className="text-accent-text mt-0.5 shrink-0" />
                <p className="text-xs text-accent-text leading-relaxed">
                  Copy follows headline, then subheadline, then your shared CTA — same order as on the finished creative.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Input
                id="headline"
                label="Headline"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="e.g., Show up in AI-generated answers"
              />
              <Input
                id="subheadline"
                label="Subheadline"
                value={subheadline}
                onChange={(e) => setSubheadline(e.target.value)}
                placeholder="e.g., Track citations when buyers ask assistants for picks"
              />
              <Input
                id="cta"
                label="Call to action"
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                placeholder="e.g., Try for free"
              />
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Section 4 — Format */}
      <CollapsibleSection title="Format" number={4}>
        <div className="space-y-5">
          {/* Aspect ratio radio cards */}
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
                        : 'border-nativz-border bg-surface hover:border-accent/30'
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
                      <p className="text-[11px] text-text-muted">
                        {ar.value}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Number of variations */}
          <div className="space-y-1.5">
            <label htmlFor="num-variations" className="block text-sm font-medium text-text-secondary">
              Number of variations
            </label>
            <input
              id="num-variations"
              type="number"
              min={1}
              max={20}
              value={numVariations}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 1 && v <= 20) setNumVariations(v);
              }}
              className="block w-24 rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <p className="text-[11px] text-text-muted">Between 1 and 20 variations per batch</p>
          </div>

          <div className="space-y-2 pt-2 border-t border-nativz-border max-w-xl">
            <label htmlFor="hub-brand-layout" className="block text-sm font-medium text-text-secondary">
              Layout reference
            </label>
            <select
              id="hub-brand-layout"
              value={brandLayoutMode}
              onChange={(e) => setBrandLayoutMode(e.target.value as BrandLayoutMode)}
              className="w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="reference_image">Template screenshot + JSON (default)</option>
              <option value="schema_only">Schema only</option>
              <option value="schema_plus_wireframe">Schema + wireframe</option>
            </select>
            <p className="text-[11px] text-text-muted leading-relaxed">
              One Gemini pass renders type, visuals, and brand mark. Default uses the template PNG as a loose layout
              guide.
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Generate button */}
      <div className="pt-2">
        <Button
          size="lg"
          className="w-full"
          disabled={!isValid || generating}
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
              Generate {numVariations} creative{numVariations !== 1 ? 's' : ''}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
