// SPY-08: Range-aware analytics source types. Distinct from the ZNA-01
// per-platform resolver in `lib/analytics/source-router.ts` because callers
// here ask "for this DATE RANGE, where does the data live?" — which can
// produce 'mixed' (range straddles the Zernio connect date) or 'none'
// (neither scrape nor Zernio has data). ZNA-01's resolver picks a single
// adapter per platform at write time.

export type RangeAnalyticsSource = 'zernio' | 'scrape' | 'mixed' | 'none';

export type RangePlatform = 'tiktok' | 'instagram' | 'youtube' | 'facebook' | 'x';

export interface AnalyticsRange {
  /** ISO date (YYYY-MM-DD). Inclusive. */
  from: string;
  /** ISO date (YYYY-MM-DD). Inclusive. */
  to: string;
}

export interface RangeAnalyticsPoint {
  /** YYYY-MM-DD */
  date: string;
  followers: number | null;
  posts: number | null;
  engagement_rate: number | null;
  views: number | null;
  source: 'zernio' | 'scrape';
}

export interface RangeAnalyticsResult {
  source: RangeAnalyticsSource;
  generated_at: string;
  stale: boolean;
  items: RangeAnalyticsPoint[];
}

export interface RangeAnalyticsAdapter {
  fetch(
    clientId: string,
    platform: RangePlatform,
    range: AnalyticsRange,
  ): Promise<RangeAnalyticsPoint[]>;
}

export interface RangeSourceResolution {
  source: RangeAnalyticsSource;
  /** ISO timestamp of the first Zernio row for this client+platform; null if no Zernio data. */
  connectedAt: string | null;
  /** True when the most recent Zernio row is more than 24h old. */
  staleZernio: boolean;
}
