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
  conversation_intensity: {
    title: 'Conversation intensity',
    description: 'How actively people are discussing this topic — measured by reply depth and discussion frequency.',
  },
  web_sources: {
    title: 'Web sources',
    description: 'Number of relevant web pages found by searching this topic across news, blogs, and articles.',
  },
  discussions: {
    title: 'Discussions',
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
};
