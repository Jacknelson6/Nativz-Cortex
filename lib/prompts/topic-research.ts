import type { SerpData } from '@/lib/serp/types';
import type { ClientPreferences } from '@/lib/types/database';
import type { BrandContext } from '@/lib/knowledge/brand-context';
import { getTimeRangeOptionLabel } from '@/lib/types/search';
import { formatBrandPreferencesBlock, hasPreferences } from './brand-context';
import { EXECUTIVE_SUMMARY_CORE } from '@/lib/prompts/executive-summary-instructions';

interface TopicResearchConfig {
  query: string;
  source: string;
  timeRange: string;
  language: string;
  country: string;
  serpData: SerpData;
  clientContext?: {
    name: string;
    industry: string;
    targetAudience?: string | null;
    brandVoice?: string | null;
    topicKeywords?: string[] | null;
    websiteUrl?: string | null;
  } | null;
  brandPreferences?: ClientPreferences | null;
  clientKnowledgeBlock?: string | null;
  /** Crawled website content (markdown) for brand context */
  websiteContent?: { url: string; content: string }[] | null;
  /** Past research, content logs, strategy — from getClientMemory() */
  clientMemoryBlock?: string | null;
  /** Unified brand context from Brand DNA (takes precedence over clientContext/brandPreferences) */
  brandDNA?: BrandContext | null;
}

function formatSerpDataBlock(serpData: SerpData): string {
  let block = '';

  if (serpData.webResults.length > 0) {
    block += `### Web results (${serpData.webResults.length} results)\n`;
    for (const r of serpData.webResults) {
      block += `- **${r.title}**\n  ${r.url}\n  ${r.description}\n`;
      if (r.snippets && r.snippets.length > 0) {
        block += `  Snippets: ${r.snippets.join(' | ')}\n`;
      }
    }
    block += '\n';
  }

  if (serpData.discussions.length > 0) {
    block += `### Discussions & forums (${serpData.discussions.length} results)\n`;
    for (const d of serpData.discussions) {
      block += `- **${d.title}** (${d.forum}${d.answers ? `, ${d.answers} answers` : ''})\n  ${d.url}\n  ${d.description}\n`;
      if (d.topComment) {
        block += `  Top comment: "${d.topComment}"\n`;
      }
    }
    block += '\n';
  }

  if (serpData.videos.length > 0) {
    block += `### Videos (${serpData.videos.length} results)\n`;
    for (const v of serpData.videos) {
      block += `- **${v.title}** (${v.platform}${v.views ? `, ${v.views} views` : ''}${v.creator ? `, by ${v.creator}` : ''})\n  ${v.url}\n  ${v.description}\n`;
    }
    block += '\n';
  }

  return block;
}

export function buildTopicResearchPrompt(config: TopicResearchConfig): string {
  const timeLabel = getTimeRangeOptionLabel(config.timeRange).toLowerCase();
  const sourceFilter = config.source !== 'all'
    ? `Focus specifically on ${config.source} content.`
    : 'Analyze across all major social platforms (TikTok, Instagram, YouTube, Reddit, X/Twitter).';
  const langFilter = config.language !== 'all'
    ? `Prioritize content in ${config.language}.`
    : '';
  const countryFilter = config.country !== 'all'
    ? `Focus on content from or relevant to ${config.country}.`
    : '';

  // Brand DNA takes precedence over legacy clientContext/brandPreferences
  const brandDNABlock = config.brandDNA
    ? `\n## BRAND DNA\n${config.brandDNA.toPromptBlock()}\n`
    : '';

  const clientBlock = !config.brandDNA && config.clientContext
    ? `
## CLIENT CONTEXT (use to tailor recommendations)
- Brand: ${config.clientContext.name}
- Industry: ${config.clientContext.industry}
- Target audience: ${config.clientContext.targetAudience || 'General'}
- Brand voice: ${config.clientContext.brandVoice || 'Not specified'}${config.clientContext.websiteUrl ? `\n- Website: ${config.clientContext.websiteUrl}` : ''}${config.clientContext.topicKeywords && config.clientContext.topicKeywords.length > 0 ? `\n- Core topics: ${config.clientContext.topicKeywords.join(', ')}` : ''}`
    : '';

  // Build brand preferences block if available (skip if Brand DNA is present — it includes preferences)
  const prefsBlock = !config.brandDNA && hasPreferences(config.brandPreferences) && config.clientContext
    ? '\n' + formatBrandPreferencesBlock(
        config.brandPreferences,
        config.clientContext.name,
        config.clientContext.industry
      ) + '\n'
    : '';

  const knowledgeBlock = config.clientKnowledgeBlock
    ? `\n## CLIENT KNOWLEDGE\n${config.clientKnowledgeBlock}`
    : '';

  // Website content block (from Cloudflare crawl)
  const websiteBlock = config.websiteContent?.length
    ? `\n## CLIENT WEBSITE CONTENT\nThe following was crawled from the client's website. Use it to understand their brand, offerings, and messaging.\n\n${config.websiteContent.map((p) => `### ${p.url}\n${p.content}`).join('\n\n')}\n`
    : '';

  const serpBlock = formatSerpDataBlock(config.serpData);

  return `# TOPIC RESEARCH — SHORT-FORM VIDEO IDEATION

## ROLE
You are an expert short-form video strategist specializing in TikTok, Instagram Reels, YouTube Shorts, and Facebook Reels. You have been given real search data gathered from the web about a topic. Your task is to analyze this data, identify trends and engagement patterns, then generate actionable short-form video ideas that a videographer can take straight to set.

## RESEARCH TOPIC
"${config.query}"

## SEARCH PARAMETERS
- Time range: ${timeLabel}
- ${sourceFilter}
${langFilter ? `- ${langFilter}` : ''}
${countryFilter ? `- ${countryFilter}` : ''}
${brandDNABlock}${clientBlock}
${prefsBlock}${knowledgeBlock}${websiteBlock}${config.clientMemoryBlock ? `\n## CLIENT CONTENT HISTORY\nUse the following history to avoid repeating past research and to build on what has worked.\n\n${config.clientMemoryBlock}\n` : ''}
## REAL SEARCH DATA
The following data was gathered from live web searches and social platforms. Use it as the basis for your analysis. Do NOT make up information — base all insights on this data.

<research_data>
${serpBlock}
</research_data>

## WHAT TO ANALYZE
Based on the search data above:
1. **Overall sentiment** — What is the overall sentiment of the conversation? Rate it from -1.0 (very negative) to 1.0 (very positive).
2. **Conversation intensity** — How much are people talking about this? Rate as low, moderate, high, or very_high.
3. **Emotions** — What do people feel about this topic? Map the full emotional spectrum.
4. **Content that works** — What formats, angles, and hooks get the most engagement?
5. **Trending sub-topics** — What specific angles or sub-topics within this broader topic are trending? For each, cite 2-5 real sources from the search data above.
6. **Video opportunities** — For each trending sub-topic, what specific video ideas would perform well?

${EXECUTIVE_SUMMARY_CORE}

## OUTPUT FORMAT
Respond ONLY in valid JSON matching this exact schema. No text outside the JSON object.

{
  "summary": "Single paragraph per executive summary rules above (Markdown **bold** on 3–6 short phrases only)",

  "overall_sentiment": 0.0,

  "conversation_intensity": "moderate",

  "emotions": [
    {
      "emotion": "Curiosity",
      "percentage": 0,
      "color": "#6366F1"
    }
  ],

  "content_breakdown": {
    "intentions": [
      { "name": "To learn something new", "percentage": 0, "engagement_rate": 0.0 }
    ],
    "categories": [
      { "name": "How-to", "percentage": 0, "engagement_rate": 0.0 }
    ],
    "formats": [
      { "name": "Short-form video", "percentage": 0, "engagement_rate": 0.0 }
    ]
  },

  "big_movers": [
    {
      "name": "Specific real name — for brands use the company name, for creators use their actual handle/name (e.g. '@dermdoctor', 'Hyram Yarbro') NOT generic labels like 'TikTok Skinfluencers'",
      "type": "brand | creator | product | company",
      "url": "Website URL for brands/companies (e.g. https://example.com), or social profile URL for creators (e.g. https://tiktok.com/@handle). Use the real URL from search data when available. null if unknown.",
      "why": "1 sentence — why they're dominating the conversation right now",
      "tactics": [
        "Specific tactic or strategy they're using (bulleted, 3-5 items)"
      ],
      "takeaway": "1 sentence — how to replicate or learn from their approach"
    }
  ],

  "platform_breakdown": [
    {
      "platform": "reddit | youtube | tiktok | web",
      "post_count": 0,
      "comment_count": 0,
      "avg_sentiment": 0.0,
      "top_subreddits": ["subreddit1", "subreddit2"]
    }
  ],

  "conversation_themes": [
    {
      "theme": "A recurring conversation thread across platforms",
      "post_count": 0,
      "sentiment": 0.0,
      "platforms": ["reddit", "web"],
      "representative_quotes": ["Actual quote from the data", "Another real quote"]
    }
  ],

  "trending_topics": [
    {
      "name": "Specific sub-topic or angle",
      "resonance": "high",
      "sentiment": 0.0,
      "posts_overview": "2-3 sentences summarizing the types of posts about this sub-topic, with specific examples or quotes from real posts found in the search data",
      "comments_overview": "2-3 sentences summarizing the discussion and reactions in comments, with specific examples of what people are saying",
      "sources": [
        {
          "url": "EXACT_URL_FROM_SEARCH_DATA",
          "title": "Title of the source",
          "type": "web | discussion | video",
          "relevance": "Brief note on why this source is relevant to this sub-topic",
          "platform": "reddit | youtube | tiktok | web"
        }
      ],
      "video_ideas": [
        {
          "title": "Compelling video title that would work as a TikTok/Reel caption",
          "hook": "The first 3 seconds — what grabs attention immediately",
          "format": "talking_head | tutorial | reaction | street_interview | before_after | myth_bust | day_in_the_life | ugc_style | pov | storytime | hot_take | listicle",
          "virality": "low | medium | high | viral_potential",
          "why_it_works": "1-2 sentences explaining why this performs well on short-form platforms",
          "script_outline": [
            "Hook / opening line (first 1-3 seconds)",
            "Key point 1",
            "Key point 2",
            "Key point 3",
            "CTA / closing"
          ],
          "cta": "Suggested call-to-action (e.g. 'Follow for more', 'Save this for later', 'Drop your take in the comments')"
        }
      ]
    }
  ]
}

## IMPORTANT GUIDELINES
- If <platform_data> is present, include "platform_breakdown" with one entry per platform found in the data. Include top_subreddits for Reddit data, top_channels for YouTube, top_hashtags for TikTok. Omit the field entirely if only web data exists.
- If <platform_data> is present, include "conversation_themes" — 3-5 recurring threads that appear across multiple sources. Each must have real "representative_quotes" from the actual data. Omit if only web data.
- When generating video ideas, reference actual high-performing content from the platform data. If Reddit posts show high engagement on a topic, the video idea should address that proven interest.
- Include 3-5 big_movers — the brands, creators, companies, or products generating the most conversation in this space. For each, explain WHY they're making noise, list 3-5 specific tactics they use, and give a 1-sentence takeaway on how to replicate their success. Base this on the search data — who appears most frequently? Who gets the most engagement?
- Include 5-8 emotions that sum to approximately 100%
- Include 3-5 items each for intentions (viewer motivations — why people watch, e.g. "To learn something new", "For entertainment", "To stay informed", "To feel inspired"), categories, and formats
- For content_breakdown.categories: each "name" must be short and scannable (2–6 words), e.g. "How-to & checklists", "Explainers", "News & commentary". Do not pack definitions into the name — use a simple label only
- Generate **15** trending_topics when the search data supports that many distinct angles; each with 2-4 video_ideas. If the data supports fewer distinct angles, include all substantiated topics — do not invent filler to reach 15.
- Each trending_topic MUST have 2-5 items in its "sources" array
- **Do NOT invent URLs.** Every URL in sources must be copied exactly from the search data above. If you cannot find a relevant URL, do not include a source entry for it.
- Reference specific articles, posts, or discussions from the search data in your posts_overview and comments_overview
- Emotion colors should be distinct hex values (use: #6366F1 indigo, #10B981 emerald, #F59E0B amber, #EF4444 red, #8B5CF6 purple, #3B82F6 blue, #EC4899 pink, #14B8A6 teal)
- Resonance values: "low", "medium", "high", or "viral"
- Sentiment scores range from -1.0 (very negative) to 1.0 (very positive). IMPORTANT: Be realistic — NOT every topic is positive. Use the FULL range: negative topics (complaints, frustrations, risks) should be -0.3 to -1.0, neutral/mixed topics should be -0.2 to 0.2, and only genuinely positive topics should be above 0.3. Across ~15 topics, include a mix of positive, neutral, and negative sentiments.
- overall_sentiment: a single number from -1.0 to 1.0 representing the overall sentiment across all search data
- conversation_intensity: "low", "moderate", "high", or "very_high" based on volume and engagement in the search data
- All video ideas are for SHORT-FORM VIDEO ONLY (TikTok, Instagram Reels, YouTube Shorts, Facebook Reels). No long-form video, no blog posts, no articles, no written content.
- Each video idea MUST include "script_outline" (3-5 bullet talking points) and "cta" (call-to-action)
- All video ideas should be specific and actionable — ready to produce on set
- engagement_rate: typical engagement for that bucket as **percentage points** (0.7 means 0.7%, not 70% and not a 0–1 fraction)${hasPreferences(config.brandPreferences) ? `
- CRITICAL: No markdown formatting inside JSON strings. Do NOT use **bold**, *italic*, or 'code' markers anywhere in the JSON values. Plain text only.
- BRAND PREFERENCES ARE HARD CONSTRAINTS: If <brand_context> is present above, you MUST follow it. Topics listed under "avoid" must NOT appear in any trending topic or video idea. Topics listed under "lean into" should be prioritized. Tone keywords must influence the style of all video titles and hooks. Seasonal priorities should be weighted if relevant to the current date.` : ''}`;
}
