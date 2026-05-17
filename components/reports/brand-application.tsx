'use client';

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
    <div className="h-full min-w-0 lg:border-l lg:border-nativz-border/50 lg:pl-8">
      <div className="mb-4 border-b border-nativz-border/60 pb-4">
        <h4 className="text-lg font-semibold tracking-tight text-text-primary">
          Brand application
        </h4>
      </div>
      <div className="leading-relaxed text-text-primary [&_p]:text-text-primary [&_p]:m-0 [&_p]:!text-[17px] [&_p]:!leading-[1.7] [&_li]:!text-[17px] [&_li]:!leading-[1.7] [&_strong]:font-semibold">
        <Markdown content={body} bodySize="md" />
      </div>
    </div>
  );
}
