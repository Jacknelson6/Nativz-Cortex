'use client';

import { Card, CardTitle } from '@/components/ui/card';
import { TooltipCard } from '@/components/ui/tooltip-card';
import type { EmotionBreakdown } from '@/lib/types/search';

interface EmotionsBreakdownProps {
  emotions: EmotionBreakdown[];
}

const EMOTION_EMOJI: Record<string, string> = {
  curiosity: '🧐',
  /** Keyword analytics (`analytics-engine`) */
  humor: '😂',
  fomo: '⏳',
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
  delight: '😊',
  motivation: '🎯',
  'troubleshooting focus': '🔧',
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
  humor: 'Comedy and levity carry the feed. Witty, meme-friendly, and punchy short-form content earns shares.',
  fomo: 'Scarcity and urgency show up in language. Time-bound angles, social proof, and “don’t miss this” hooks convert.',
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
  guilt: 'Self-blame or regret shows up in the tone. Supportive framing, permission-giving, and relief-focused angles land better than shame.',
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
  delight:
    'Audiences respond to positive surprises and wins. Content that celebrates outcomes and small joys creates shareable moments.',
  motivation:
    'People want to move forward. Goal-oriented content, clear next steps, and transformation stories perform well.',
  'troubleshooting focus':
    'Problem-solving energy is high. Practical fixes, how-tos, and step-by-step troubleshooting content earns saves and trust.',
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

/** When the model returns a label we have not mapped yet. */
function fallbackSubtext(emotion: string): string {
  const label = emotion.trim() || 'This';
  return `${label} is showing up as a distinct emotional signal. Mirror this tone in hooks, pacing, and proof so content feels native to the conversation.`;
}

function getEmoji(emotion: string): string {
  return EMOTION_EMOJI[emotion.toLowerCase().trim()] ?? '💬';
}

function getSubtext(emotion: string): string {
  const key = emotion.toLowerCase().trim();
  return EMOTION_SUBTEXT[key] ?? fallbackSubtext(emotion);
}

export function EmotionsBreakdown({ emotions }: EmotionsBreakdownProps) {
  if (!emotions.length) return null;

  return (
    <Card>
      <CardTitle className="text-2xl">Emotions</CardTitle>
      <div className="mt-5 space-y-3.5">
        {emotions.map((e) => {
          const emoji = getEmoji(e.emotion);
          const tooltip = e.subtext?.trim() || getSubtext(e.emotion);
          return (
            <div key={e.emotion} className="relative">
              <div className="mb-1 flex items-center justify-between gap-3">
                <TooltipCard title={e.emotion} description={tooltip}>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-primary">
                    <span className="shrink-0 text-sm leading-none" aria-hidden>
                      {emoji}
                    </span>
                    <span className="truncate font-medium text-text-secondary">{e.emotion}</span>
                  </span>
                </TooltipCard>
                <span className="shrink-0 text-xs tabular-nums text-text-muted">
                  {e.percentage}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-hover">
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
