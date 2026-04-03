import type {
  SerpSearchOptions,
  SerpData,
} from './types';
import { getSearxngWebEngines } from '@/lib/config/searxng-web-engines';

const SEARXNG_BASE = () => process.env.SEARXNG_URL?.replace(/\/+$/, '') || 'http://localhost:8888';

// Map our time_range values to SearXNG time_range parameter
const TIME_RANGE_MAP: Record<string, string> = {
  last_7_days: 'week',
  last_30_days: 'month',
  last_3_months: 'year',
  last_6_months: 'year',
  last_year: 'year',
};

interface SearxngResult {
  url: string;
  title: string;
  content: string;
  engine: string;
  category: string;
  publishedDate?: string;
  thumbnail?: string;
  author?: string;
  iframe_src?: string;
  length?: string;
  views?: number;
}

interface SearxngResponse {
  results: SearxngResult[];
}

/**
 * Low-level SearXNG JSON API search.
 */
export async function searxngSearch(
  query: string,
  options: SerpSearchOptions = {},
): Promise<SearxngResponse> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
  });

  if (options.timeRange) {
    const mapped = TIME_RANGE_MAP[options.timeRange];
    if (mapped) params.set('time_range', mapped);
  }
  if (options.language && options.language !== 'all') params.set('language', options.language);
  if (options.categories) params.set('categories', options.categories);
  if (options.engines) params.set('engines', options.engines);

  const response = await fetch(`${SEARXNG_BASE()}/search?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`SearXNG search error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

/**
 * Run 3 parallel SearXNG queries to gather web results, discussions, and videos
 * for a given topic query.
 */
export async function gatherSerpData(
  query: string,
  options: {
    timeRange?: string;
    country?: string;
    language?: string;
    source?: string;
  } = {},
): Promise<SerpData> {
  // Build source-specific query augmentations
  const sourceQuery =
    options.source && options.source !== 'all' ? `${query} ${options.source}` : query;

  // Run 3 searches in parallel
  const [webResponse, discussionResponse, videoResponse] = await Promise.allSettled([
    // 1. General web results
    searxngSearch(sourceQuery, {
      timeRange: options.timeRange,
      language: options.language,
      categories: 'general',
      engines: getSearxngWebEngines(),
    }),
    // 2. Discussions (Reddit, forums)
    searxngSearch(`${query} site:reddit.com OR forum OR discussion`, {
      timeRange: options.timeRange,
      language: options.language,
      categories: 'general',
      engines: 'reddit',
    }),
    // 3. Videos (YouTube, TikTok)
    searxngSearch(query, {
      timeRange: options.timeRange,
      language: options.language,
      categories: 'videos',
      engines: 'youtube',
    }),
  ]);

  // Extract web results
  const webResults =
    webResponse.status === 'fulfilled'
      ? webResponse.value.results.map((r) => ({
          title: r.title,
          url: r.url,
          description: r.content,
        }))
      : [];

  // Extract discussions
  const discussions =
    discussionResponse.status === 'fulfilled'
      ? discussionResponse.value.results.map((r) => ({
          title: r.title,
          url: r.url,
          description: r.content,
          forum: (() => {
            try {
              return new URL(r.url).hostname.replace('www.', '');
            } catch {
              return r.engine || 'Unknown forum';
            }
          })(),
          answers: undefined as number | undefined,
          topComment: undefined as string | undefined,
        }))
      : [];

  // Extract videos
  const videos =
    videoResponse.status === 'fulfilled'
      ? videoResponse.value.results.map((r) => ({
          title: r.title,
          url: r.url,
          description: r.content ?? '',
          platform: (() => {
            try {
              return new URL(r.url).hostname.replace('www.', '');
            } catch {
              return r.engine || 'Unknown';
            }
          })(),
          views: r.views != null ? String(r.views) : undefined,
          creator: r.author,
        }))
      : [];

  return { webResults, discussions, videos };
}
