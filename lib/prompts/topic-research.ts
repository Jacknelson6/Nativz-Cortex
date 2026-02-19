import type { BraveSerpData } from '@/lib/brave/types';

interface TopicResearchConfig {
  query: string;
  source: string;
  timeRange: string;
  language: string;
  country: string;
  serpData: BraveSerpData;
  clientContext?: {
    name: string;
    industry: string;
    targetAudience?: string | null;
    brandVoice?: string | null;
  } | null;
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

export function buildTopicResearchPrompt(config: TopicResearchConfig): string {
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

  const clientBlock = config.clientContext
    ? `
## CLIENT CONTEXT (use to tailor recommendations)
- Brand: ${config.clientContext.name}
- Industry: ${config.clientContext.industry}
- Target audience: ${config.clientContext.targetAudience || 'General'}
- Brand voice: ${config.clientContext.brandVoice || 'Not specified'}`
    : '';

  const serpBlock = formatSerpDataBlock(config.serpData);

  return `# TOPIC RESEARCH & CONTENT IDEATION

## ROLE
You are an expert social media researcher and content strategist. You have been given real search data gathered from the web about a topic. Your task is to analyze this data, identify trends, sentiment, and engagement patterns, then generate actionable insights and video content ideas.

## RESEARCH TOPIC
"${config.query}"

## SEARCH PARAMETERS
- Time range: ${timeLabel}
- ${sourceFilter}
${langFilter ? `- ${langFilter}` : ''}
${countryFilter ? `- ${countryFilter}` : ''}
${clientBlock}

## REAL SEARCH DATA
The following data was gathered from live web searches. Use it as the basis for your analysis. Do NOT make up information — base all insights on this data.

${serpBlock}

## WHAT TO ANALYZE
Based on the search data above:
1. **Volume and engagement** — How much are people talking about this? What engagement levels are posts getting?
2. **Sentiment and emotions** — What do people feel about this topic? Map the full emotional spectrum.
3. **Content that works** — What formats, angles, and hooks get the most engagement?
4. **Trending sub-topics** — What specific angles or sub-topics within this broader topic are trending?
5. **Video opportunities** — For each trending sub-topic, what specific video ideas would perform well?

## OUTPUT FORMAT
Respond ONLY in valid JSON matching this exact schema. No text outside the JSON object.

Generate realistic estimated numbers based on the search data provided. Activity data should span the ${timeLabel} period with weekly data points.

{
  "summary": "3-5 sentence overview of the topic landscape. What's the conversation about? What are the key takeaways? What opportunities exist for content creators?",

  "metrics": {
    "total_engagements": 0,
    "engagement_rate": 0.0,
    "estimated_views": 0,
    "estimated_reach": 0,
    "total_mentions": 0
  },

  "activity_data": [
    {
      "date": "Mon DD",
      "views": 0,
      "mentions": 0,
      "sentiment": 0.0
    }
  ],

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
      "estimated_views": 0,
      "resonance": "high",
      "sentiment": 0.0,
      "date": "YYYY-MM-DD",
      "posts_overview": "2-3 sentences summarizing the types of posts about this sub-topic, with specific examples or quotes from real posts found in the search data",
      "comments_overview": "2-3 sentences summarizing the discussion and reactions in comments, with specific examples of what people are saying",
      "video_ideas": [
        {
          "title": "Compelling video title that would work as a TikTok/Reel caption",
          "hook": "The first 3 seconds — what grabs attention immediately",
          "format": "talking_head | tutorial | reaction | street_interview | before_after | myth_bust | day_in_the_life | ugc_style",
          "virality": "low | medium | high | viral_potential",
          "why_it_works": "1-2 sentences explaining the psychological or strategic reason this idea would perform well"
        }
      ]
    }
  ]
}

## IMPORTANT GUIDELINES
- Generate 6-10 activity_data points spread across the time range
- Include 5-8 emotions that sum to approximately 100%
- Include 3-5 items each for intentions, categories, and formats
- Generate 5-8 trending_topics, each with 2-4 video_ideas
- Use realistic numbers based on the actual search data — don't inflate
- Reference specific articles, posts, or discussions from the search data in your posts_overview and comments_overview
- Emotion colors should be distinct hex values (use: #6366F1 indigo, #10B981 emerald, #F59E0B amber, #EF4444 red, #8B5CF6 purple, #3B82F6 blue, #EC4899 pink, #14B8A6 teal)
- Resonance values: "low", "medium", "high", or "viral"
- Sentiment scores range from -1.0 (very negative) to 1.0 (very positive)
- All video ideas should be specific and actionable — ready to produce
- engagement_rate should be a decimal between 0 and 1 (e.g., 0.045 for 4.5%)`;
}
