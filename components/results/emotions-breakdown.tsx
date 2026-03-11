'use client';

import { Card, CardTitle } from '@/components/ui/card';
import { TooltipCard } from '@/components/ui/tooltip-card';
import { TOOLTIPS } from '@/lib/tooltips';
import type { EmotionBreakdown } from '@/lib/types/search';

interface EmotionsBreakdownProps {
  emotions: EmotionBreakdown[];
}

const EMOTION_EMOJI: Record<string, string> = {
  curiosity: '🧐',
  excitement: '🔥',
  frustration: '😤',
  anger: '😡',
  hope: '🌟',
  hopefulness: '🌟',
  fear: '😨',
  joy: '😄',
  sadness: '😢',
  surprise: '😲',
  trust: '🤝',
  disgust: '🤢',
  anticipation: '👀',
  amusement: '😂',
  overwhelm: '😵',
  confusion: '😕',
  nostalgia: '💭',
  pride: '😌',
  skepticism: '🤔',
  uncertainty: '🤷',
  resourcefulness: '💡',
  inspiration: '✨',
  admiration: '🤩',
  empathy: '💛',
  relief: '😎',
  anxiety: '😰',
  determination: '💪',
  gratitude: '🙏',
  envy: '🟢',
  boredom: '🥱',
  guilt: '😔',
  love: '❤️',
  optimism: '☀️',
  pessimism: '🌧️',
  contentment: '😊',
  concern: '😟',
  defiance: '✊',
  caution: '⚠️',
  solidarity: '🫱🏽‍🫲🏻',
  vulnerability: '🥺',
  protectiveness: '🛡️',
  playfulness: '😜',
  longing: '🥹',
  disapproval: '👎',
  approval: '👍',
  interest: '🔍',
  desire: '🤤',
  acceptance: '🤗',
  resignation: '😮‍💨',
  passion: '❤️‍🔥',
  wonderment: '🤯',
  wonder: '🤯',
};

function getEmoji(emotion: string): string {
  return EMOTION_EMOJI[emotion.toLowerCase()] ?? '💬';
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
          const emoji = getEmoji(e.emotion);
          return (
            <div key={e.emotion}>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-sm text-text-secondary flex items-center gap-1.5">
                  <span className="text-base leading-none">{emoji}</span>
                  {tooltip ? (
                    <TooltipCard title={tooltip.title} description={tooltip.description}>
                      {e.emotion}
                    </TooltipCard>
                  ) : (
                    e.emotion
                  )}
                </span>
                <span className="text-xs font-medium text-text-muted tabular-nums">{e.percentage}%</span>
              </div>
              <div className="h-2 rounded-full bg-surface-hover overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
                  style={{ width: `${e.percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
