'use client';

import { Lightbulb, Zap } from 'lucide-react';
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

export function VideoIdeaCard({ idea }: VideoIdeaCardProps) {
  const borderClass = VIRALITY_BORDER[idea.virality] || 'border-l-transparent';
  return (
    <div className={`rounded-lg border border-nativz-border border-l-[3px] ${borderClass} bg-surface p-4 transition-all duration-200 hover:shadow-card-hover hover:border-accent/40`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-start gap-2">
          <Lightbulb size={14} className="mt-0.5 text-amber-400 shrink-0" />
          <h5 className="text-sm font-medium text-text-primary leading-snug">{idea.title}</h5>
        </div>
        <Badge variant={VIRALITY_VARIANT[idea.virality] || 'default'} className="shrink-0">
          {idea.virality.replace('_', ' ')}
        </Badge>
      </div>

      <div className="ml-6">
        <div className="flex items-start gap-1.5 mb-2">
          <Zap size={11} className="mt-0.5 text-accent-text shrink-0" />
          <p className="text-xs text-accent-text font-medium">{idea.hook}</p>
        </div>

        <p className="text-xs text-text-muted leading-relaxed mb-2">{idea.why_it_works}</p>

        <span className="inline-flex items-center rounded-md bg-surface-hover px-2 py-0.5 text-xs text-text-muted">
          {idea.format.replace(/_/g, ' ')}
        </span>
      </div>
    </div>
  );
}
