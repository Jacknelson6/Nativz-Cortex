// lib/reddit/client.ts — Reddit data via Apify.
//
// Default path: macrocosmos/reddit-scraper (~$0.0005/item, ~7× cheaper than
// trudax). Falls back to trudax/reddit-scraper-lite if macrocosmos returns
// nothing — trudax also includes top_comments which some downstream use
// cases prefer.
//
// Opt out of macrocosmos with APIFY_REDDIT_PROVIDER=trudax (useful while
// validating the swap on a per-environment basis). See apify-macrocosmos.ts
// + apify-trudax.ts for the actor-specific logic and lib/apify/record-run.ts
// for cost tracking.

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
  /** Topic subtopics passed to the LLM subreddit-discovery step. */
  subtopics?: string[];
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

  const { topicSearchId, clientId, postsOverride, commentsPerPostOverride, subtopics } = runContext;

  // Provider choice — macrocosmos by default (cheaper). Set
  // APIFY_REDDIT_PROVIDER=trudax to pin the old path (e.g. when a specific
  // downstream use needs comment threads).
  const provider = (process.env.APIFY_REDDIT_PROVIDER ?? 'macrocosmos').toLowerCase();

  if (provider === 'macrocosmos') {
    try {
      const [{ gatherRedditViaMacrocosmosApify }, { discoverSubredditsForTopic }] = await Promise.all([
        import('@/lib/reddit/apify-macrocosmos'),
        import('@/lib/reddit/discover-subreddits'),
      ]);
      // Fire subreddit discovery in parallel with the rest of setup — the
      // LLM call + the Apify actor run both take ~a few seconds.
      const subreddits = await discoverSubredditsForTopic(query, subtopics ?? []);
      const limit = typeof postsOverride === 'number' && postsOverride > 0
        ? Math.min(250, postsOverride)
        : 150;
      const result = await gatherRedditViaMacrocosmosApify(query, apiKey, {
        subreddits,
        limit,
        sort: 'top',
        runContext: { topicSearchId, clientId },
      });
      if (result && result.postsWithComments.length > 0) return result;
      console.warn('[reddit] macrocosmos returned empty; falling back to trudax');
    } catch (err) {
      console.error('[reddit] macrocosmos failed, falling back to trudax:', err);
    }
  }

  // Fallback (or explicit provider=trudax) — original path with comments
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
