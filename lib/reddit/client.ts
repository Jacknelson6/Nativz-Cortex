// lib/reddit/client.ts — Reddit data via SearXNG + direct scraping
//
// Strategy: Use SearXNG to find Reddit threads (self-hosted, no rate limits),
// then scrape individual Reddit pages for full post content + comments.
// This avoids Reddit API registration entirely.

import { searxngSearch } from '@/lib/serp/client';
import { getSearxngWebEngines } from '@/lib/config/searxng-web-engines';

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

/**
 * Find Reddit threads via SearXNG (self-hosted, no rate limit concerns).
 * Returns URLs + metadata from the search index.
 */
async function findRedditThreadsViaSearxng(
  query: string,
  timeRange: string,
  count: number,
): Promise<{ title: string; url: string; description: string; subreddit: string; answers: number | null; topComment: string | null }[]> {
  const threads: { title: string; url: string; description: string; subreddit: string; answers: number | null; topComment: string | null }[] = [];

  // Run multiple searches for broad coverage (SearXNG is free/self-hosted)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: (any | null)[] = [];

  const webEngines = getSearxngWebEngines();
  const searches: { q: string; opts: Record<string, string> }[] = [
    // Direct reddit engine search
    { q: query, opts: { categories: 'general', engines: 'reddit' } },
    // Broader web search scoped to reddit (DuckDuckGo-backed general web by default)
    { q: `reddit ${query} discussion`, opts: { categories: 'general', engines: webEngines } },
  ];

  // For larger counts, add extra query variants for more coverage
  if (count > 40) {
    searches.push(
      { q: `site:reddit.com ${query}`, opts: { categories: 'general', engines: webEngines } },
      { q: `reddit ${query} advice tips`, opts: { categories: 'general', engines: webEngines } },
    );
  }

  for (const { q, opts } of searches) {
    try {
      const res = await searxngSearch(q, { timeRange, ...opts });
      results.push(res);
    } catch (err) {
      console.error('[reddit] SearXNG search error:', err);
      results.push(null);
    }
  }

  const seenUrls = new Set<string>();

  for (const data of results) {
    if (!data) continue;
    const resultCount = data.results?.length ?? 0;
    console.log(`[reddit] SearXNG response — results: ${resultCount}`);

    for (const r of data.results ?? []) {
      if (!r.url?.includes('reddit.com') || seenUrls.has(r.url)) continue;
      // Skip non-post URLs (wiki pages, sidebar, about pages, subreddit listings)
      if (r.url.includes('/wiki/') || r.url.includes('/about/') || r.url.match(/reddit\.com\/r\/[^/]+\/?$/)) continue;
      seenUrls.add(r.url);

      const subreddit = extractSubreddit(r.url);
      threads.push({
        title: r.title?.replace(` : ${subreddit}`, '').replace(' : r/', '') ?? '',
        url: r.url,
        description: r.content ?? '',
        subreddit,
        answers: null,
        topComment: null,
      });
    }
  }

  console.log(`[reddit] Total threads found via SearXNG: ${threads.length}`);
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
    const jsonUrl = url.replace(/\/?$/, '.json') + '?limit=20&sort=top&depth=1&raw_json=1';
    const cleanJsonUrl = jsonUrl.replace('.json.json', '.json');

    const res = await fetch(cleanJsonUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(6000),
    });

    if (res.status === 429) {
      // Rate limited — return what we have from search
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

    return { post, comments: comments.slice(0, 20) };
  } catch {
    return { post: null, comments: [] };
  }
}

/**
 * Search Reddit for posts matching a query.
 * Uses SearXNG to find threads, then scrapes for full content + comments.
 */
export async function searchReddit(
  query: string,
  timeRange: string,
  limit: number = 50,
): Promise<RedditSearchResult> {
  const searxngThreads = await findRedditThreadsViaSearxng(query, timeRange, Math.min(limit, 40));

  // Build posts from search metadata (no scraping needed for basic data)
  const posts: RedditPost[] = searxngThreads.map((thread) => ({
    id: extractPostId(thread.url),
    title: thread.title,
    selftext: thread.description,
    score: 0, // Search doesn't provide this — will be enriched by scraping
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
 * If Apify returned posts but no comment rows, fill comments via Reddit's .json API (same as legacy).
 */
async function enrichApifyPostsWithComments(
  posts: (RedditPost & { top_comments: RedditComment[] })[],
  maxThreads: number,
): Promise<(RedditPost & { top_comments: RedditComment[] })[]> {
  const need = posts.filter((p) => p.top_comments.length === 0 && p.num_comments > 0).slice(0, maxThreads);
  if (need.length === 0) return posts;

  const byId = new Map(posts.map((p) => [p.id, { ...p }]));
  const batchSize = 4;

  for (let i = 0; i < need.length; i += batchSize) {
    const batch = need.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      batch.map(async (post) => {
        const { comments } = await scrapeRedditThread(post.url);
        return { id: post.id, comments };
      }),
    );
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value.comments.length > 0) {
        const cur = byId.get(r.value.id);
        if (cur) cur.top_comments = r.value.comments;
      }
    }
    if (i + batchSize < need.length) await new Promise((res) => setTimeout(res, 500));
  }

  return posts.map((p) => byId.get(p.id) ?? p);
}

/**
 * Search Reddit and fetch top comments for the most engaging posts.
 * Main entry point for the platform router.
 *
 * When APIFY_API_KEY is set (and APIFY_REDDIT_USE is not "0"), prefers
 * macrocosmos/reddit-scraper: discover subreddits via SearXNG, then Apify (~$0.50/1k results).
 * Falls back to SearXNG + per-thread .json scraping on failure.
 */
export async function gatherRedditData(
  query: string,
  timeRange: string,
  volume: string = 'medium',
): Promise<RedditSearchResult & { postsWithComments: (RedditPost & { top_comments: RedditComment[] })[] }> {
  const apiKey = process.env.APIFY_API_KEY?.trim();
  const redditApifyOff = process.env.APIFY_REDDIT_USE === '0';

  if (apiKey && !redditApifyOff) {
    try {
      const { gatherRedditViaMacrocosmosApify } = await import('@/lib/reddit/apify-macrocosmos');
      const apify = await gatherRedditViaMacrocosmosApify(query, timeRange, volume, apiKey);
      if (apify && apify.postsWithComments.length > 0) {
        const maxEnrich = volume === 'deep' ? 20 : volume === 'medium' ? 15 : 10;
        const postsWithComments = await enrichApifyPostsWithComments(apify.postsWithComments, maxEnrich);
        return {
          posts: postsWithComments.map(({ top_comments: _tc, ...p }) => p),
          topSubreddits: apify.topSubreddits,
          totalPosts: postsWithComments.length,
          postsWithComments,
        };
      }
    } catch (err) {
      console.error('[reddit] Apify (macrocosmos) failed, using legacy path:', err);
    }
  }

  const limit = volume === 'deep' ? 100 : volume === 'medium' ? 60 : 20;
  const result = await searchReddit(query, timeRange, limit);

  // Scrape top threads for full content + comments.
  // deep=50, medium=30, light=10
  const scrapeCount = volume === 'deep' ? 50 : volume === 'medium' ? 30 : 10;
  const toScrape = result.posts.slice(0, scrapeCount);

  const postsWithComments: (RedditPost & { top_comments: RedditComment[] })[] = [];
  const batchSize = 5; // Conservative — scraping individual pages

  for (let i = 0; i < toScrape.length; i += batchSize) {
    const batch = toScrape.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (post) => {
        const { post: scrapedPost, comments } = await scrapeRedditThread(post.url);

        // Merge: scraped data enriches search metadata
        return {
          ...(scrapedPost ?? post),
          // Keep search title if scraping failed
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
