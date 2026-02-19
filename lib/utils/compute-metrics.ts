import type { BraveSerpData } from '@/lib/brave/types';
import type { SearchMetrics } from '@/lib/types/search';

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

/**
 * Compute real metrics from Brave SERP data + AI sentiment fields.
 * No fabrication — all counts come from what Brave actually returned.
 */
export function computeMetricsFromSerp(
  serpData: BraveSerpData,
  overallSentiment: number,
  conversationIntensity: 'low' | 'moderate' | 'high' | 'very_high'
): SearchMetrics {
  const webCount = serpData.webResults.length;
  const discussionCount = serpData.discussions.length;
  const videoCount = serpData.videos.length;

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

  return {
    web_results_found: webCount,
    discussions_found: discussionCount,
    videos_found: videoCount,
    total_sources: webCount + discussionCount + videoCount,
    total_video_views: totalVideoViews,
    total_discussion_replies: totalDiscussionReplies,
    overall_sentiment: overallSentiment,
    conversation_intensity: conversationIntensity,
  };
}
