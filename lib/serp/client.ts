/**
 * SERP client — Google results via Apify. SearXNG removed 2026-04-23.
 *
 * The topic-search pipeline calls `gatherSerpData` to get web results,
 * discussions, and videos. Today:
 *   - webResults come from scraperlink/google-search-results-serp-scraper.
 *   - discussions + videos are intentionally empty arrays. Reddit data comes
 *     from the trudax actor (lib/reddit/client.ts), and TikTok/YouTube from
 *     their own scrapers. The old SearXNG `discussions` + `videos` fields
 *     duplicated shallower versions of both.
 */

import { gatherSerpDataViaApify } from './apify-scraperlink';
import type { SerpData } from './types';

export async function gatherSerpData(
  query: string,
  options: {
    timeRange?: string;
    country?: string;
    language?: string;
    source?: string;
    limit?: number;
    runContext?: { topicSearchId?: string | null; clientId?: string | null };
  } = {},
): Promise<SerpData> {
  const sourceQuery =
    options.source && options.source !== 'all' ? `${query} ${options.source}` : query;

  const result = await gatherSerpDataViaApify(sourceQuery, {
    timeRange: options.timeRange,
    limit: options.limit,
    country: options.country,
    runContext: options.runContext,
  });

  if (!result) {
    return { webResults: [], discussions: [], videos: [] };
  }

  return result;
}
