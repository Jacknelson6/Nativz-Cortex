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
    topicKeywords?: string[] | null;
    websiteUrl?: string | null;
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
- Brand voice: ${config.clientContext.brandVoice || 'Not specified'}${config.clientContext.websiteUrl ? `\n- Website: ${config.clientContext.websiteUrl}` : ''}${config.clientContext.topicKeywords && config.clientContext.topicKeywords.length > 0 ? `\n- Core topics: ${config.clientContext.topicKeywords.join(', ')}` : ''}`
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
1. **Overall sentiment** — What is the overall sentiment of the conversation? Rate it from -1.0 (very negative) to 1.0 (very positive).
2. **Conversation intensity** — How much are people talking about this? Rate as low, moderate, high, or very_high.
3. **Emotions** — What do people feel about this topic? Map the full emotional spectrum.
4. **Content that works** — What formats, angles, and hooks get the most engagement?
5. **Trending sub-topics** — What specific angles or sub-topics within this broader topic are trending? For each, cite 2-5 real sources from the search data above.
6. **Video opportunities** — For each trending sub-topic, what specific video ideas would perform well?

## OUTPUT FORMAT
Respond ONLY in valid JSON matching this exact schema. No text outside the JSON object.

{
  "summary": "3-5 sentence overview of the topic landscape. Reference specific sources from the search data. What's the conversation about? What are the key takeaways? What opportunities exist for content creators?",

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
      "posts_overview": "2-3 sentences summarizing the types of posts about this sub-topic, with specific examples or quotes from real posts found in the search data",
      "comments_overview": "2-3 sentences summarizing the discussion and reactions in comments, with specific examples of what people are saying",
      "sources": [
        {
          "url": "EXACT_URL_FROM_SEARCH_DATA",
          "title": "Title of the source",
          "type": "web | discussion | video",
          "relevance": "Brief note on why this source is relevant to this sub-topic"
        }
      ],
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
- Include 5-8 emotions that sum to approximately 100%
- Include 3-5 items each for intentions, categories, and formats
- Generate 5-8 trending_topics, each with 2-4 video_ideas
- Each trending_topic MUST have 2-5 items in its "sources" array
- **Do NOT invent URLs.** Every URL in sources must be copied exactly from the search data above. If you cannot find a relevant URL, do not include a source entry for it.
- Reference specific articles, posts, or discussions from the search data in your posts_overview and comments_overview
- Emotion colors should be distinct hex values (use: #6366F1 indigo, #10B981 emerald, #F59E0B amber, #EF4444 red, #8B5CF6 purple, #3B82F6 blue, #EC4899 pink, #14B8A6 teal)
- Resonance values: "low", "medium", "high", or "viral"
- Sentiment scores range from -1.0 (very negative) to 1.0 (very positive). IMPORTANT: Be realistic — NOT every topic is positive. Use the FULL range: negative topics (complaints, frustrations, risks) should be -0.3 to -1.0, neutral/mixed topics should be -0.2 to 0.2, and only genuinely positive topics should be above 0.3. A typical set of 6-8 topics should have a mix of positive, neutral, and negative sentiments.
- overall_sentiment: a single number from -1.0 to 1.0 representing the overall sentiment across all search data
- conversation_intensity: "low", "moderate", "high", or "very_high" based on volume and engagement in the search data
- All video ideas should be specific and actionable — ready to produce
- engagement_rate should be a decimal between 0 and 1 (e.g., 0.045 for 4.5%)`;
}
