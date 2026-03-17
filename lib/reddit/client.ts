// lib/reddit/client.ts — Reddit search + comment fetching (no auth, public JSON API)

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

const USER_AGENT = 'NativzCortex/1.0 (social research tool)';

function mapTimeRange(timeRange: string): string {
  switch (timeRange) {
    case 'last_7_days': return 'week';
    case 'last_30_days': return 'month';
    case 'last_3_months': return 'year'; // Reddit only has week/month/year/all
    case 'last_6_months': return 'year';
    case 'last_year': return 'year';
    default: return 'month';
  }
}

/**
 * Search Reddit for posts matching a query. Uses the public JSON API (no auth).
 * Rate limit: ~60 req/min unauthenticated.
 */
export async function searchReddit(
  query: string,
  timeRange: string,
  limit: number = 50,
): Promise<RedditSearchResult> {
  const t = mapTimeRange(timeRange);
  const posts: RedditPost[] = [];
  const subredditCounts: Record<string, number> = {};

  // Fetch multiple pages if deep mode (limit > 50)
  const pages = Math.ceil(Math.min(limit, 250) / 25);
  let after: string | null = null;

  for (let page = 0; page < pages; page++) {
    try {
      const params = new URLSearchParams({
        q: query,
        sort: 'relevance',
        t,
        limit: '25',
        type: 'link',
        restrict_sr: '',
      });
      if (after) params.set('after', after);

      const res = await fetch(`https://www.reddit.com/search.json?${params}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        console.error(`Reddit search failed: ${res.status}`);
        break;
      }

      const json = await res.json();
      const children = json?.data?.children ?? [];
      after = json?.data?.after ?? null;

      for (const child of children) {
        const d = child.data;
        if (!d || d.over_18) continue; // skip NSFW

        posts.push({
          id: d.id,
          title: d.title ?? '',
          selftext: (d.selftext ?? '').slice(0, 2000), // cap at 2K chars
          score: d.score ?? 0,
          num_comments: d.num_comments ?? 0,
          url: d.url ?? '',
          permalink: d.permalink ?? '',
          subreddit: d.subreddit ?? '',
          created_utc: d.created_utc ?? 0,
          author: d.author ?? '[deleted]',
          link_flair_text: d.link_flair_text ?? null,
        });

        const sub = d.subreddit ?? '';
        subredditCounts[sub] = (subredditCounts[sub] ?? 0) + 1;
      }

      if (!after) break; // no more pages
      // Small delay between pages to be respectful
      if (page < pages - 1) await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.error('Reddit search page error:', err);
      break;
    }
  }

  // Sort subreddits by frequency
  const topSubreddits = Object.entries(subredditCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([sub]) => sub);

  return { posts, topSubreddits, totalPosts: posts.length };
}

/**
 * Fetch top comments for a Reddit post.
 */
export async function fetchTopComments(
  permalink: string,
  limit: number = 5,
): Promise<RedditComment[]> {
  try {
    const url = `https://www.reddit.com${permalink}.json?limit=${limit}&sort=top&depth=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return [];
    const json = await res.json();

    // Reddit returns [post, comments] array
    const commentListing = json?.[1]?.data?.children ?? [];
    const comments: RedditComment[] = [];

    for (const child of commentListing) {
      if (child.kind !== 't1' || !child.data) continue;
      const d = child.data;
      if (d.author === 'AutoModerator' || d.body === '[deleted]' || d.body === '[removed]') continue;

      comments.push({
        id: d.id,
        body: (d.body ?? '').slice(0, 1000),
        score: d.score ?? 0,
        author: d.author ?? '[deleted]',
        created_utc: d.created_utc ?? 0,
      });
    }

    return comments.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Search Reddit and fetch top comments for the most engaging posts.
 * This is the main entry point for the platform router.
 */
export async function gatherRedditData(
  query: string,
  timeRange: string,
  volume: 'quick' | 'deep' = 'quick',
): Promise<RedditSearchResult & { postsWithComments: (RedditPost & { top_comments: RedditComment[] })[] }> {
  const limit = volume === 'deep' ? 200 : 50;
  const result = await searchReddit(query, timeRange, limit);

  // Fetch comments for top engaging posts (by score + comments)
  const topPosts = [...result.posts]
    .sort((a, b) => (b.score + b.num_comments) - (a.score + a.num_comments))
    .slice(0, volume === 'deep' ? 30 : 8);

  // Batch comment fetches to respect Reddit's ~60 req/min unauthenticated rate limit
  const postsWithComments: (RedditPost & { top_comments: RedditComment[] })[] = [];
  const batchSize = 8;
  for (let i = 0; i < topPosts.length; i += batchSize) {
    const batch = topPosts.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (post) => {
        const top_comments = await fetchTopComments(post.permalink, 5);
        return { ...post, top_comments };
      }),
    );
    postsWithComments.push(...results);
    if (i + batchSize < topPosts.length) await new Promise((r) => setTimeout(r, 500));
  }

  // Merge: posts with comments first, then remaining posts without comments
  const commentedIds = new Set(postsWithComments.map((p) => p.id));
  const remainingPosts = result.posts
    .filter((p) => !commentedIds.has(p.id))
    .map((p) => ({ ...p, top_comments: [] as RedditComment[] }));

  return {
    ...result,
    postsWithComments: [...postsWithComments, ...remainingPosts],
  };
}
