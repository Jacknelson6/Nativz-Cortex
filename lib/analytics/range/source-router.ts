// SPY-08 T02: range-aware source resolver. Reads platform_snapshots
// (the existing daily aggregate table, already source-tagged by ZNA-01)
// for the client+platform pair and decides whether the requested range is
// covered by Zernio, scrape, both (mixed), or nothing (none).
//
// Mapping note: the PRD's `x` platform is not yet a snapshot platform; we
// return 'none' for it so the UI can still call us safely.

import { createAdminClient } from '@/lib/supabase/admin';
import type {
  AnalyticsRange,
  RangePlatform,
  RangeSourceResolution,
} from '@/lib/analytics/range/types';

const SNAPSHOT_PLATFORMS = new Set(['tiktok', 'instagram', 'facebook', 'youtube']);
const STALE_MS = 24 * 60 * 60 * 1000;

export async function resolveAnalyticsSource(args: {
  clientId: string;
  platform: RangePlatform;
  range: AnalyticsRange;
}): Promise<RangeSourceResolution> {
  const { clientId, platform, range } = args;

  if (!SNAPSHOT_PLATFORMS.has(platform)) {
    return { source: 'none', connectedAt: null, staleZernio: false };
  }

  const admin = createAdminClient();

  const [zernioFirstRes, zernioLastRes, scrapeAnyRes] = await Promise.all([
    admin
      .from('platform_snapshots')
      .select('snapshot_date')
      .eq('client_id', clientId)
      .eq('platform', platform)
      .eq('source', 'zernio')
      .order('snapshot_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin
      .from('platform_snapshots')
      .select('snapshot_date, captured_at')
      .eq('client_id', clientId)
      .eq('platform', platform)
      .eq('source', 'zernio')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('platform_snapshots')
      .select('snapshot_date')
      .eq('client_id', clientId)
      .eq('platform', platform)
      .eq('source', 'scrape')
      .order('snapshot_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const connectedAt = zernioFirstRes.data?.snapshot_date ?? null;
  const lastZernio = zernioLastRes.data?.snapshot_date ?? null;
  const hasScrape = Boolean(scrapeAnyRes.data?.snapshot_date);

  // No Zernio data: fall back to scrape or none.
  if (!connectedAt) {
    return {
      source: hasScrape ? 'scrape' : 'none',
      connectedAt: null,
      staleZernio: false,
    };
  }

  const staleZernio = lastZernio
    ? Date.now() - new Date(lastZernio).getTime() > STALE_MS
    : true;

  // Range fully before Zernio connection -> scrape-era data.
  if (range.to < connectedAt) {
    return {
      source: hasScrape ? 'scrape' : 'none',
      connectedAt,
      staleZernio,
    };
  }

  // Range fully on/after Zernio connection -> live data.
  if (range.from >= connectedAt) {
    return {
      source: 'zernio',
      connectedAt,
      staleZernio,
    };
  }

  // Range straddles the connection: mixed unless we have no scrape backfill.
  return {
    source: hasScrape ? 'mixed' : 'zernio',
    connectedAt,
    staleZernio,
  };
}
