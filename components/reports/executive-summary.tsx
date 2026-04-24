'use client';

import { Sparkles, Building2 } from 'lucide-react';

import { Markdown } from '@/components/ai/markdown';

interface ExecutiveSummaryProps {
  summary: string;
  title?: string;
  variant?: 'default' | 'brand';
}

export function ExecutiveSummary({ summary, title, variant = 'default' }: ExecutiveSummaryProps) {
  if (!summary) return null;

  const isBrand = variant === 'brand';
  const Icon = isBrand ? Building2 : Sparkles;
  const heading = title || (isBrand ? 'Brand alignment' : 'Executive summary');

  return (
    <div className="flex items-start gap-3 sm:gap-4">
      {/* Icon tile — full circle per brand (.impeccable.md: "Colored icon
          backings are full circles, not rounded squares — live-site
          confirmed"). */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-surface mt-0.5 ring-1 ring-accent/20">
        <Icon size={16} className="text-accent-text" />
      </div>
      <div className="min-w-0 flex-1 max-w-4xl">
        {/* Mono caps eyebrow — matches the Cortex eyebrow language used on
            the research console + Infrastructure header so the report
            sections feel like they're part of the same system, not
            individual one-off cards. */}
        <h3 className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-accent-text/90">
          {heading}
        </h3>
        <div className="leading-relaxed text-text-primary [&_p]:text-text-primary [&_p]:m-0 [&_p]:!text-[17px] [&_p]:!leading-[1.7] [&_li]:!text-[17px] [&_li]:!leading-[1.7] [&_strong]:font-semibold">
          <Markdown content={summary} bodySize="md" />
        </div>
      </div>
    </div>
  );
}
