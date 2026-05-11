// SPY-08 T04: Zernio adapter. Reads `platform_snapshots` rows tagged
// source='zernio' for the client+platform+range and shapes them into the
// platform-agnostic RangeAnalyticsPoint contract.

import { createAdminClient } from '@/lib/supabase/admin';
import type {
  AnalyticsRange,
  RangeAnalyticsAdapter,
  RangeAnalyticsPoint,
  RangePlatform,
} from '@/lib/analytics/range/types';

interface SnapshotRow {
  snapshot_date: string;
  followers_count: number | null;
  posts_count: number | null;
  engagement_rate: number | null;
  views_count: number | null;
}

export const zernioRangeAdapter: RangeAnalyticsAdapter = {
  async fetch(
    clientId: string,
    platform: RangePlatform,
    range: AnalyticsRange,
  ): Promise<RangeAnalyticsPoint[]> {
    const admin = createAdminClient();
    const { data } = await admin
      .from('platform_snapshots')
      .select('snapshot_date, followers_count, posts_count, engagement_rate, views_count')
      .eq('client_id', clientId)
      .eq('platform', platform)
      .eq('source', 'zernio')
      .gte('snapshot_date', range.from)
      .lte('snapshot_date', range.to)
      .order('snapshot_date', { ascending: true });

    return (data ?? []).map((row: SnapshotRow) => ({
      date: row.snapshot_date,
      followers: row.followers_count,
      posts: row.posts_count,
      engagement_rate: row.engagement_rate,
      views: row.views_count,
      source: 'zernio' as const,
    }));
  },
};
