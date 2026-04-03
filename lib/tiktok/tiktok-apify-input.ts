/**
 * Input builders + row normalization for Apify TikTok actors used by topic search.
 *
 * Default actor: apidojo/tiktok-scraper (~$0.30/1k posts, keyword search + sortType + dateRange + location).
 * Legacy: clockworks/tiktok-scraper (searchQueries + searchSection /video + searchSorting + searchDatePosted).
 *
 * @see https://apify.com/apidojo/tiktok-scraper
 * @see https://apify.com/clockworks/tiktok-scraper
 */

export type TikTokSortPreference = 'RELEVANCE' | 'MOST_LIKED' | 'DATE_POSTED';

/** Map app time_range → API Dojo `dateRange` (search only). */
export function mapTimeRangeToApidojoDateRange(timeRange: string): string {
  switch (timeRange) {
    case 'last_7_days':
      return 'THIS_WEEK';
    case 'last_30_days':
      return 'THIS_MONTH';
    case 'last_3_months':
      return 'LAST_THREE_MONTHS';
    case 'last_6_months':
      return 'LAST_SIX_MONTHS';
    case 'last_year':
      return 'ALL_TIME';
    default:
      return 'DEFAULT';
  }
}

/** Map app time_range → Clockworks `searchDatePosted` (with /video search). */
export function mapTimeRangeToClockworksSearchDatePosted(timeRange: string): string {
  switch (timeRange) {
    case 'last_7_days':
      return '2';
    case 'last_30_days':
      return '3';
    case 'last_3_months':
      return '4';
    case 'last_6_months':
      return '5';
    case 'last_year':
      return '0';
    default:
      return '0';
  }
}

export function parseTikTokSortPreference(raw: string | undefined): TikTokSortPreference {
  const u = (raw ?? 'RELEVANCE').toUpperCase();
  if (u === 'MOST_LIKED' || u === 'ENGAGEMENT') return 'MOST_LIKED';
  if (u === 'DATE_POSTED' || u === 'DATE') return 'DATE_POSTED';
  return 'RELEVANCE';
}

/** Clockworks searchSorting: "0" relevance, "1" most liked, "3" date. */
export function mapSortToClockworksSearchSorting(sort: TikTokSortPreference): '0' | '1' | '3' {
  switch (sort) {
    case 'MOST_LIKED':
      return '1';
    case 'DATE_POSTED':
      return '3';
    default:
      return '0';
  }
}

export function isClockworksActorId(actorId: string): boolean {
  const a = actorId.toLowerCase();
  return a.includes('clockworks');
}

export function getTikTokActorIdFromEnv(): string {
  return (process.env.APIFY_TIKTOK_ACTOR_ID ?? 'apidojo/tiktok-scraper').trim();
}

export function getTikTokSortPreferenceFromEnv(): TikTokSortPreference {
  return parseTikTokSortPreference(process.env.APIFY_TIKTOK_SORT_TYPE);
}

export type TikTokInputMode = 'apidojo' | 'clockworks';

export function getTikTokInputMode(actorId: string): TikTokInputMode {
  const override = process.env.APIFY_TIKTOK_INPUT_MODE?.toLowerCase().trim();
  if (override === 'clockworks') return 'clockworks';
  if (override === 'apidojo') return 'apidojo';
  return isClockworksActorId(actorId) ? 'clockworks' : 'apidojo';
}

/** API Dojo actor input (keywords + sortType + dateRange + optional location). */
export function buildApidojoInput(
  query: string,
  maxItems: number,
  timeRange: string,
  sort: TikTokSortPreference,
): Record<string, unknown> {
  const input: Record<string, unknown> = {
    keywords: [query],
    maxItems,
    sortType: sort,
    dateRange: mapTimeRangeToApidojoDateRange(timeRange),
  };
  const loc = process.env.APIFY_TIKTOK_LOCATION?.trim();
  if (loc) input.location = loc;
  return input;
}

/** Clockworks actor input (searchQueries + /video section + sorting + date filter). */
export function buildClockworksInput(
  query: string,
  maxResults: number,
  timeRange: string,
  sort: TikTokSortPreference,
): Record<string, unknown> {
  return {
    searchQueries: [query],
    searchSection: '/video',
    resultsPerPage: maxResults,
    searchSorting: mapSortToClockworksSearchSorting(sort),
    searchDatePosted: mapTimeRangeToClockworksSearchDatePosted(timeRange),
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: false,
    shouldDownloadSlideshowImages: false,
  };
}
