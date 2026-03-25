import { createCompletion } from '@/lib/ai/client';
import type { EmotionBreakdown, TopicSearchAIResponse } from '@/lib/types/search';

export function findEmotionInList(emotions: EmotionBreakdown[], label: string): EmotionBreakdown | null {
  const want = label.trim().toLowerCase();
  return emotions.find((e) => e.emotion.toLowerCase() === want) ?? null;
}

export function buildEmotionExplainPrompt(args: {
  query: string;
  summary: string;
  emotion: EmotionBreakdown;
  allEmotions: EmotionBreakdown[];
  trendingTopicNames: string[];
  themeLabels: string[];
  overallSentiment: number | null;
}): string {
  const dist = args.allEmotions
    .map((e) => `${e.emotion} (${e.percentage}%)`)
    .join(', ');
  const themes =
    args.themeLabels.length > 0 ? args.themeLabels.map((t) => `- ${t}`).join('\n') : 'None listed.';
  const topics =
    args.trendingTopicNames.length > 0
      ? args.trendingTopicNames.map((t) => `- ${t}`).join('\n')
      : 'None listed.';
  const sent =
    args.overallSentiment === null || args.overallSentiment === undefined
      ? 'Not available.'
      : `${args.overallSentiment.toFixed(2)} (roughly −1 to +1)`;

  return `You are analyzing audience research for a marketing agency. The team sees emotion labels that were **inferred from text** in posts and comments — not from a formal survey.

## Topic query
"${args.query}"

## Research summary (may be truncated)
${args.summary.slice(0, 2000)}

## Overall sentiment (model estimate)
${sent}

## Full emotion distribution (percentages are relative within this research)
${dist}

## Focus emotion
The user selected: **${args.emotion.emotion}** at **${args.emotion.percentage}%** of the emotion mix.

## Conversation themes (if any)
${themes}

## Trending subtopics (if any)
${topics}

## Your task
Write **2–4 short paragraphs** in plain language (sentence case, no markdown headings, no bullet lists unless essential).

Explain **why** this specific emotion would show up at this level for this topic — plausible social, psychological, and platform dynamics (what people are reacting to, stakes, identity, controversy, humor, fear, etc.). 

Rules:
- Ground the explanation in the summary and themes when possible; if data is thin, say what is *likely* and avoid fake precision.
- Do not claim census, clinical diagnosis, or verified demographics.
- Do not just repeat the percentages.
- Be concise and useful for a strategist writing messaging.`;
}

export async function generateEmotionExplanation(args: {
  query: string;
  summary: string;
  emotion: EmotionBreakdown;
  allEmotions: EmotionBreakdown[];
  trendingTopicNames: string[];
  themeLabels: string[];
  overallSentiment: number | null;
  userId?: string;
  userEmail?: string;
}): Promise<string> {
  const prompt = buildEmotionExplainPrompt(args);
  const result = await createCompletion({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 900,
    feature: 'emotion_explain',
    userId: args.userId,
    userEmail: args.userEmail,
  });
  return result.text.trim();
}

export function extractExplainContext(raw: unknown): {
  trendingTopicNames: string[];
  themeLabels: string[];
  overallSentiment: number | null;
} {
  const ai = raw as TopicSearchAIResponse | null;
  if (!ai) {
    return { trendingTopicNames: [], themeLabels: [], overallSentiment: null };
  }
  const trendingTopicNames = (ai.trending_topics ?? [])
    .map((t) => (typeof t.name === 'string' ? t.name : ''))
    .filter(Boolean)
    .slice(0, 12);
  const themeLabels = (ai.conversation_themes ?? [])
    .map((t) => (typeof t.theme === 'string' ? t.theme : ''))
    .filter(Boolean)
    .slice(0, 12);
  const overallSentiment =
    typeof ai.overall_sentiment === 'number' && Number.isFinite(ai.overall_sentiment)
      ? ai.overall_sentiment
      : null;
  return { trendingTopicNames, themeLabels, overallSentiment };
}
