import type {
  BraveWebSearchResponse,
  BraveSearchOptions,
  BraveSerpData,
} from './types';

const BRAVE_API_BASE = 'https://api.search.brave.com/res/v1/web/search';

// Map our time_range values to Brave's freshness parameter
const FRESHNESS_MAP: Record<string, string> = {
  last_7_days: 'pw',     // past week
  last_30_days: 'pm',    // past month
  last_3_months: 'py',   // past year (Brave doesn't have 3-month; use year)
  last_6_months: 'py',
  last_year: 'py',
};

function getApiKey(): string {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) {
    throw new Error('BRAVE_SEARCH_API_KEY is not configured');
  }
  return key;
}

async function braveSearch(
  query: string,
  options: BraveSearchOptions = {}
): Promise<BraveWebSearchResponse> {
  const params = new URLSearchParams({ q: query });

  if (options.count) params.set('count', String(options.count));
  if (options.freshness) params.set('freshness', options.freshness);
  if (options.country && options.country !== 'all') params.set('country', options.country);
  if (options.search_lang && options.search_lang !== 'all') params.set('search_lang', options.search_lang);
  if (options.result_filter) params.set('result_filter', options.result_filter);
  if (options.extra_snippets) params.set('extra_snippets', 'true');

  const response = await fetch(`${BRAVE_API_BASE}?${params.toString()}`, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': getApiKey(),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Brave Search API error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

/**
 * Run 3 parallel Brave Search calls to gather web results, discussions, and videos
 * for a given topic query.
 */
export async function gatherSerpData(
  query: string,
  options: {
    timeRange?: string;
    country?: string;
    language?: string;
    source?: string;
  } = {}
): Promise<BraveSerpData> {
  const freshness = options.timeRange ? FRESHNESS_MAP[options.timeRange] : undefined;
  const country = options.country;
  const search_lang = options.language;

  // Build source-specific query augmentations
  const sourceQuery = options.source && options.source !== 'all'
    ? `${query} ${options.source}`
    : query;

  // Run 3 searches in parallel
  const [webResponse, discussionResponse, videoResponse] = await Promise.allSettled([
    // 1. General web results
    braveSearch(sourceQuery, {
      count: 15,
      freshness,
      country,
      search_lang,
      extra_snippets: true,
    }),
    // 2. Discussions (Reddit, forums)
    braveSearch(`${query} site:reddit.com OR forum OR discussion`, {
      count: 10,
      freshness,
      country,
      search_lang,
    }),
    // 3. Videos (YouTube, TikTok)
    braveSearch(`${query} site:youtube.com OR site:tiktok.com`, {
      count: 10,
      freshness,
      country,
      search_lang,
    }),
  ]);

  // Extract web results
  const webResults = webResponse.status === 'fulfilled' && webResponse.value.web
    ? webResponse.value.web.results.map((r) => ({
        title: r.title,
        url: r.url,
        description: r.description,
        snippets: r.extra_snippets,
      }))
    : [];

  // Extract discussions
  const discussions = discussionResponse.status === 'fulfilled' && discussionResponse.value.discussions
    ? discussionResponse.value.discussions.results.map((d) => ({
        title: d.title,
        url: d.url,
        description: d.description,
        forum: d.forum_name || 'Unknown forum',
        answers: d.num_answers,
        topComment: d.top_comment,
      }))
    : discussionResponse.status === 'fulfilled' && discussionResponse.value.web
      ? discussionResponse.value.web.results.map((r) => ({
          title: r.title,
          url: r.url,
          description: r.description,
          forum: new URL(r.url).hostname.replace('www.', ''),
          answers: undefined,
          topComment: undefined,
        }))
      : [];

  // Extract videos
  const videos = videoResponse.status === 'fulfilled' && videoResponse.value.videos
    ? videoResponse.value.videos.results.map((v) => ({
        title: v.title,
        url: v.url,
        description: v.description,
        platform: v.meta_url?.hostname?.replace('www.', '') || 'Unknown',
        views: v.views,
        creator: v.creator,
      }))
    : videoResponse.status === 'fulfilled' && videoResponse.value.web
      ? videoResponse.value.web.results.map((r) => ({
          title: r.title,
          url: r.url,
          description: r.description,
          platform: new URL(r.url).hostname.replace('www.', ''),
          views: undefined,
          creator: undefined,
        }))
      : [];

  return { webResults, discussions, videos };
}
