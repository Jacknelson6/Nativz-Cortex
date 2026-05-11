// ZNA-01 T09: Scrape adapter — placeholder that mirrors the Zernio
// adapter signature so the source router can dispatch either path
// uniformly.
//
// Today, scrape paths live inline in lib/reporting/sync.ts and call
// Apify actors / direct fetches. This adapter wraps a single-day pull
// so the future sync refactor can call adapter.fetch(...) without
// caring whether the bytes come from Zernio or a scraper.

import type {
  AnalyticsPlatform,
  PlatformSnapshotInsert,
  PostMetricInsert,
} from '@/lib/analytics/types';

interface FetchArgs {
  clientId: string;
  socialProfileId: string;
  platform: AnalyticsPlatform;
  date: string;
}

export async function fetchScrapePlatformSnapshot(
  args: FetchArgs,
): Promise<PlatformSnapshotInsert> {
  // Stub: existing scrape path is invoked inline in lib/reporting/sync.ts.
  // Returning a shell row keeps the adapter signature uniform. The sync
  // refactor (deferred) will move the real scrape calls here.
  return {
    client_id: args.clientId,
    social_profile_id: args.socialProfileId,
    platform: args.platform,
    snapshot_date: args.date,
    follower_count: null,
    source: 'scrape',
    source_version: 'scrape-v1',
    captured_at: new Date().toISOString(),
  };
}

export async function fetchScrapePostMetrics(args: {
  clientId: string;
  socialProfileId: string;
  platform: AnalyticsPlatform;
  since: string;
}): Promise<PostMetricInsert[]> {
  void args;
  return [];
}
