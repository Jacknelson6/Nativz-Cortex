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
  high: 4,
  viral: 8,
};

/**
 * Compute a topic score (0–100) from trending topics.
 * Uses an asymptotic curve so 100 is nearly impossible — reserved for
 * truly viral phenomena with high resonance across many platforms.
 *
 * Guidelines:
 *   3 medium topics ≈ 25-35
 *   5 high topics ≈ 50-65
 *   8 viral topics across all platforms ≈ 80-90
 */
function computeTopicScore(topics: TrendingTopic[]): number {
  if (topics.length === 0) return 0;

  // Weighted sum of resonance levels
  const rawScore = topics.reduce(
    (sum, t) => sum + (RESONANCE_WEIGHTS[t.resonance] ?? 1),
    0
  );

  // Source diversity bonus: how many unique platforms are represented (0–1 scale)
  const uniquePlatforms = new Set(
    topics.flatMap(t => t.sources?.map(s => s.platform) ?? [])
  ).size;
  const diversityBonus = Math.min(uniquePlatforms / 5, 1);

  // Asymptotic curve: approaches 100 but never reaches it
  // k=0.04 gives: rawScore=6 → ~21, rawScore=20 → ~55, rawScore=64 → ~92
  const score = Math.round(
    100 * (1 - Math.exp(-0.04 * rawScore)) * (0.7 + 0.3 * diversityBonus)
  );

  return Math.min(100, score);
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
  trendingTopics?: TrendingTopic[],
  platformSourceCount?: number,
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
    sources_analyzed: Math.max(platformSourceCount ?? totalSources, 1),
  };
}
