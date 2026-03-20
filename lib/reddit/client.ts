// lib/reddit/client.ts — Reddit data via Brave Search + direct scraping
//
// Strategy: Use Brave Search to find Reddit threads (no rate limits),
// then scrape individual Reddit pages for full post content + comments.
// This avoids Reddit API registration entirely.

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

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BRAVE_API_BASE = 'https://api.search.brave.com/res/v1/web/search';

const FRESHNESS_MAP: Record<string, string> = {
  last_7_days: 'pw',
  last_30_days: 'pm',
  last_3_months: 'py',
  last_6_months: 'py',
  last_year: 'py',
};

/**
 * Find Reddit threads via Brave Search (no rate limit concerns).
 * Returns URLs + metadata from Brave's index.
 */
async function findRedditThreadsViaBrave(
  query: string,
  timeRange: string,
  count: number,
): Promise<{ title: string; url: string; description: string; subreddit: string; answers: number | null; topComment: string | null }[]> {
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!braveKey) return [];

  const freshness = FRESHNESS_MAP[timeRange];
  const threads: { title: string; url: string; description: string; subreddit: string; answers: number | null; topComment: string | null }[] = [];

  // Run two searches in parallel: discussions-focused + web results for Reddit
  const [discussionRes, webRes] = await Promise.allSettled([
    // Brave discussions endpoint — gets forum metadata (answer counts, top comments)
    fetch(`${BRAVE_API_BASE}?${new URLSearchParams({
      q: `site:reddit.com ${query}`,
      count: String(Math.min(count, 20)),
      ...(freshness ? { freshness } : {}),
    })}`, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': braveKey,
      },
      signal: AbortSignal.timeout(10000),
    }).then(r => r.ok ? r.json() : null),

    // Second search with different query phrasing for broader coverage
    fetch(`${BRAVE_API_BASE}?${new URLSearchParams({
      q: `reddit ${query} discussion`,
      count: String(Math.min(count, 20)),
      ...(freshness ? { freshness } : {}),
    })}`, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': braveKey,
      },
      signal: AbortSignal.timeout(10000),
    }).then(r => r.ok ? r.json() : null),
  ]);

  const seenUrls = new Set<string>();

  // Process discussion results (best quality — has answer counts, top comments)
  for (const result of [discussionRes, webRes]) {
    if (result.status !== 'fulfilled' || !result.value) continue;
    const data = result.value;

    // Check discussions section
    for (const d of data.discussions?.results ?? []) {
      if (!d.url?.includes('reddit.com') || seenUrls.has(d.url)) continue;
      seenUrls.add(d.url);

      const subreddit = extractSubreddit(d.url);
      threads.push({
        title: d.title ?? '',
        url: d.url,
        description: d.description ?? '',
        subreddit,
        answers: d.num_answers ?? null,
        topComment: d.top_comment ?? null,
      });
    }

    // Check web results for Reddit pages
    for (const r of data.web?.results ?? []) {
      if (!r.url?.includes('reddit.com/r/') || seenUrls.has(r.url)) continue;
      // Skip non-post URLs (wiki pages, sidebar, etc.)
      if (r.url.includes('/wiki/') || r.url.includes('/about/')) continue;
      seenUrls.add(r.url);

      const subreddit = extractSubreddit(r.url);
      threads.push({
        title: r.title?.replace(` : ${subreddit}`, '').replace(' : r/', '') ?? '',
        url: r.url,
        description: r.description ?? '',
        subreddit,
        answers: null,
        topComment: null,
      });
    }
  }

  return threads.slice(0, count);
}

/**
 * Extract subreddit name from a Reddit URL.
 */
function extractSubreddit(url: string): string {
  const match = url.match(/reddit\.com\/r\/([^/]+)/);
  return match?.[1] ?? '';
}

/**
 * Extract post ID from a Reddit URL.
 */
function extractPostId(url: string): string {
  const match = url.match(/comments\/([a-z0-9]+)/);
  return match?.[1] ?? url;
}

/**
 * Scrape a Reddit post page for full content + top comments.
 * Uses the .json endpoint which returns structured data without needing API auth.
 */
async function scrapeRedditThread(url: string): Promise<{
  post: RedditPost | null;
  comments: RedditComment[];
}> {
  try {
    // Normalize URL to ensure we hit the .json endpoint
    const jsonUrl = url.replace(/\/?$/, '.json') + '?limit=10&sort=top&depth=1&raw_json=1';
    const cleanJsonUrl = jsonUrl.replace('.json.json', '.json');

    const res = await fetch(cleanJsonUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(6000),
    });

    if (res.status === 429) {
      // Rate limited — return what we have from Brave
      return { post: null, comments: [] };
    }

    if (!res.ok) return { post: null, comments: [] };

    const json = await res.json();
    if (!Array.isArray(json) || json.length < 1) return { post: null, comments: [] };

    // Extract post data
    const postData = json[0]?.data?.children?.[0]?.data;
    const post: RedditPost | null = postData ? {
      id: postData.id ?? '',
      title: postData.title ?? '',
      selftext: (postData.selftext ?? '').slice(0, 2000),
      score: postData.score ?? 0,
      num_comments: postData.num_comments ?? 0,
      url: postData.url ?? '',
      permalink: postData.permalink ?? '',
      subreddit: postData.subreddit ?? '',
      created_utc: postData.created_utc ?? 0,
      author: postData.author ?? '[deleted]',
      link_flair_text: postData.link_flair_text ?? null,
    } : null;

    // Extract comments
    const commentListing = json[1]?.data?.children ?? [];
    const comments: RedditComment[] = [];
    for (const child of commentListing) {
      if (child.kind !== 't1' || !child.data) continue;
      const d = child.data;
      if (d.author === 'AutoModerator' || d.body === '[deleted]' || d.body === '[removed]') continue;

      comments.push({
        id: d.id ?? '',
        body: (d.body ?? '').slice(0, 1000),
        score: d.score ?? 0,
        author: d.author ?? '[deleted]',
        created_utc: d.created_utc ?? 0,
      });
    }

    return { post, comments: comments.slice(0, 10) };
  } catch {
    return { post: null, comments: [] };
  }
}

/**
 * Search Reddit for posts matching a query.
 * Uses Brave Search to find threads, then scrapes for full content + comments.
 */
export async function searchReddit(
  query: string,
  timeRange: string,
  limit: number = 50,
): Promise<RedditSearchResult> {
  const braveThreads = await findRedditThreadsViaBrave(query, timeRange, Math.min(limit, 40));

  // Build posts from Brave metadata (no scraping needed for basic data)
  const posts: RedditPost[] = braveThreads.map((thread) => ({
    id: extractPostId(thread.url),
    title: thread.title,
    selftext: thread.description,
    score: 0, // Brave doesn't provide this — will be enriched by scraping
    num_comments: thread.answers ?? 0,
    url: thread.url,
    permalink: new URL(thread.url).pathname,
    subreddit: thread.subreddit,
    created_utc: 0,
    author: '',
    link_flair_text: null,
  }));

  // Count subreddits
  const subredditCounts: Record<string, number> = {};
  for (const post of posts) {
    if (post.subreddit) {
      subredditCounts[post.subreddit] = (subredditCounts[post.subreddit] ?? 0) + 1;
    }
  }

  const topSubreddits = Object.entries(subredditCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([sub]) => sub);

  return { posts, topSubreddits, totalPosts: posts.length };
}

/**
 * Fetch top comments for a Reddit post by scraping the thread.
 */
export async function fetchTopComments(
  permalink: string,
  limit: number = 5,
): Promise<RedditComment[]> {
  const url = `https://www.reddit.com${permalink}`;
  const { comments } = await scrapeRedditThread(url);
  return comments.slice(0, limit);
}

/**
 * Search Reddit and fetch top comments for the most engaging posts.
 * Main entry point for the platform router.
 *
 * Strategy:
 * 1. Brave Search finds Reddit threads (no rate limits)
 * 2. Scrape top threads for full content + comments (batched, with delays)
 */
export async function gatherRedditData(
  query: string,
  timeRange: string,
  volume: string = 'medium',
): Promise<RedditSearchResult & { postsWithComments: (RedditPost & { top_comments: RedditComment[] })[] }> {
  const limit = volume === 'deep' ? 40 : volume === 'medium' ? 25 : 10;
  const result = await searchReddit(query, timeRange, limit);

  // Scrape top threads for full content + comments
  // Be conservative with scraping to avoid Reddit's rate limits on .json endpoints
  const scrapeCount = volume === 'deep' ? 25 : volume === 'medium' ? 15 : 6;
  const toScrape = result.posts.slice(0, scrapeCount);

  const postsWithComments: (RedditPost & { top_comments: RedditComment[] })[] = [];
  const batchSize = 5; // Conservative — scraping individual pages

  for (let i = 0; i < toScrape.length; i += batchSize) {
    const batch = toScrape.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (post) => {
        const { post: scrapedPost, comments } = await scrapeRedditThread(post.url);

        // Merge: scraped data enriches Brave metadata
        return {
          ...(scrapedPost ?? post),
          // Keep Brave title if scraping failed
          title: scrapedPost?.title ?? post.title,
          selftext: scrapedPost?.selftext || post.selftext,
          top_comments: comments,
        };
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        postsWithComments.push(r.value);
      }
    }

    // Delay between batches to be respectful to Reddit
    if (i + batchSize < toScrape.length) {
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  // Add remaining posts (not scraped) with empty comments
  const scrapedIds = new Set(postsWithComments.map((p) => p.id));
  const remaining = result.posts
    .filter((p) => !scrapedIds.has(p.id))
    .map((p) => ({ ...p, top_comments: [] as RedditComment[] }));

  return {
    ...result,
    postsWithComments: [...postsWithComments, ...remaining],
  };
}
