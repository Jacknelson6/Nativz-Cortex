import type { BraveSerpData } from '@/lib/brave/types';
import type { ClientPreferences } from '@/lib/types/database';
import type { BrandContext } from '@/lib/knowledge/brand-context';
import { formatBrandPreferencesBlock, hasPreferences } from './brand-context';
import { EXECUTIVE_SUMMARY_CORE, executiveSummaryClientLens } from '@/lib/prompts/executive-summary-instructions';

interface ClientStrategyConfig {
  query: string;
  source: string;
  timeRange: string;
  language: string;
  country: string;
  serpData: BraveSerpData;
  clientContext: {
    name: string;
    industry: string;
    targetAudience?: string | null;
    brandVoice?: string | null;
    topicKeywords?: string[] | null;
    websiteUrl?: string | null;
  };
  brandPreferences?: ClientPreferences | null;
  /** Crawled website content (markdown) for brand context */
  websiteContent?: { url: string; content: string }[] | null;
  /** Past research, content logs, strategy — from getClientMemory() */
  clientMemoryBlock?: string | null;
  /** Structured knowledge base context (brand profile, entities, meetings) */
  clientKnowledgeBlock?: string | null;
  /** Unified brand context from Brand DNA (takes precedence over clientContext/brandPreferences) */
  brandDNA?: BrandContext | null;
}

const TIME_RANGE_LABELS: Record<string, string> = {
  last_7_days: 'last 7 days',
  last_30_days: 'last 30 days',
  last_3_months: 'last 3 months',
  last_6_months: 'last 6 months',
  last_year: 'last year',
};

function formatSerpDataBlock(serpData: BraveSerpData): string {
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

export function buildClientStrategyPrompt(config: ClientStrategyConfig): string {
  const timeLabel = TIME_RANGE_LABELS[config.timeRange] || config.timeRange;
  const sourceFilter = config.source !== 'all'
    ? `Focus specifically on ${config.source} content.`
    : 'Analyze across all major social platforms (TikTok, Instagram, YouTube, Reddit, X/Twitter).';
  const langFilter = config.language !== 'all'
    ? `Prioritize content in ${config.language}.`
    : '';
  const countryFilter = config.country !== 'all'
    ? `Focus on content from or relevant to ${config.country}.`
    : '';

  const ctx = config.clientContext;
  const keywordsLine = ctx.topicKeywords && ctx.topicKeywords.length > 0
    ? `- Core topics: ${ctx.topicKeywords.join(', ')}`
    : '- Core topics: Not specified';

  // Brand DNA takes precedence over legacy clientContext/brandPreferences
  const brandDNABlock = config.brandDNA
    ? `\n## BRAND DNA\n${config.brandDNA.toPromptBlock()}\n`
    : '';

  // Build brand preferences block if available (skip if Brand DNA is present)
  const prefsBlock = !config.brandDNA && hasPreferences(config.brandPreferences)
    ? '\n' + formatBrandPreferencesBlock(
        config.brandPreferences,
        ctx.name,
        ctx.industry
      ) + '\n'
    : '';

  // Knowledge base block (structured entities, brand profile, meetings)
  const knowledgeBlock = config.clientKnowledgeBlock
    ? `\n## CLIENT KNOWLEDGE BASE\nThe following is structured data from ${ctx.name}'s knowledge vault. Use it to inform all recommendations with specific brand details.\n\n${config.clientKnowledgeBlock}\n`
    : '';

  // Website content block (skip if Brand DNA is present — it already includes website data)
  const websiteBlock = !config.brandDNA && config.websiteContent?.length
    ? `\n## CLIENT WEBSITE CONTENT\nThe following was crawled from ${ctx.name}'s website. Use it to deeply understand their brand, products, services, and messaging style.\n\n${config.websiteContent.map((p) => `### ${p.url}\n${p.content}`).join('\n\n')}\n`
    : '';

  const serpBlock = formatSerpDataBlock(config.serpData);

  // When Brand DNA is available, use it as the primary brand profile section
  const brandProfileSection = config.brandDNA
    ? `${brandDNABlock}`
    : `
## CLIENT BRAND PROFILE
- Brand: ${ctx.name}
- Industry: ${ctx.industry}
- Website: ${ctx.websiteUrl || 'Not provided'}
- Target audience: ${ctx.targetAudience || 'General'}
- Brand voice: ${ctx.brandVoice || 'Not specified'}
${keywordsLine}
${prefsBlock}`;

  return `# CLIENT STRATEGY — SHORT-FORM VIDEO CONTENT RESEARCH

## ROLE
You are an expert short-form video strategist specializing in TikTok, Instagram Reels, YouTube Shorts, and Facebook Reels. You work with a specific brand. Analyze the search data through the lens of this brand — what's relevant to THEIR audience, what content pillars they should build, and how trending topics connect to their brand. All content ideas are strictly for short-form video.

## RESEARCH TOPIC
"${config.query}"

## SEARCH PARAMETERS
- Time range: ${timeLabel}
- ${sourceFilter}
${langFilter ? `- ${langFilter}` : ''}
${countryFilter ? `- ${countryFilter}` : ''}
${brandProfileSection}${knowledgeBlock}${websiteBlock}${config.clientMemoryBlock ? `\n## CLIENT CONTENT HISTORY\nUse the following history to avoid repeating past research, differentiate new ideas, and build on what has worked for ${ctx.name}.\n\n${config.clientMemoryBlock}\n` : ''}
## REAL SEARCH DATA
The following data was gathered from live web searches. Use it as the basis for your analysis. Do NOT make up information — base all insights on this data.

${serpBlock}

## WHAT TO ANALYZE
Based on the search data above, analyze through the lens of ${ctx.name}'s brand:
1. **Overall sentiment** — What is the overall sentiment? Rate from -1.0 to 1.0.
2. **Conversation intensity** — How much are people talking? Rate as low, moderate, high, or very_high.
3. **Emotions** — What do people feel about this topic?
4. **Content that works** — What formats, angles, and hooks get the most engagement?
5. **Trending sub-topics** — What specific angles are trending? For each, cite 2-5 real sources.
6. **Video opportunities** — For each trending sub-topic, what video ideas would work for THIS brand?
7. **Content pillars** — What recurring content series should ${ctx.name} build around this topic?
8. **Niche insights** — What formats perform best, what hooks work, and what gaps exist?
9. **Brand alignment** — How do these trends connect to ${ctx.name}'s identity?

${EXECUTIVE_SUMMARY_CORE}

${executiveSummaryClientLens(ctx.name)}

## OUTPUT FORMAT
Respond ONLY in valid JSON matching this exact schema. No text outside the JSON object.

{
  "summary": "Single paragraph per executive summary rules above — **Markdown bold** on 3–6 short phrases; framed for ${ctx.name}",

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
      "takeaway": "1 sentence — how ${ctx.name} can replicate or learn from their approach"
    }
  ],

  "trending_topics": [
    {
      "name": "Specific sub-topic or angle",
      "resonance": "high",
      "sentiment": 0.0,
      "posts_overview": "2-3 sentences about this sub-topic, framed through ${ctx.name}'s lens",
      "comments_overview": "2-3 sentences about audience reactions relevant to ${ctx.name}",
      "sources": [
        {
          "url": "EXACT_URL_FROM_SEARCH_DATA",
          "title": "Title of the source",
          "type": "web | discussion | video",
          "relevance": "Why this matters for ${ctx.name}"
        }
      ],
      "video_ideas": [
        {
          "title": "Video title tailored to ${ctx.name}'s voice",
          "hook": "Opening hook that matches ${ctx.name}'s brand voice",
          "format": "talking_head | tutorial | reaction | street_interview | before_after | myth_bust | day_in_the_life | ugc_style | pov | storytime | hot_take | listicle",
          "virality": "low | medium | high | viral_potential",
          "why_it_works": "Why this works specifically for ${ctx.name}'s audience",
          "script_outline": [
            "Hook / opening line (first 1-3 seconds)",
            "Key point 1",
            "Key point 2",
            "Key point 3",
            "CTA / closing"
          ],
          "cta": "Suggested call-to-action for ${ctx.name}'s audience"
        }
      ]
    }
  ],

  "content_pillars": [
    {
      "pillar": "Pillar name tailored to ${ctx.name}",
      "description": "Why this pillar works for ${ctx.name}'s audience",
      "example_series": "A recurring series name or format idea",
      "frequency": "2-3x per week"
    }
  ],

  "niche_performance_insights": {
    "top_performing_formats": ["format1", "format2"],
    "best_posting_times": "General guidance based on niche data",
    "audience_hooks": ["hook pattern 1", "hook pattern 2"],
    "competitor_gaps": "Opportunities competitors are missing that ${ctx.name} can fill"
  },

  "brand_alignment_notes": "2-3 sentences on how the trending topics connect to ${ctx.name}'s identity, audience, and brand positioning. Use **Markdown bold** on 2–4 short phrases that must stand out (brand fit, audience, or strategic angle)."
}

## IMPORTANT GUIDELINES
- Include 3-5 big_movers — the brands, creators, companies, or products generating the most conversation in this space. For each, explain WHY they're making noise, list 3-5 specific tactics, and give a takeaway tailored to ${ctx.name}
- Include 5-8 emotions that sum to approximately 100%
- Include 3-5 items each for intentions (viewer motivations — why people watch, e.g. "To learn something new", "For entertainment", "To stay informed", "To feel inspired"), categories, and formats
- Generate 5-8 trending_topics, each with 2-4 video_ideas
- Each trending_topic MUST have 2-5 items in its "sources" array
- **Do NOT invent URLs.** Every URL in sources must be copied exactly from the search data above.
- Include 3-5 content_pillars specific to ${ctx.name}
- niche_performance_insights should have 3-5 formats, 3-5 hooks
- brand_alignment_notes should directly reference ${ctx.name}'s industry and audience
- All video ideas are for SHORT-FORM VIDEO ONLY (TikTok, Instagram Reels, YouTube Shorts, Facebook Reels). No long-form video, no blog posts, no articles, no written content.
- Each video idea MUST include "script_outline" (3-5 bullet talking points) and "cta" (call-to-action)
- All video ideas should match ${ctx.name}'s brand voice: ${ctx.brandVoice || 'professional and approachable'}
- Emotion colors: #6366F1 indigo, #10B981 emerald, #F59E0B amber, #EF4444 red, #8B5CF6 purple, #3B82F6 blue, #EC4899 pink, #14B8A6 teal
- Resonance values: "low", "medium", "high", or "viral"
- Sentiment scores range from -1.0 (very negative) to 1.0 (very positive). IMPORTANT: Be realistic — NOT every topic is positive. Use the FULL range: negative topics (complaints, frustrations, risks) should be -0.3 to -1.0, neutral/mixed topics should be -0.2 to 0.2, and only genuinely positive topics should be above 0.3. A typical set of 6-8 topics should have a mix of positive, neutral, and negative sentiments.
- engagement_rate should be a decimal between 0 and 1 (e.g., 0.045 for 4.5%)${hasPreferences(config.brandPreferences) ? `
- BRAND PREFERENCES ARE HARD CONSTRAINTS: The <brand_context> block above MUST be followed. Topics listed under "avoid" must NOT appear in any trending topic, content pillar, or video idea. Topics listed under "lean into" should be prioritized. Tone keywords must influence the style of all video titles, hooks, and content pillar descriptions. Seasonal priorities should be weighted if relevant to the current date. Content pillars should align with the brand's stated priorities.` : ''}`;
}
