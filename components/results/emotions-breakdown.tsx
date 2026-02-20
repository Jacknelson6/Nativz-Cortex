'use client';

import { Card, CardTitle } from '@/components/ui/card';
import { TooltipCard } from '@/components/ui/tooltip-card';
import { TOOLTIPS } from '@/lib/tooltips';
import type { EmotionBreakdown } from '@/lib/types/search';

interface EmotionsBreakdownProps {
  emotions: EmotionBreakdown[];
}

export function EmotionsBreakdown({ emotions }: EmotionsBreakdownProps) {
  if (!emotions.length) return null;

  return (
    <Card>
      <CardTitle>Emotions</CardTitle>
      <div className="mt-4 space-y-3">
        {emotions.map((e) => {
          const key = e.emotion.toLowerCase();
          const tooltip = TOOLTIPS[key];
          return (
            <div key={e.emotion} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-sm text-text-secondary">
                {tooltip ? (
                  <TooltipCard title={tooltip.title} description={tooltip.description}>
                    {e.emotion}
                  </TooltipCard>
                ) : (
                  e.emotion
                )}
              </span>
              <div className="flex-1 h-6 rounded-full bg-surface-hover overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
                  style={{ width: `${e.percentage}%` }}
                />
              </div>
              <span className="w-12 text-right text-sm font-medium text-text-secondary">{e.percentage}%</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
