// SPY-08 T06: combined entry point. Analytics callers (server components +
// API routes) call `getAnalyticsForRange` and get a single shape regardless
// of which source(s) backed the answer. Handles the 'mixed' case by
// stitching pre-connect scrape points + post-connect Zernio points.
//
// Cached for 5 minutes per (client, platform, range) to keep analytics
// pages from rebuilding the resolver on every re-render.

import { unstable_cache } from 'next/cache';
import { resolveAnalyticsSource } from '@/lib/analytics/range/source-router';
import { zernioRangeAdapter } from '@/lib/analytics/range/adapter-zernio';
import { scrapeRangeAdapter } from '@/lib/analytics/range/adapter-scrape';
import type {
  AnalyticsRange,
  RangeAnalyticsPoint,
  RangeAnalyticsResult,
  RangePlatform,
} from '@/lib/analytics/range/types';

interface GetAnalyticsArgs {
  clientId: string;
  platform: RangePlatform;
  range: AnalyticsRange;
}

async function load(args: GetAnalyticsArgs): Promise<RangeAnalyticsResult> {
  const resolution = await resolveAnalyticsSource(args);

  let items: RangeAnalyticsPoint[] = [];
  if (resolution.source === 'zernio') {
    items = await zernioRangeAdapter.fetch(args.clientId, args.platform, args.range);
  } else if (resolution.source === 'scrape') {
    items = await scrapeRangeAdapter.fetch(args.clientId, args.platform, args.range);
  } else if (resolution.source === 'mixed' && resolution.connectedAt) {
    // Stitch: scrape for pre-connect days, zernio from connect onwards.
    // Resolver guarantees connectedAt is an ISO date when source==='mixed'.
    const connectDate = resolution.connectedAt;
    const scrapeRange: AnalyticsRange = {
      from: args.range.from,
      to: stepBackOneDay(connectDate),
    };
    const zernioRange: AnalyticsRange = {
      from: connectDate,
      to: args.range.to,
    };
    const [scrapeItems, zernioItems] = await Promise.all([
      scrapeRangeAdapter.fetch(args.clientId, args.platform, scrapeRange),
      zernioRangeAdapter.fetch(args.clientId, args.platform, zernioRange),
    ]);
    items = [...scrapeItems, ...zernioItems];
  }

  return {
    source: resolution.source,
    generated_at: new Date().toISOString(),
    stale: resolution.staleZernio,
    items,
  };
}

function stepBackOneDay(iso: string): string {
  // iso is YYYY-MM-DD; subtract a day in UTC for the split boundary.
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function getAnalyticsForRange(
  args: GetAnalyticsArgs,
): Promise<RangeAnalyticsResult> {
  const cacheKey = [
    'analytics-range',
    args.clientId,
    args.platform,
    args.range.from,
    args.range.to,
  ];
  const fetcher = unstable_cache(
    () => load(args),
    cacheKey,
    { revalidate: 300, tags: [`client:${args.clientId}:analytics`] },
  );
  return fetcher();
}
