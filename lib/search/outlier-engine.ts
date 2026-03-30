import type { ScrapedVideo, ScoredVideo } from '@/lib/scrapers/types';

/**
 * Calculate outlier scores for scraped videos.
 *
 * Outlier score = video views / creator baseline views.
 * A video with 500K views from a creator who averages 10K = 50x outlier.
 *
 * For creators with only one video in the dataset, we estimate baseline from
 * follower count (1–3% avg view-to-follower ratio for short-form).
 */
export function calculateOutlierScores(videos: ScrapedVideo[]): ScoredVideo[] {
  if (videos.length === 0) return [];

  // Group by creator (platform + username)
  const creatorGroups = new Map<string, ScrapedVideo[]>();
  for (const v of videos) {
    const key = `${v.platform}:${v.author_username}`;
    const group = creatorGroups.get(key) ?? [];
    group.push(v);
    creatorGroups.set(key, group);
  }

  // Calculate baseline per creator
  const creatorBaseline = new Map<string, number>();
  for (const [key, group] of creatorGroups) {
    if (group.length >= 2) {
      // Multiple videos — use median views as baseline
      const views = group.map(v => v.views).sort((a, b) => a - b);
      const mid = Math.floor(views.length / 2);
      const median = views.length % 2 === 0
        ? (views[mid - 1] + views[mid]) / 2
        : views[mid];
      creatorBaseline.set(key, Math.max(median, 1));
    } else {
      // Single video — estimate from follower count
      const v = group[0];
      const followerBaseline = v.author_followers > 0
        ? v.author_followers * 0.02 // 2% avg view rate
        : null;
      // Use follower-based estimate or a conservative fallback
      creatorBaseline.set(key, Math.max(followerBaseline ?? 100, 1));
    }
  }

  // Score each video
  return videos.map(v => {
    const key = `${v.platform}:${v.author_username}`;
    const baseline = creatorBaseline.get(key) ?? 1;
    const outlierScore = v.views / baseline;

    return {
      ...v,
      outlier_score: Math.round(outlierScore * 100) / 100,
      hook_text: null, // populated by hook extractor
    };
  });
}

/** Get top N outlier videos across all platforms */
export function getTopOutliers(videos: ScoredVideo[], n: number = 10): ScoredVideo[] {
  return [...videos]
    .sort((a, b) => b.outlier_score - a.outlier_score)
    .slice(0, n);
}
