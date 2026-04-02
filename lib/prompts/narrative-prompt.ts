/**
 * LLM prompt for topic discovery + narrative generation.
 * The LLM discovers trending sub-topics from raw platform data,
 * then generates video ideas for each.
 */

import type { ComputedAnalytics } from '@/lib/search/analytics-engine';
import { EXECUTIVE_SUMMARY_CORE } from '@/lib/prompts/executive-summary-instructions';

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
1. Write the executive summary (see block below).
2. Identify **15** specific trending sub-topics from the data below when the evidence supports that many distinct angles (if fewer substantiated angles exist, include every strong angle — do not pad with duplicates).
3. Generate 2-3 VIDEO IDEAS for each topic.

${EXECUTIVE_SUMMARY_CORE}
${config.clientName ? `\nClient context: tailor implications where natural for **${config.clientName}** (${config.clientIndustry ?? 'general'}); the summary is still about the topic landscape, not a sales pitch.\n` : ''}
TOPIC DISCOVERY RULES:
- Identify up to **15** specific trending sub-topics when the data supports them. Topics should be specific angles, ingredients, controversies, techniques, or niches within the search query.
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
  "summary": "Single paragraph per EXECUTIVE SUMMARY block above (Markdown **bold** on 3–6 short phrases only)",
  "synthetic_audiences": {
    "intro": "One optional sentence: how these segments relate to the query (modelled, not survey data)",
    "segments": [
      {
        "name": "Persona-style title (e.g. Calm & inquisitive, Outgoing & warm)",
        "emoji": "One emoji",
        "share_percent": 32,
        "description": "2-4 sentences: motivations, behaviors, and how they engage with this topic — like an ICP narrative",
        "interest_tags": ["Tag one", "Tag two", "Tag three"],
        "ocean": {
          "openness": 0,
          "conscientiousness": 0,
          "extraversion": 0,
          "agreeableness": 0,
          "neuroticism": 0
        },
        "rationale": "One sentence tying this segment to concrete themes or emotions in the data"
      }
    ]
  },
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

SYNTHETIC AUDIENCES (synthetic_audiences):
- Propose 3–5 plausible audience segments (personas) who would care about this topic. Use **persona-style names** that hint at temperament (e.g. "Calm & inquisitive", "Guarded & adventurous") — not generic labels like "Segment A".
- For EACH segment include: emoji, share_percent (sum ≈ 100, ±8), **description** (2–4 sentences: motivations, behaviors, content style — reads like an ICP card), **interest_tags** (4–8 short tags: topics, formats, or angles relevant to messaging), OCEAN scores 0–100, and **rationale** (one sentence tied to themes/emotions in the data).
- OCEAN scores: infer from conversation themes, tone, emotions, and platform mix — **modelled personas for messaging**, not measured demographics. Do not claim survey or census data.
- Neuroticism reflects emotional stability vs. stress reactivity (high = more mood/anxiety sensitivity; low = calmer baseline).

RULES:
- Identify up to **15** trending sub-topics from the data when substantiated; do not pad with duplicates
- Generate 2-3 video ideas per topic
- All video ideas are for SHORT-FORM VIDEO ONLY (TikTok, Reels, Shorts)
- Each video idea MUST have script_outline (5 bullets) and cta
- Be specific and actionable — a videographer should be able to produce from this
- Reference the actual data and trends — don't make things up
- Each topic must include why_trending and platforms_seen`;
}
