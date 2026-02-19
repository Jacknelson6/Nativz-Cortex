import type { BraveSerpData } from '@/lib/brave/types';

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

  const serpBlock = formatSerpDataBlock(config.serpData);

  return `# CLIENT STRATEGY — BRAND-SPECIFIC CONTENT RESEARCH

## ROLE
You are an expert social media strategist working with a specific brand. Analyze the search data through the lens of this brand — what's relevant to THEIR audience, what content pillars they should build, and how trending topics connect to their brand positioning.

## RESEARCH TOPIC
"${config.query}"

## SEARCH PARAMETERS
- Time range: ${timeLabel}
- ${sourceFilter}
${langFilter ? `- ${langFilter}` : ''}
${countryFilter ? `- ${countryFilter}` : ''}

## CLIENT BRAND PROFILE
- Brand: ${ctx.name}
- Industry: ${ctx.industry}
- Website: ${ctx.websiteUrl || 'Not provided'}
- Target audience: ${ctx.targetAudience || 'General'}
- Brand voice: ${ctx.brandVoice || 'Not specified'}
${keywordsLine}

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

## OUTPUT FORMAT
Respond ONLY in valid JSON matching this exact schema. No text outside the JSON object.

{
  "summary": "3-5 sentence overview of the topic landscape, specifically framed for ${ctx.name}. What opportunities exist for THIS brand?",

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
      { "name": "Educational", "percentage": 0, "engagement_rate": 0.0 }
    ],
    "categories": [
      { "name": "How-to", "percentage": 0, "engagement_rate": 0.0 }
    ],
    "formats": [
      { "name": "Short-form video", "percentage": 0, "engagement_rate": 0.0 }
    ]
  },

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
          "format": "talking_head | tutorial | reaction | street_interview | before_after | myth_bust | day_in_the_life | ugc_style",
          "virality": "low | medium | high | viral_potential",
          "why_it_works": "Why this works specifically for ${ctx.name}'s audience"
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

  "brand_alignment_notes": "2-3 sentences on how the trending topics connect to ${ctx.name}'s identity, audience, and brand positioning"
}

## IMPORTANT GUIDELINES
- Include 5-8 emotions that sum to approximately 100%
- Include 3-5 items each for intentions, categories, and formats
- Generate 5-8 trending_topics, each with 2-4 video_ideas
- Each trending_topic MUST have 2-5 items in its "sources" array
- **Do NOT invent URLs.** Every URL in sources must be copied exactly from the search data above.
- Include 3-5 content_pillars specific to ${ctx.name}
- niche_performance_insights should have 3-5 formats, 3-5 hooks
- brand_alignment_notes should directly reference ${ctx.name}'s industry and audience
- All video ideas should match ${ctx.name}'s brand voice: ${ctx.brandVoice || 'professional and approachable'}
- Emotion colors: #6366F1 indigo, #10B981 emerald, #F59E0B amber, #EF4444 red, #8B5CF6 purple, #3B82F6 blue, #EC4899 pink, #14B8A6 teal
- Resonance values: "low", "medium", "high", or "viral"
- Sentiment scores range from -1.0 to 1.0
- engagement_rate should be a decimal between 0 and 1 (e.g., 0.045 for 4.5%)`;
}
