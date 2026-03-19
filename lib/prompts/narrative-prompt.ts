/**
 * Slimmed-down LLM prompt for narrative generation only.
 * All structured data (sentiment, emotions, topics, etc.) is computed in code.
 * The LLM only generates: summary narrative + video ideas per topic.
 */

import type { ComputedAnalytics } from '@/lib/search/analytics-engine';

interface NarrativePromptConfig {
  query: string;
  timeRange: string;
  analytics: ComputedAnalytics;
  clientName?: string | null;
  clientIndustry?: string | null;
  brandVoice?: string | null;
}

export function buildNarrativePrompt(config: NarrativePromptConfig): string {
  const { query, timeRange, analytics } = config;

  // Format topics for the LLM
  const topicsList = analytics.extracted_topics
    .map((t, i) => {
      const platforms = Array.from(t.platforms).join(', ');
      return `${i + 1}. "${t.name}" — mentioned ${t.frequency} times across ${platforms}, sentiment: ${t.avgSentiment > 0.2 ? 'positive' : t.avgSentiment < -0.2 ? 'negative' : 'mixed'}, engagement: ${t.totalEngagement.toLocaleString()}
   Sample titles: ${t.sampleTexts.slice(0, 2).join(' | ')}`;
    })
    .join('\n');

  // Format big movers
  const moversList = analytics.big_movers
    .map((m) => `- ${m.name} (${m.type}): ${m.why}`)
    .join('\n');

  // Format conversation themes
  const themesList = analytics.conversation_themes
    .map((t) => `- "${t.theme}" (${t.platforms.join(', ')}): ${t.representative_quotes[0] ?? 'Cross-platform discussion'}`)
    .join('\n');

  const clientBlock = config.clientName
    ? `\nCLIENT: ${config.clientName} (${config.clientIndustry ?? 'general'}). Brand voice: ${config.brandVoice ?? 'not specified'}. Tailor all video ideas to their brand.\n`
    : '';

  return `You are a short-form video strategist. Analyze the following pre-computed research data and generate:

1. A 3-5 sentence SUMMARY of the topic landscape for "${query}" over the ${timeRange}.
2. For each of the ${analytics.extracted_topics.length} trending sub-topics below, generate 3-4 VIDEO IDEAS.

${clientBlock}
## PRE-COMPUTED DATA

Overall sentiment: ${analytics.overall_sentiment} (${analytics.overall_sentiment > 0.2 ? 'positive' : analytics.overall_sentiment < -0.2 ? 'negative' : 'mixed'})
Conversation intensity: ${analytics.conversation_intensity}
Total sources: ${analytics.platform_breakdown.reduce((s, p) => s + p.post_count, 0)}
Top emotions: ${analytics.emotions.map(e => `${e.emotion} (${e.percentage}%)`).join(', ')}

## TRENDING SUB-TOPICS
${topicsList}

## KEY PLAYERS
${moversList || 'None detected with enough frequency'}

## CROSS-PLATFORM THEMES
${themesList || 'Not enough cross-platform overlap detected'}

## OUTPUT FORMAT
Respond in this exact JSON format. Keep it simple — no nested objects beyond what's shown:

{
  "summary": "3-5 sentence overview referencing specific trends and data points",
  "topics": [
    {
      "name": "Exact topic name from the list above",
      "posts_overview": "2-3 sentences about what people are posting about this",
      "comments_overview": "2-3 sentences about what the comments say",
      "video_ideas": [
        {
          "title": "Compelling short-form video title",
          "hook": "First 3 seconds — what grabs attention",
          "format": "talking_head | tutorial | reaction | street_interview | before_after | myth_bust | pov | storytime | hot_take | listicle",
          "virality": "low | medium | high | viral_potential",
          "why_it_works": "1 sentence",
          "script_outline": ["Hook", "Point 1", "Point 2", "Point 3", "CTA"],
          "cta": "Call to action"
        }
      ]
    }
  ]
}

RULES:
- Generate 3-4 video ideas per topic
- All video ideas are for SHORT-FORM VIDEO ONLY (TikTok, Reels, Shorts)
- Each video idea MUST have script_outline (5 bullets) and cta
- Be specific and actionable — a videographer should be able to produce from this
- Reference the actual data and trends — don't make things up
- Keep "name" EXACTLY as listed in the trending sub-topics above`;
}
