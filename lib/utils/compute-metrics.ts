import type { BraveSerpData } from '@/lib/brave/types';
import type { SearchMetrics, TrendingTopic } from '@/lib/types/search';

/**
 * Parse view count strings like "1.2M", "450K", "12,345" into numbers.
 * Returns null if unparseable.
 */
function parseViewCount(views: string | undefined): number | null {
  if (!views) return null;

  const cleaned = views.replace(/,/g, '').trim().toLowerCase();

  const match = cleaned.match(/^([\d.]+)\s*(k|m|b)?/);
  if (!match) return null;

  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;

  const suffix = match[2];
  if (suffix === 'k') return Math.round(num * 1_000);
  if (suffix === 'm') return Math.round(num * 1_000_000);
  if (suffix === 'b') return Math.round(num * 1_000_000_000);

  return Math.round(num);
}

const RESONANCE_WEIGHTS: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  viral: 4,
};

/**
 * Compute a topic score (0–100) from trending topics.
 * Factors in number of topics and their resonance levels.
 */
function computeTopicScore(topics: TrendingTopic[]): number {
  if (topics.length === 0) return 0;

  const totalResonance = topics.reduce(
    (sum, t) => sum + (RESONANCE_WEIGHTS[t.resonance] ?? 1),
    0
  );
  const avgResonance = totalResonance / topics.length;

  // Scale: more topics and higher resonance → higher score
  // 5 topics at "high" avg = ~75, 8 topics at "viral" avg = 100
  const raw = (topics.length * avgResonance * 100) / 32;
  return Math.min(100, Math.round(raw));
}

/**
 * Count total video ideas across all trending topics.
 */
function countContentOpportunities(topics: TrendingTopic[]): number {
  return topics.reduce((sum, t) => sum + (t.video_ideas?.length ?? 0), 0);
}

/**
 * Compute real metrics from Brave SERP data + AI analysis.
 * Includes both source counts (for data) and display metrics (for the UI).
 */
export function computeMetricsFromSerp(
  serpData: BraveSerpData,
  overallSentiment: number,
  conversationIntensity: 'low' | 'moderate' | 'high' | 'very_high',
  trendingTopics?: TrendingTopic[]
): SearchMetrics {
  const webCount = serpData.webResults.length;
  const discussionCount = serpData.discussions.length;
  const videoCount = serpData.videos.length;
  const totalSources = webCount + discussionCount + videoCount;

  // Sum video views from Brave data
  let totalVideoViews: number | null = null;
  for (const v of serpData.videos) {
    const parsed = parseViewCount(v.views);
    if (parsed !== null) {
      totalVideoViews = (totalVideoViews ?? 0) + parsed;
    }
  }

  // Sum discussion reply counts
  let totalDiscussionReplies: number | null = null;
  for (const d of serpData.discussions) {
    if (d.answers !== undefined && d.answers !== null) {
      totalDiscussionReplies = (totalDiscussionReplies ?? 0) + d.answers;
    }
  }

  // AI-derived display metrics
  const topics = trendingTopics ?? [];

  return {
    web_results_found: webCount,
    discussions_found: discussionCount,
    videos_found: videoCount,
    total_sources: totalSources,
    total_video_views: totalVideoViews,
    total_discussion_replies: totalDiscussionReplies,
    overall_sentiment: overallSentiment,
    conversation_intensity: conversationIntensity,
    topic_score: computeTopicScore(topics),
    content_opportunities: countContentOpportunities(topics),
    trending_topics_count: topics.length,
    sources_analyzed: Math.max(totalSources, 1),
  };
}
