'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Dna,
  Layers,
  Sparkles,
  ExternalLink,
  ArrowRight,
  ChevronDown,
  Lock,
  Zap,
} from 'lucide-react';
import { BrandDNACards, BRAND_DNA_BENTO_SURFACE } from '@/components/brand-dna/brand-dna-cards';
import { BrandDNAProgress } from '@/components/brand-dna/brand-dna-progress';
import { BrandDNASectionEditor } from '@/components/brand-dna/brand-dna-section-editor';
import { Markdown } from '@/components/ai/markdown';
import { TooltipCard } from '@/components/ui/tooltip-card';
import { Card } from '@/components/ui/card';
import { formatRelativeTime } from '@/lib/utils/format';
import type { Pillar } from '@/components/ideas-hub/pillar-card';
import type { PillarReferencePreview } from '@/lib/strategy-lab/pillar-reference-previews';
import type { BrandGuidelineMetadata } from '@/lib/knowledge/types';
import { dispatchBrandDnaUpdated } from '@/lib/brand-dna/brand-dna-updated-event';
import { cn } from '@/lib/utils/cn';

type BrandGuidelinePayload = {
  id: string;
  content: string;
  metadata: unknown;
  created_at: string;
  updated_at: string;
} | null;

function isProbablyUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

const PILLARS_IDEAS_TOOLTIP = {
  title: 'Content pillars and ideas',
  description:
    'Content pillars are recurring themes or angles for this client (often grounded in topic research). Ideas are named generator runs — for example “March ideas” — that produce shoot-ready concepts within those pillars. Brand DNA must be ready before you run pillar idea batches.',
};

type StrategyLabContentStackCardProps = {
  clientId: string;
  brandDnaStatus: string;
  brandGuideline: BrandGuidelinePayload;
  hasCompletedTopicSearch: boolean;
  hasPillars: boolean;
  pillars: Pillar[];
  pillarReferencePreviews: Record<string, PillarReferencePreview>;
  canGenerateIdeas: boolean;
  pillarStrategyHref: string;
  ideasHubPillarIdeasHref: string;
  ideasHref: string;
  brandDnaHref: string;
  /**
   * `full` — pillars, brand DNA, and pillar idea batches (default).
   * `pillars-only` — strategy workspace: pillars + idea batches, no brand DNA block.
   * `brand-dna-only` — brand knowledge tab: DNA bento only (no pillars / idea batches).
   */
  variant?: 'full' | 'pillars-only' | 'brand-dna-only';
};

/**
 * Pillars, Brand DNA (editable bento), and pillar ideas — one scrollable workspace block with consistent dividers.
 */
export function StrategyLabContentStackCard({
  clientId,
  brandDnaStatus,
  brandGuideline,
  hasCompletedTopicSearch,
  hasPillars,
  pillars,
  pillarReferencePreviews,
  canGenerateIdeas,
  pillarStrategyHref,
  ideasHubPillarIdeasHref,
  ideasHref,
  brandDnaHref,
  variant = 'full',
}: StrategyLabContentStackCardProps) {
  const showPillars = variant === 'full' || variant === 'pillars-only';
  const showBrandDna = variant === 'full' || variant === 'brand-dna-only';
  const showPillarIdeas = variant === 'full' || variant === 'pillars-only';
  const router = useRouter();
  const [guidelineExpanded, setGuidelineExpanded] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [localMetadata, setLocalMetadata] = useState<BrandGuidelineMetadata | null>(
    (brandGuideline?.metadata as BrandGuidelineMetadata) ?? null,
  );

  useEffect(() => {
    setLocalMetadata((brandGuideline?.metadata as BrandGuidelineMetadata) ?? null);
  }, [brandGuideline?.id, brandGuideline?.updated_at, brandGuideline?.metadata]);

  const metadata = useMemo(() => {
    const m = localMetadata ?? (brandGuideline?.metadata as BrandGuidelineMetadata | undefined);
    return (m ?? {}) as Record<string, unknown>;
  }, [localMetadata, brandGuideline?.metadata]);

  const metadataForEditor = useMemo(
    () => (localMetadata ?? (brandGuideline?.metadata as BrandGuidelineMetadata) ?? {}) as BrandGuidelineMetadata,
    [localMetadata, brandGuideline?.metadata],
  );

  const brandDnaReady = !!brandGuideline && brandDnaStatus !== 'generating';

  const handleSectionSaved = useCallback(
    (updated: Partial<BrandGuidelineMetadata>) => {
      setLocalMetadata((prev) => (prev ? { ...prev, ...updated } : (updated as BrandGuidelineMetadata)));
      dispatchBrandDnaUpdated(clientId);
      router.refresh();
    },
    [clientId, router],
  );

  return (
    <Card className="border-nativz-border/60 bg-surface p-0 overflow-hidden">
      {showPillars ? (
      <div className="border-b border-nativz-border/45 bg-background/25 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2">
            <Layers className="mt-0.5 h-5 w-5 shrink-0 text-accent-text" aria-hidden />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <TooltipCard title={PILLARS_IDEAS_TOOLTIP.title} description={PILLARS_IDEAS_TOOLTIP.description}>
                  <span className="text-lg font-semibold text-foreground">Content pillars and ideas</span>
                </TooltipCard>
              </div>
              <p className="mt-1 text-sm text-text-muted">
                Define pillars from research, align brand DNA, then run named idea batches for shoots.
              </p>
            </div>
          </div>
          {hasPillars ? (
            <Link
              href={pillarStrategyHref}
              className="shrink-0 text-sm font-medium text-accent-text underline-offset-4 hover:underline"
            >
              Add or regenerate pillars
            </Link>
          ) : null}
        </div>
      </div>
      ) : null}

      {/* — Pillars — */}
      {showPillars ? (
      <div className="space-y-4 p-5">
        {!hasCompletedTopicSearch ? (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm text-text-secondary">
            <span className="font-medium text-amber-200/90">Start with topic research.</span>{' '}
            Run at least one topic search to completion, then build pillars from those findings (or add pillars
            manually in the idea generator after you have research context).
          </div>
        ) : null}

        {hasCompletedTopicSearch && !hasPillars ? (
          <div className="rounded-lg border border-accent/25 bg-accent/[0.06] px-4 py-3 text-sm text-text-secondary">
            <p className="font-medium text-text-primary">Next: define content pillars</p>
            <p className="mt-1">
              Generate pillars from your research angles, or create them manually — both paths live in the idea
              generator.
            </p>
            <Link
              href={pillarStrategyHref}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent-surface px-4 py-2.5 text-sm font-semibold text-accent-text transition hover:bg-accent-surface/80"
            >
              Open pillar strategy
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        ) : null}

        {pillars.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {pillars.map((p) => {
              const preview = pillarReferencePreviews[p.id];
              const examples = (p.example_series ?? []).filter(Boolean).slice(0, 3);
              return (
                <div
                  key={p.id}
                  className="flex flex-col overflow-hidden rounded-xl border border-nativz-border/50 bg-background/50"
                >
                  {preview?.thumbnailUrl ? (
                    <div className="relative aspect-video w-full bg-black/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={preview.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center bg-white/[0.03] text-xs text-text-muted">
                      Reference example
                    </div>
                  )}
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-start gap-2">
                      {p.emoji ? (
                        <span className="text-lg leading-none" aria-hidden>
                          {p.emoji}
                        </span>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground">{p.name}</p>
                        {p.description ? (
                          <p className="mt-1 line-clamp-3 text-sm text-text-muted">{p.description}</p>
                        ) : null}
                      </div>
                    </div>
                    {examples.length > 0 ? (
                      <ul className="mt-3 space-y-1.5 text-xs text-text-secondary">
                        {examples.map((ex, i) => (
                          <li key={i} className="truncate">
                            {isProbablyUrl(ex) ? (
                              <a
                                href={ex.trim()}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-accent-text underline-offset-2 hover:underline"
                              >
                                {ex}
                              </a>
                            ) : (
                              <span title={ex}>{ex}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="mt-auto flex flex-wrap gap-2 pt-4">
                      {preview?.referenceVideoUrl ? (
                        <a
                          href={preview.referenceVideoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-accent-text underline-offset-2 hover:underline"
                        >
                          View reference video
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                      {canGenerateIdeas ? (
                        <Link
                          href={ideasHubPillarIdeasHref}
                          className="inline-flex items-center gap-1 text-xs font-medium text-text-muted underline-offset-2 hover:text-accent-text hover:underline"
                        >
                          Generate ideas
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-text-muted/80">
                          <Lock className="h-3 w-3" aria-hidden />
                          Ideas after brand DNA
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : !hasCompletedTopicSearch ? (
          <p className="text-sm text-text-muted">Complete a topic search to unlock pillar strategy for this client.</p>
        ) : null}
      </div>
      ) : null}

      {/* — Brand DNA — */}
      {showBrandDna ? (
      <div
        className={`border-t border-nativz-border/45 bg-background/[0.15] px-5 py-5 ${
          !showPillars ? 'border-t-0' : ''
        }`}
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Dna className="h-5 w-5 shrink-0 text-accent-text" aria-hidden />
            <h3 className="text-base font-semibold text-foreground">Brand DNA</h3>
          </div>
          <Link
            href={brandDnaHref}
            className="inline-flex items-center gap-1 text-sm font-medium text-accent-text underline-offset-4 hover:underline"
          >
            Full brand DNA page
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        {brandDnaStatus === 'generating' ? (
          <div className={`${BRAND_DNA_BENTO_SURFACE} p-4`}>
            <BrandDNAProgress
              clientId={clientId}
              onComplete={() => router.refresh()}
              navigateAwayHint="You can open other admin pages — generation keeps running. Refresh this page when it finishes."
            />
          </div>
        ) : brandGuideline ? (
          <div className="space-y-4">
            <BrandDNACards
              metadata={metadata}
              clientId={clientId}
              editable
              onEditSection={setEditingSection}
            />
            <div className={`${BRAND_DNA_BENTO_SURFACE} p-4`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-text-primary">Full brand guideline</h4>
                {brandGuideline.updated_at ? (
                  <span className="text-xs text-text-muted">
                    Updated {formatRelativeTime(brandGuideline.updated_at ?? brandGuideline.created_at)}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setGuidelineExpanded((e) => !e)}
                className="mt-3 flex w-full items-center justify-between gap-2 rounded-lg border border-nativz-border/45 bg-background/35 px-3 py-2.5 text-left text-sm font-medium text-text-secondary transition hover:bg-background/55 hover:text-text-primary"
                aria-expanded={guidelineExpanded}
              >
                <span>{guidelineExpanded ? 'Hide full guideline' : 'View full guideline'}</span>
                <ChevronDown
                  className={cn('h-4 w-4 shrink-0 text-text-muted transition-transform', guidelineExpanded && 'rotate-180')}
                  aria-hidden
                />
              </button>
              {guidelineExpanded ? (
                <div className="prose prose-invert prose-sm mt-4 max-w-none border-t border-nativz-border/35 pt-4 text-text-secondary">
                  <Markdown content={brandGuideline.content} />
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-nativz-border/40 bg-background/40 px-4 py-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-surface">
              <Sparkles className="h-6 w-6 text-accent-text" aria-hidden />
            </div>
            <p className="mb-4 text-sm text-text-muted">
              Brand DNA powers on-brand ideas. Generate it before running pillar idea batches.
            </p>
            <Link
              href={brandDnaHref}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-surface px-4 py-2 text-sm font-semibold text-accent-text transition hover:bg-accent-surface/80"
            >
              Generate brand DNA
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        )}
      </div>
      ) : null}

      {/* — Ideas — */}
      {showPillarIdeas ? (
      <div className="border-t border-nativz-border/45 px-5 py-5">
        <div className="mb-3 flex items-center gap-2">
          <Zap className="h-5 w-5 text-accent-text" aria-hidden />
          <h3 className="text-base font-semibold text-foreground">Pillar idea batches</h3>
        </div>
        {!canGenerateIdeas ? (
          <div className="rounded-lg border border-nativz-border/45 bg-background/35 px-4 py-4 text-sm text-text-secondary">
            <div className="flex items-start gap-2">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden />
              <div>
                <p className="font-medium text-text-primary">Follow the steps above first</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-text-muted">
                  {!hasPillars ? <li>Create at least one content pillar.</li> : null}
                  {hasPillars && !brandDnaReady ? (
                    <li>Finish brand DNA (not generating) so ideas match the brand.</li>
                  ) : null}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-text-muted">
              Each run can be named (for example &quot;March ideas&quot; or &quot;Campaign 2&quot;) so you can keep monthly or
              campaign batches separate — same flow as topic searches.
            </p>
            <Link
              href={ideasHubPillarIdeasHref}
              className="inline-flex items-center gap-2 rounded-lg bg-accent-surface px-4 py-2.5 text-sm font-semibold text-accent-text transition hover:bg-accent-surface/80"
            >
              Open idea generator
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href={ideasHref}
              className="block text-xs text-text-muted underline-offset-2 hover:text-accent-text hover:underline"
            >
              Browse saved ideas for this client
            </Link>
          </div>
        )}
      </div>
      ) : null}

      {editingSection && brandGuideline ? (
        <BrandDNASectionEditor
          section={editingSection}
          clientId={clientId}
          metadata={metadataForEditor}
          open={!!editingSection}
          onClose={() => setEditingSection(null)}
          onSaved={handleSectionSaved}
        />
      ) : null}
    </Card>
  );
}
