'use client';

import { useState } from 'react';
import { Lightbulb, Zap, Copy, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { VideoIdea } from '@/lib/types/search';

interface VideoIdeaCardProps {
  idea: VideoIdea;
}

const VIRALITY_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'> = {
  low: 'default',
  medium: 'info',
  high: 'success',
  viral_potential: 'purple',
};

const VIRALITY_BORDER: Record<string, string> = {
  viral_potential: 'border-l-purple-500',
  high: 'border-l-blue-500',
};

function formatIdeaForClipboard(idea: VideoIdea): string {
  return [
    idea.title,
    '',
    `Hook: ${idea.hook}`,
    `Format: ${idea.format.replace(/_/g, ' ')}`,
    `Virality: ${idea.virality.replace('_', ' ')}`,
    '',
    `Why it works: ${idea.why_it_works}`,
  ].join('\n');
}

export function VideoIdeaCard({ idea }: VideoIdeaCardProps) {
  const [copied, setCopied] = useState(false);
  const borderClass = VIRALITY_BORDER[idea.virality] || 'border-l-transparent';

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(formatIdeaForClipboard(idea));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }

  return (
    <div className={`group rounded-lg border border-nativz-border border-l-[3px] ${borderClass} bg-surface p-4 transition-all duration-200 hover:shadow-card-hover hover:border-accent/40`}>
      {/* Title row with virality badge and copy button */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-start gap-2 min-w-0">
          <Lightbulb size={14} className="mt-0.5 text-amber-400 shrink-0" />
          <h5 className="text-sm font-medium text-text-primary leading-snug">{idea.title}</h5>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleCopy}
            className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted opacity-0 transition-all hover:bg-surface-hover hover:text-text-primary group-hover:opacity-100"
            title="Copy idea"
          >
            {copied ? <Check size={12} className="text-accent" /> : <Copy size={12} />}
          </button>
          <Badge variant={VIRALITY_VARIANT[idea.virality] || 'default'}>
            {idea.virality.replace('_', ' ')}
          </Badge>
        </div>
      </div>

      {/* Hook — the most actionable piece */}
      <div className="ml-6">
        <div className="flex items-start gap-1.5 mb-2">
          <Zap size={11} className="mt-0.5 text-accent-text shrink-0" />
          <p className="text-xs text-accent-text font-medium">&ldquo;{idea.hook}&rdquo;</p>
        </div>

        {/* Why it works */}
        <p className="text-xs text-text-secondary leading-relaxed mb-2">{idea.why_it_works}</p>

        {/* Format tag */}
        <span className="inline-flex items-center rounded-md bg-surface-hover px-2 py-0.5 text-xs text-text-muted">
          {idea.format.replace(/_/g, ' ')}
        </span>
      </div>
    </div>
  );
}
