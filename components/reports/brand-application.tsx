'use client';

import { Target } from 'lucide-react';

import { Markdown } from '@/components/ai/markdown';

interface BrandApplicationProps {
  /** From topic search AI when client-scoped research ran */
  content: string | null | undefined;
  clientName?: string | null;
}

/**
 * Explains how to apply the topic search to the attached brand.
 * Uses pipeline `brand_alignment_notes` when present; otherwise a short guided fallback.
 */
export function BrandApplication({ content, clientName }: BrandApplicationProps) {
  const trimmed = content?.trim() ?? '';
  const fallback =
    clientName != null && clientName.length > 0
      ? `Use the signals above to shape **${clientName}** short-form: lead with the hooks and angles that match your pillars, then validate tone against your brand voice. Run the ideation pipeline to turn these topics into a filmed cadence.`
      : `Attach a client to this search to get tailored brand application notes from the research pipeline. Until then, use the engagement drivers and hooks below as a creative brief for your next short-form batch.`;

  const body = trimmed.length > 0 ? trimmed : fallback;

  return (
    <div className="flex h-full min-h-[4rem] items-start gap-3 sm:gap-4 lg:border-l lg:border-nativz-border/50 lg:pl-8">
      {/* Icon tile — coral instead of accent2/purple. Coral is the brand's
          accent / urgency color (.impeccable.md), and using it here keeps
          the executive-summary | brand-application pair visually distinct
          while staying inside the cyan-purple-coral palette ("don't blur
          them" — purple is reserved for CTAs, not chrome). */}
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-coral-500/10 ring-1 ring-coral-500/25">
        <Target size={16} className="text-coral-300" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-coral-300/90">
          Brand application
        </h3>
        <div className="leading-relaxed text-text-primary [&_p]:text-text-primary [&_p]:m-0 [&_strong]:font-semibold">
          <Markdown content={body} bodySize="md" />
        </div>
      </div>
    </div>
  );
}
