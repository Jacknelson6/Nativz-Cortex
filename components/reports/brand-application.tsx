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
    <div className="flex items-start gap-3 h-full min-h-[4rem] lg:border-l lg:border-nativz-border/50 lg:pl-8">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent2-surface mt-0.5">
        <Target size={16} className="text-accent2-text" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
          Brand application
        </h3>
        <div className="text-sm leading-relaxed text-text-primary [&_p]:text-text-primary [&_p]:m-0 [&_strong]:font-semibold">
          <Markdown content={body} />
        </div>
      </div>
    </div>
  );
}
