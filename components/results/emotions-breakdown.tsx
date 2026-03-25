'use client';

import { useCallback, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TooltipCard } from '@/components/ui/tooltip-card';
import { TOOLTIPS } from '@/lib/tooltips';
import type { EmotionBreakdown } from '@/lib/types/search';
import { EmotionExplainFollower, type FollowState } from '@/components/results/emotion-explain-follower';

interface EmotionsBreakdownProps {
  emotions: EmotionBreakdown[];
  /** When set, each row can request an AI explanation (admin / portal). */
  searchId?: string;
  /** When set (shared report), explanations use the public token route. */
  shareToken?: string;
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
  neutral: '😐',
};

function getEmoji(emotion: string): string {
  return EMOTION_EMOJI[emotion.toLowerCase()] ?? '💬';
}

export function EmotionsBreakdown({ emotions, searchId, shareToken }: EmotionsBreakdownProps) {
  const canExplain = Boolean(searchId || shareToken);
  const [followOpen, setFollowOpen] = useState(false);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [followState, setFollowState] = useState<FollowState | null>(null);

  const closeFollower = useCallback(() => {
    setFollowOpen(false);
    setFollowState(null);
  }, []);

  const explainEmotion = useCallback(
    async (emotionLabel: string, clientX: number, clientY: number) => {
      setCursor({ x: clientX, y: clientY });
      setFollowOpen(true);
      setFollowState({ kind: 'loading', emotion: emotionLabel });

      const url = shareToken
        ? `/api/shared/search/${encodeURIComponent(shareToken)}/explain-emotion`
        : `/api/search/${encodeURIComponent(searchId!)}/explain-emotion`;

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emotion: emotionLabel }),
        });
        const data = (await res.json()) as { explanation?: string; error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Request failed');
        }
        if (!data.explanation?.trim()) {
          throw new Error('No explanation returned');
        }
        setFollowState({ kind: 'done', emotion: emotionLabel, text: data.explanation.trim() });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Something went wrong';
        setFollowState({ kind: 'error', message: msg });
      }
    },
    [searchId, shareToken],
  );

  if (!emotions.length) return null;

  return (
    <>
      <Card>
        <div className="flex items-start justify-between gap-2">
          <CardTitle>Emotions</CardTitle>
          {canExplain ? (
            <TooltipCard
              title="Explain"
              description="Hover a row and choose Explain to see why that emotion shows up in this research. The note follows your cursor; press Escape or close to dismiss."
            >
              <span className="text-xs text-text-muted">How it works</span>
            </TooltipCard>
          ) : null}
        </div>
        <div className="mt-4 space-y-3">
          {emotions.map((e) => {
            const key = e.emotion.toLowerCase();
            const tooltip = TOOLTIPS[key];
            const emoji = getEmoji(e.emotion);
            return (
              <div key={e.emotion} className="group relative">
                <div className="flex items-baseline justify-between gap-2 mb-1.5">
                  <span className="text-sm text-text-secondary flex items-center gap-1.5 min-w-0">
                    <span className="text-base leading-none shrink-0">{emoji}</span>
                    {tooltip ? (
                      <TooltipCard title={tooltip.title} description={tooltip.description}>
                        {e.emotion}
                      </TooltipCard>
                    ) : (
                      e.emotion
                    )}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    {canExplain ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-[11px] font-medium opacity-100 sm:opacity-0 sm:pointer-events-none sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto"
                        aria-label={`Explain why ${e.emotion} appears in this research`}
                        onClick={(ev) => {
                          void explainEmotion(e.emotion, ev.clientX, ev.clientY);
                        }}
                      >
                        <Sparkles size={12} className="text-accent-text" aria-hidden />
                        Explain
                      </Button>
                    ) : null}
                    <span className="text-xs font-medium text-text-muted tabular-nums">{e.percentage}%</span>
                  </div>
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

      {canExplain ? (
        <EmotionExplainFollower
          open={followOpen}
          cursor={cursor}
          state={followState}
          onClose={closeFollower}
        />
      ) : null}
    </>
  );
}
