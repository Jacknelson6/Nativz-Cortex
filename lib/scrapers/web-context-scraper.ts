/**
 * Lightweight web context + Reddit scraper for topic searches.
 * Pulls ~10 SERP results and top Reddit discussions to give the LLM
 * grounding on what's currently relevant for the topic.
 *
 * Uses Brave Search API (cheap, fast) and Reddit's public JSON API.
 */

const BRAVE_API_KEY = () => process.env.BRAVE_SEARCH_API_KEY || '';
const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';

export interface WebContextResult {
  /** Top web SERP results (title, url, snippet) */
  serpResults: SerpSnippet[];
  /** Top Reddit discussions */
  redditThreads: RedditThread[];
  /** Errors (non-blocking) */
  errors: string[];
}

export interface SerpSnippet {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

export interface RedditThread {
  title: string;
  url: string;
  subreddit: string;
  score: number;
  numComments: number;
  selftext: string;
  topComments: string[];
  createdUtc: number;
}

// Map time ranges to Brave freshness param
const FRESHNESS_MAP: Record<string, string> = {
  today: 'pd',
  day: 'pd',
  week: 'pw',
  last_7_days: 'pw',
  month: 'pm',
  last_30_days: 'pm',
  last_3_months: 'py',
  last_6_months: 'py',
  year: 'py',
  last_year: 'py',
};

/**
 * Gather lightweight web context for a topic search.
 * - 10 Brave SERP results for general landscape
 * - 5 Reddit threads with top comments for discussion context
 */
export async function gatherWebContext(
  query: string,
  options: { timeRange?: string; language?: string; keywords?: string[] } = {},
): Promise<WebContextResult> {
  const errors: string[] = [];

  // Run sequentially to avoid Brave API rate limits (free plan: 1 req/sec)
  let serpResults: SerpSnippet[] = [];
  let redditThreads: RedditThread[] = [];

  try {
    serpResults = await fetchBraveSerpResults(query, options);
  } catch (e) {
    errors.push(`SERP: ${e}`);
  }

  try {
    redditThreads = await fetchRedditThreads(query, options);
  } catch (e) {
    errors.push(`Reddit: ${e}`);
  }

  return { serpResults, redditThreads, errors };
}

/**
 * Fetch ~10 web results from Brave Search API.
 */
async function fetchBraveSerpResults(
  query: string,
  options: { timeRange?: string; language?: string; keywords?: string[] },
): Promise<SerpSnippet[]> {
  const apiKey = BRAVE_API_KEY();
  if (!apiKey) {
    console.log('[web-context] No BRAVE_SEARCH_API_KEY, skipping SERP');
    return [];
  }

  // Build a search query that includes a keyword for specificity
  let searchQuery = query;
  if (options.keywords?.length) {
    searchQuery = `${query} ${options.keywords[0]}`;
  }

  const params = new URLSearchParams({
    q: searchQuery,
    count: '10',
    text_decorations: 'false',
  });

  if (options.language) params.set('search_lang', options.language);
  const freshness = options.timeRange ? FRESHNESS_MAP[options.timeRange] : undefined;
  if (freshness) params.set('freshness', freshness);

  const res = await fetch(`${BRAVE_SEARCH_URL}?${params}`, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Brave API ${res.status}: ${(await res.text()).substring(0, 200)}`);
  }

  const data = await res.json() as { web?: { results?: Array<{ title: string; url: string; description: string; page_age?: string }> } };
  const webResults = data.web?.results ?? [];

  return webResults.map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.description,
    publishedDate: r.page_age,
  }));
}

/**
 * Fetch top Reddit threads using a two-phase approach:
 * 1. Brave Search for "site:reddit.com" (finds the most relevant posts)
 * 2. Reddit JSON API to fetch comments for the top hits
 */
async function fetchRedditThreads(
  query: string,
  options: { timeRange?: string; keywords?: string[] },
): Promise<RedditThread[]> {
  const apiKey = BRAVE_API_KEY();

  // Phase 1: Use Brave to find relevant Reddit posts (much better relevance than Reddit's own search)
  let redditUrls: Array<{ title: string; url: string; snippet: string }> = [];

  if (apiKey) {
    let searchQuery = `site:reddit.com ${query}`;
    if (options.keywords?.length) {
      searchQuery += ` ${options.keywords[0]}`;
    }

    const params = new URLSearchParams({
      q: searchQuery,
      count: '8',
      text_decorations: 'false',
    });

    const freshness = options.timeRange ? FRESHNESS_MAP[options.timeRange] : undefined;
    if (freshness) params.set('freshness', freshness);

    try {
      const res = await fetch(`${BRAVE_SEARCH_URL}?${params}`, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const data = await res.json() as { web?: { results?: Array<{ title: string; url: string; description: string }> } };
        redditUrls = (data.web?.results ?? [])
          .filter(r => r.url.includes('reddit.com/r/') && r.url.includes('/comments/'))
          .slice(0, 5)
          .map(r => ({ title: r.title, url: r.url, snippet: r.description }));
      }
    } catch {
      // Fall through to direct Reddit search
    }
  }

  // Fallback: direct Reddit search if Brave returned nothing
  if (redditUrls.length === 0) {
    const redditTimeMap: Record<string, string> = {
      today: 'day', day: 'day', week: 'week', last_7_days: 'week',
      month: 'month', last_30_days: 'month', last_3_months: 'year',
      last_6_months: 'year', year: 'year', last_year: 'year',
    };
    const t = options.timeRange ? redditTimeMap[options.timeRange] || 'year' : 'year';

    try {
      const params = new URLSearchParams({ q: query, sort: 'relevance', t, limit: '5', type: 'link' });
      const res = await fetch(`https://www.reddit.com/search.json?${params}`, {
        headers: { 'User-Agent': 'NativzCortex/1.0 (topic research bot)' },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json() as { data: { children: Array<{ data: { title: string; permalink: string } }> } };
        redditUrls = data.data.children.map(c => ({
          title: c.data.title,
          url: `https://www.reddit.com${c.data.permalink}`,
          snippet: '',
        }));
      }
    } catch {
      // Give up on Reddit
    }
  }

  // Phase 2: Fetch each Reddit thread's details + top comments
  const threads: RedditThread[] = [];

  for (const item of redditUrls) {
    try {
      // Convert URL to .json endpoint
      const jsonUrl = item.url.replace(/\/?$/, '.json') + '?limit=3&sort=top&depth=1';
      const res = await fetch(jsonUrl, {
        headers: { 'User-Agent': 'NativzCortex/1.0 (topic research bot)' },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) continue;

      const data = await res.json() as Array<{
        data: {
          children: Array<{
            data: {
              title?: string; subreddit?: string; score?: number;
              num_comments?: number; selftext?: string; created_utc?: number;
              permalink?: string; body?: string;
            };
          }>;
        };
      }>;

      const post = data[0]?.data?.children?.[0]?.data;
      if (!post) continue;

      const topComments = (data[1]?.data?.children ?? [])
        .filter(c => c.data.body && c.data.body !== '[removed]' && c.data.body !== '[deleted]')
        .slice(0, 3)
        .map(c => (c.data.body || '').substring(0, 500));

      threads.push({
        title: post.title || item.title,
        url: item.url,
        subreddit: post.subreddit || '',
        score: post.score || 0,
        numComments: post.num_comments || 0,
        selftext: post.selftext?.substring(0, 1000) || '',
        topComments,
        createdUtc: post.created_utc || 0,
      });
    } catch {
      // Skip failed thread fetches
    }
  }

  return threads;
}
