export interface TooltipDef {
  title: string;
  description: string;
}

export const TOOLTIPS: Record<string, TooltipDef> = {
  sentiment: {
    title: 'Sentiment',
    description: 'Measures emotional tone from -1.0 (very negative) to +1.0 (very positive), based on language used across sources.',
  },
  resonance: {
    title: 'Resonance',
    description: 'How strongly content resonates with audiences. Ranges from Low to Viral based on engagement signals.',
  },
  total_views: {
    title: 'Total views',
    description:
      'Estimated reach from sources tied to this topic (views, likes, and comments blended). Shown as a compact number; not a census of unique viewers.',
  },
  views: {
    title: 'Views',
    description:
      'Estimated reach from sources tied to this topic (views, likes, and comments blended). Shown as a compact number; not a census of unique viewers.',
  },
  trending_topic_copy: {
    title: 'Copy topic',
    description: 'Copy this topic title to your clipboard so you can paste it into scripts, briefs, or other tools.',
  },
  trending_topic_save: {
    title: 'Save to ideas',
    description: 'Add this topic to your Ideas list so your team can turn it into concepts and productions later.',
  },
  trending_topic_saved: {
    title: 'Saved',
    description: 'This topic is already in your Ideas list.',
  },
  conversation_intensity: {
    title: 'Conversation intensity',
    description: 'How actively people are discussing this topic — measured by reply depth and discussion frequency.',
  },
  brand_references: {
    title: 'Brand references',
    description: 'Total sources found across the web, discussions, and videos that directly reference this brand.',
  },
  topic_score: {
    title: 'Topic score',
    description: 'Overall strength of this topic based on how many trending angles were found and how strongly they resonate with audiences.',
  },
  content_opportunities: {
    title: 'Content opportunities',
    description: 'Number of specific video ideas generated from the analysis — ready-to-use concepts your team can film.',
  },
  trending_topics: {
    title: 'Trending topics',
    description: 'Distinct trending angles found within this topic — each with its own audience sentiment, discussion patterns, and video ideas.',
  },
  sources_analyzed: {
    title: 'Sources analyzed',
    description: 'Total web pages, discussions, and videos analyzed by AI to generate these insights.',
  },
  web_sources: {
    title: 'Web sources',
    description: 'Number of relevant web pages found by searching this topic across news, blogs, and articles.',
  },
  discussions: {
    title: 'Conversations',
    description: 'Forum threads, Reddit posts, and community discussions where this topic is actively debated.',
  },
  videos: {
    title: 'Videos',
    description: 'YouTube and other video content related to this topic, including view counts and engagement.',
  },
  virality: {
    title: 'Virality',
    description: 'Predicted potential for content on this topic to spread widely based on current engagement patterns.',
  },
  // Emotions
  joy: {
    title: 'Joy',
    description: 'Positive emotions including happiness, excitement, and enthusiasm expressed in the content.',
  },
  anger: {
    title: 'Anger',
    description: 'Frustration, outrage, or displeasure directed at the topic or related issues.',
  },
  fear: {
    title: 'Fear',
    description: 'Anxiety, concern, or worry about risks and uncertainties related to this topic.',
  },
  surprise: {
    title: 'Surprise',
    description: 'Unexpected findings or reactions — content that caught people off guard.',
  },
  sadness: {
    title: 'Sadness',
    description: 'Disappointment, loss, or negative emotional responses found in the conversation.',
  },
  // Content breakdown
  intentions: {
    title: 'Intentions',
    description: 'What people intend to do — buy, learn, compare, or solve a problem related to this topic.',
  },
  categories: {
    title: 'Categories',
    description: 'Content types being created — tutorials, reviews, news, opinion pieces, and more.',
  },
  pillar_pct_of_content: {
    title: '% of content',
    description:
      'Share of posts in this topic that fall into this format or pillar (volume mix, not a quality score).',
  },
  pillar_er_typical: {
    title: 'ER',
    description:
      'Typical engagement rate for this content type within this topic’s evidence — likes, comments, and views relative to reach, expressed as a percentage (e.g. 0.7% means seven-tenths of a percent).',
  },
  pillar_er_your: {
    title: 'Your ER',
    description:
      'Estimated engagement if your attached client published this format for this topic — based on how well the angle fits their business, brand voice, and content strategy versus the typical rate above. Shown when a client is linked to the search.',
  },
};
