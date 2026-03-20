/**
 * LLM prompt for topic discovery + narrative generation.
 * The LLM discovers trending sub-topics from raw platform data,
 * then generates video ideas for each.
 */

import type { ComputedAnalytics } from '@/lib/search/analytics-engine';

interface NarrativePromptConfig {
  query: string;
  timeRange: string;
  analytics: ComputedAnalytics;
  platformContext?: string;
  clientName?: string | null;
  clientIndustry?: string | null;
  brandVoice?: string | null;
}

export function buildNarrativePrompt(config: NarrativePromptConfig): string {
  const { query, timeRange, analytics } = config;

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

  const platformDataBlock = config.platformContext
    ? `\n## RAW PLATFORM DATA\n${config.platformContext}\n`
    : '';

  return `You are a short-form video strategist and trend analyst. Analyze the following research data for "${query}" over the ${timeRange}.

Your job is to:
1. Write a 3-5 sentence SUMMARY of the topic landscape.
2. Identify 5-10 specific trending sub-topics from the data below.
3. Generate 3-4 VIDEO IDEAS for each topic.

TOPIC DISCOVERY RULES:
- Identify 5-10 specific trending sub-topics. Topics should be specific angles, ingredients, controversies, techniques, or niches within the search query.
- NEVER use these as topics: format words (shorts, video, content, reels, clip), platform names (tiktok, youtube, reddit, instagram), hashtag noise (fyp, foryou, foryoupage, viral, trending, explore), generic food words that just restate the query, or misspellings/translations of the query itself.
- Example: For 'Avocado Toast', good topics: 'Protein-loaded variations', 'Restaurant price debates', '$20 avocado toast controversy', 'Egg + avo combinations', 'Weight loss claims'. Bad topics: 'Food Shorts', 'Viral Video', 'Fyp Foryou', 'Avokado Tost', 'Toasted Bread', 'Avocadotoast Breakfast'.
- Each topic should represent a distinct, SPECIFIC conversation thread that a content creator can make a video about.
- Base your topics on the actual platform data provided — do not invent topics without evidence.
- Topic names should be 2-5 words, human-readable, and instantly understandable as a content angle.
${clientBlock}
## COMPUTED ANALYTICS

Overall sentiment: ${analytics.overall_sentiment} (${analytics.overall_sentiment > 0.2 ? 'positive' : analytics.overall_sentiment < -0.2 ? 'negative' : 'mixed'})
Conversation intensity: ${analytics.conversation_intensity}
Total sources: ${analytics.platform_breakdown.reduce((s, p) => s + p.post_count, 0)}
Top emotions: ${analytics.emotions.map(e => `${e.emotion} (${e.percentage}%)`).join(', ')}

## KEY PLAYERS
${moversList || 'None detected with enough frequency'}

## CROSS-PLATFORM THEMES
${themesList || 'Not enough cross-platform overlap detected'}
${platformDataBlock}
## OUTPUT FORMAT
Respond in this exact JSON format:

{
  "summary": "3-5 sentence overview referencing specific trends and data points",
  "topics": [
    {
      "name": "Topic Name",
      "why_trending": "1-2 sentences explaining why this is trending right now",
      "platforms_seen": ["reddit", "youtube", "tiktok"],
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
- Identify 5-10 trending sub-topics from the data
- Generate 3-4 video ideas per topic
- All video ideas are for SHORT-FORM VIDEO ONLY (TikTok, Reels, Shorts)
- Each video idea MUST have script_outline (5 bullets) and cta
- Be specific and actionable — a videographer should be able to produce from this
- Reference the actual data and trends — don't make things up
- Each topic must include why_trending and platforms_seen`;
}
