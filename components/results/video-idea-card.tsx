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

export function VideoIdeaCard({ idea }: VideoIdeaCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 transition-all duration-200 hover:shadow-sm hover:border-indigo-200">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-start gap-2">
          <Lightbulb size={14} className="mt-0.5 text-amber-500 shrink-0" />
          <h5 className="text-sm font-medium text-gray-900 leading-snug">{idea.title}</h5>
        </div>
        <Badge variant={VIRALITY_VARIANT[idea.virality] || 'default'} className="shrink-0">
          {idea.virality.replace('_', ' ')}
        </Badge>
      </div>

      <div className="ml-6">
        <div className="flex items-start gap-1.5 mb-2">
          <Zap size={11} className="mt-0.5 text-indigo-400 shrink-0" />
          <p className="text-xs text-indigo-600 font-medium">{idea.hook}</p>
        </div>

        <p className="text-xs text-gray-500 leading-relaxed mb-2">{idea.why_it_works}</p>

        <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          {idea.format.replace(/_/g, ' ')}
        </span>
      </div>
    </div>
  );
}
