'use client';

import { Markdown } from '@/components/ai/markdown';

interface ExecutiveSummaryProps {
  summary: string;
  title?: string;
  variant?: 'default' | 'brand';
}

export function ExecutiveSummary({ summary, title, variant = 'default' }: ExecutiveSummaryProps) {
  if (!summary) return null;

  const isBrand = variant === 'brand';
  const heading = title || (isBrand ? 'Brand alignment' : 'Executive summary');

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-4 border-b border-nativz-border/60 pb-4">
        <h4 className="text-lg font-semibold tracking-tight text-text-primary">
          {heading}
        </h4>
      </div>
      <div className="leading-relaxed text-text-primary [&_p]:text-text-primary [&_p]:m-0 [&_p]:!text-[17px] [&_p]:!leading-[1.7] [&_li]:!text-[17px] [&_li]:!leading-[1.7] [&_strong]:font-semibold">
        <Markdown content={summary} bodySize="md" />
      </div>
    </div>
  );
}
