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

const EMOTION_SUBTEXT: Record<string, string> = {
  curiosity: 'People are actively seeking answers. Content that educates or reveals something new will resonate.',
  excitement: 'High energy around this topic. Bold, action-driven content captures attention.',
  frustration: 'Pain points are driving the conversation. Content that offers solutions stands out.',
  anger: 'Strong negative reactions signal a controversial or polarizing angle worth addressing head-on.',
  hope: 'Audiences believe in positive outcomes. Aspirational content performs well here.',
  hopefulness: 'Audiences believe in positive outcomes. Aspirational content performs well here.',
  fear: 'Uncertainty is driving engagement. Reassuring, authoritative content builds trust.',
  joy: 'Positive sentiment is high. Celebratory or success-story content will be well received.',
  sadness: 'Empathy-driven engagement. Authentic, vulnerable content connects deeply.',
  surprise: 'Unexpected angles are getting traction. Contrarian or reveal-style content works.',
  trust: 'Credibility matters here. Backed-by-data and expert-led content wins.',
  disgust: 'Strong aversion to the status quo. Expose-style content has viral potential.',
  anticipation: 'Audiences are waiting for what comes next. Tease and build-up content performs well.',
  amusement: 'Entertainment value is high. Humor and relatable moments drive shares.',
  overwhelm: 'Information overload is real. Simplified, step-by-step content cuts through.',
  confusion: 'Clarity is in demand. Explainer-style content fills a gap.',
  nostalgia: 'Audiences connect with the past. Before-and-after or throwback content resonates.',
  pride: 'Achievement and identity drive engagement. Showcase wins and milestones.',
  skepticism: 'People doubt claims in this space. Proof-driven, transparent content earns respect.',
  uncertainty: 'Indecision creates opportunity. Decision-framework content helps audiences act.',
  resourcefulness: 'DIY energy is strong. How-to and hack-style content gets saved and shared.',
  inspiration: 'Aspirational content lands here. Transformation stories and vision-casting work.',
  admiration: 'People look up to leaders in this space. Authority-building content is effective.',
  empathy: 'Emotional connection drives engagement. Story-driven, human-centered content wins.',
  relief: 'Audiences found answers. Solution-reveal and myth-busting content performs.',
  anxiety: 'Worry fuels the conversation. Calming, practical advice builds loyalty.',
  determination: 'Audiences are action-oriented. Motivational and roadmap content drives engagement.',
  gratitude: 'Positive community sentiment. Appreciation and value-driven content connects.',
  envy: 'Aspiration mixed with comparison. Lifestyle and results-focused content gets clicks.',
  boredom: 'Audiences crave novelty. Fresh angles and unexpected formats break through.',
  love: 'Deep affinity for this topic. Passion-driven, community content thrives.',
  optimism: 'Forward-looking sentiment is strong. Vision and opportunity content performs.',
  pessimism: 'Negative outlook creates space for contrarian, silver-lining content.',
  contentment: 'Satisfied audiences want to maintain momentum. Sustaining-success content works.',
  concern: 'Measured worry signals a need for balanced, risk-aware content.',
  defiance: 'Counter-culture energy is high. Challenger-brand positioning resonates.',
  caution: 'Audiences are risk-aware. Balanced, well-researched content builds credibility.',
  solidarity: 'Community bonds are strong. Unifying and we-are-in-this-together content lands.',
  vulnerability: 'Authenticity is valued. Raw, honest content builds deep connection.',
  protectiveness: 'Audiences want to safeguard what matters. Educational content about risk mitigation works.',
  playfulness: 'Light-hearted energy. Fun, experimental content gets engagement.',
  longing: 'Audiences desire what they don\'t yet have. Aspirational and future-state content resonates.',
  disapproval: 'Audiences reject current approaches. Alternatives and improvement content gains traction.',
  approval: 'Positive validation signals. Content that reinforces good practices performs.',
  interest: 'Active engagement with the topic. Series-style short-form content keeps audiences coming back.',
  desire: 'Want-driven engagement. Product-focused and outcome-based content converts.',
  acceptance: 'Audiences are open and receptive. New ideas and perspectives are welcomed.',
  resignation: 'Fatigue is setting in. Fresh perspective or paradigm-shift content breaks through.',
  passion: 'Intense enthusiasm drives sharing. Bold, opinionated content thrives.',
  wonderment: 'Awe-driven engagement. Mind-blowing facts and reveals go viral.',
  wonder: 'Awe-driven engagement. Mind-blowing facts and reveals go viral.',
  neutral: 'Balanced sentiment. Informative, straightforward content serves this audience.',
};

function getEmoji(emotion: string): string {
  return EMOTION_EMOJI[emotion.toLowerCase()] ?? '💬';
}

function getSubtext(emotion: string): string | undefined {
  return EMOTION_SUBTEXT[emotion.toLowerCase()];
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
            const subtext = getSubtext(e.emotion);
            return (
              <div key={e.emotion} className="group relative">
                <div className="flex items-baseline justify-between gap-2 mb-1">
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
                {subtext ? (
                  <p className="text-[11px] leading-snug text-text-muted/70 mb-1.5 pl-7">{subtext}</p>
                ) : null}
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
