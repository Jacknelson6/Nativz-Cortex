// lib/reddit/client.ts — Reddit data via Apify (trudax/reddit-scraper-lite).
//
// Entry point called by the platform router. SearXNG + direct-scrape paths
// were removed 2026-04-23: we never ran SearXNG in production (localhost only),
// and the Apify path is cheaper + more reliable. See apify-trudax.ts for the
// actor-specific logic and lib/apify/record-run.ts for cost tracking.

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  score: number;
  num_comments: number;
  url: string;
  permalink: string;
  subreddit: string;
  created_utc: number;
  author: string;
  link_flair_text: string | null;
}

export interface RedditComment {
  id: string;
  body: string;
  score: number;
  author: string;
  created_utc: number;
}

export interface RedditSearchResult {
  posts: RedditPost[];
  topSubreddits: string[];
  totalPosts: number;
}

export interface RedditRunContext {
  topicSearchId?: string | null;
  clientId?: string | null;
  /** Override per-run post ceiling (from scraper_settings). */
  postsOverride?: number;
  /** Override per-run comments-per-post ceiling (from scraper_settings). */
  commentsPerPostOverride?: number;
}

/**
 * Gather Reddit data for a topic search. Searches all of Reddit by keyword
 * (no subreddit allowlist — trudax handles relevance). Returns posts with
 * inline top_comments when the actor includes them.
 *
 * Cost: every run writes a row to `apify_runs` for billing.
 */
export async function gatherRedditData(
  query: string,
  timeRange: string,
  volume: string = 'medium',
  runContext: RedditRunContext = {},
): Promise<RedditSearchResult & { postsWithComments: (RedditPost & { top_comments: RedditComment[] })[] }> {
  const apiKey = process.env.APIFY_API_KEY?.trim();

  if (!apiKey) {
    console.warn('[reddit] APIFY_API_KEY not set — skipping Reddit scrape');
    return { posts: [], topSubreddits: [], totalPosts: 0, postsWithComments: [] };
  }

  const { topicSearchId, clientId, postsOverride, commentsPerPostOverride } = runContext;

  try {
    const { gatherRedditViaTrudaxApify } = await import('@/lib/reddit/apify-trudax');
    const result = await gatherRedditViaTrudaxApify(
      query,
      timeRange,
      volume,
      apiKey,
      { topicSearchId, clientId },
      { postsOverride, commentsPerPostOverride },
    );
    if (result && result.postsWithComments.length > 0) return result;
    return { posts: [], topSubreddits: [], totalPosts: 0, postsWithComments: [] };
  } catch (err) {
    console.error('[reddit] Apify (trudax) failed:', err);
    return { posts: [], topSubreddits: [], totalPosts: 0, postsWithComments: [] };
  }
}
