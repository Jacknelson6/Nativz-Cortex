'use client';

import { Card, CardTitle } from '@/components/ui/card';
import { TooltipCard } from '@/components/ui/tooltip-card';
import { TOOLTIPS } from '@/lib/tooltips';
import type { EmotionBreakdown } from '@/lib/types/search';

interface EmotionsBreakdownProps {
  emotions: EmotionBreakdown[];
}

// Blue palette that varies by intensity — darkest for highest percentage
const BLUE_SHADES = [
  '#0580f0', // brightest
  '#046bd2',
  '#3b9cf5',
  '#0a5aab',
  '#5bb3fa',
  '#0e4d8f',
  '#7cc4fc',
  '#1a3f6f',
];

export function EmotionsBreakdown({ emotions }: EmotionsBreakdownProps) {
  if (!emotions.length) return null;

  return (
    <Card>
      <CardTitle>Emotions</CardTitle>
      <div className="mt-4 space-y-3">
        {emotions.map((e, i) => {
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
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${e.percentage}%`, backgroundColor: BLUE_SHADES[i % BLUE_SHADES.length] }}
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
