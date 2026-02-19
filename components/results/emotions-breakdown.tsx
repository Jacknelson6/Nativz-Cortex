'use client';

import { Card, CardTitle } from '@/components/ui/card';
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
        {emotions.map((e) => (
          <div key={e.emotion} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-sm text-gray-600">{e.emotion}</span>
            <div className="flex-1 h-6 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${e.percentage}%`, backgroundColor: e.color }}
              />
            </div>
            <span className="w-12 text-right text-sm font-medium text-gray-700">{e.percentage}%</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
