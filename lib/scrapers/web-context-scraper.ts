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
  const results = await Promise.allSettled([
    fetchBraveSerpResults(query, options),
    fetchRedditThreads(query, options),
  ]);

  const serpResults = results[0].status === 'fulfilled' ? results[0].value : (() => { errors.push(`SERP: ${(results[0] as PromiseRejectedResult).reason}`); return []; })();
  const redditThreads = results[1].status === 'fulfilled' ? results[1].value : (() => { errors.push(`Reddit: ${(results[1] as PromiseRejectedResult).reason}`); return []; })();

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
 * Fetch top Reddit threads for a query using Reddit's public JSON API.
 * Sorted by relevance within the selected time range.
 */
async function fetchRedditThreads(
  query: string,
  options: { timeRange?: string; keywords?: string[] },
): Promise<RedditThread[]> {
  // Reddit time params: hour, day, week, month, year, all
  const redditTimeMap: Record<string, string> = {
    today: 'day',
    day: 'day',
    week: 'week',
    last_7_days: 'week',
    month: 'month',
    last_30_days: 'month',
    last_3_months: 'year',
    last_6_months: 'year',
    year: 'year',
    last_year: 'year',
  };

  let searchQuery = query;
  if (options.keywords?.length) {
    // Add first keyword for specificity
    searchQuery = `${query} ${options.keywords[0]}`;
  }

  const t = options.timeRange ? redditTimeMap[options.timeRange] || 'month' : 'month';
  const params = new URLSearchParams({
    q: searchQuery,
    sort: 'relevance',
    t,
    limit: '5',
    type: 'link',
  });

  const res = await fetch(`https://www.reddit.com/search.json?${params}`, {
    headers: {
      'User-Agent': 'NativzCortex/1.0 (topic research bot)',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Reddit API ${res.status}`);
  }

  const data = await res.json() as {
    data: {
      children: Array<{
        data: {
          title: string;
          permalink: string;
          subreddit: string;
          score: number;
          num_comments: number;
          selftext: string;
          created_utc: number;
        };
      }>;
    };
  };

  const threads: RedditThread[] = [];

  for (const child of data.data.children) {
    const post = child.data;
    let topComments: string[] = [];

    // Fetch top 3 comments for each thread (lightweight)
    try {
      const commentsRes = await fetch(
        `https://www.reddit.com${post.permalink}.json?limit=3&sort=top&depth=1`,
        {
          headers: { 'User-Agent': 'NativzCortex/1.0 (topic research bot)' },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (commentsRes.ok) {
        const commentsData = await commentsRes.json() as Array<{
          data: { children: Array<{ data: { body?: string } }> };
        }>;
        if (commentsData[1]?.data?.children) {
          topComments = commentsData[1].data.children
            .filter(c => c.data.body && c.data.body !== '[removed]' && c.data.body !== '[deleted]')
            .slice(0, 3)
            .map(c => (c.data.body || '').substring(0, 500));
        }
      }
    } catch {
      // Non-blocking — comments are optional
    }

    threads.push({
      title: post.title,
      url: `https://www.reddit.com${post.permalink}`,
      subreddit: post.subreddit,
      score: post.score,
      numComments: post.num_comments,
      selftext: post.selftext?.substring(0, 1000) || '',
      topComments,
      createdUtc: post.created_utc,
    });
  }

  return threads;
}
