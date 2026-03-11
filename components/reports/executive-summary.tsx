'use client';

import { useState } from 'react';
import { Sparkles, Building2, ChevronDown } from 'lucide-react';

interface ExecutiveSummaryProps {
  summary: string;
  title?: string;
  variant?: 'default' | 'brand';
}

export function ExecutiveSummary({ summary, title, variant = 'default' }: ExecutiveSummaryProps) {
  const [expanded, setExpanded] = useState(false);
  if (!summary) return null;

  const isBrand = variant === 'brand';
  const Icon = isBrand ? Building2 : Sparkles;
  const heading = title || (isBrand ? 'Brand alignment' : 'Executive summary');

  // Show first sentence as the headline, rest is expandable
  const firstBreak = summary.search(/[.!?]\s/);
  const headline = firstBreak > 0 ? summary.slice(0, firstBreak + 1) : summary;
  const rest = firstBreak > 0 ? summary.slice(firstBreak + 2).trim() : '';

  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-surface mt-0.5">
        <Icon size={16} className="text-accent-text" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
          {heading}
        </h3>
        <p className="text-sm leading-relaxed text-text-primary font-medium">
          {headline}
        </p>
        {rest && (
          <>
            {expanded && (
              <p className="text-sm leading-relaxed text-text-secondary mt-1.5">{rest}</p>
            )}
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-1 flex items-center gap-0.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
              {expanded ? 'Show less' : 'Read more'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
