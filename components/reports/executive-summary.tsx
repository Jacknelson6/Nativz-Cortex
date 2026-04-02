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
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-surface mt-0.5">
        <Icon size={18} className="text-accent-text" />
      </div>
      <div className="min-w-0 flex-1 max-w-4xl">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-2.5">
          {heading}
        </h3>
        <div className="leading-relaxed text-text-primary [&_p]:text-text-primary [&_p]:m-0 [&_strong]:font-semibold">
          <Markdown content={summary} bodySize="md" />
        </div>
      </div>
    </div>
  );
}
