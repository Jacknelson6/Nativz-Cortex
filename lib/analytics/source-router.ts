// ZNA-01 T06: resolve which analytics source a (client, platform) tuple
// should pull from. Downstream PRDs (ZNA-02..06, SPY-08) read the result
// to attribute every metric back to its origin.
//
// Precedence:
//   1. Zernio if the client has an active social_profile for the platform
//      with a populated late_account_id (heuristic for "connected").
//   2. Scrape fallback for platforms supported by direct scrapers
//      (instagram, facebook).
//   3. Apify fallback (tiktok, youtube) — wraps Apify actors used by
//      existing audit scrapers.
//   4. Null if no profile row exists at all.
//
// The router never returns more than one source per call. The caller is
// responsible for handling the null case by skipping that (client,
// platform) pair on the current sync run.

import { createAdminClient } from '@/lib/supabase/admin';
import type {
  AnalyticsPlatform,
  AnalyticsSource,
  SourceResolution,
} from '@/lib/analytics/types';

const SCRAPE_SUPPORTED: ReadonlySet<AnalyticsPlatform> = new Set([
  'instagram',
  'facebook',
]);
const APIFY_SUPPORTED: ReadonlySet<AnalyticsPlatform> = new Set([
  'tiktok',
  'youtube',
]);

const ADAPTER_VERSIONS: Record<AnalyticsSource, string> = {
  zernio: 'zernio-v2',
  scrape: 'scrape-v1',
  apify: 'apify-v1',
};

export async function resolveAnalyticsSource(
  clientId: string,
  platform: AnalyticsPlatform,
): Promise<SourceResolution | null> {
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('social_profiles')
    .select('id, late_account_id')
    .eq('client_id', clientId)
    .eq('platform', platform)
    .maybeSingle();

  if (!profile) {
    return {
      source: 'scrape',
      source_version: ADAPTER_VERSIONS.scrape,
      reason: 'no_profile',
    };
  }

  const lateAccountId = (profile as { late_account_id: string | null })
    .late_account_id;
  if (lateAccountId && lateAccountId.trim().length > 0) {
    return {
      source: 'zernio',
      source_version: ADAPTER_VERSIONS.zernio,
      reason: 'zernio_connected',
    };
  }

  if (SCRAPE_SUPPORTED.has(platform)) {
    return {
      source: 'scrape',
      source_version: ADAPTER_VERSIONS.scrape,
      reason: 'scrape_fallback',
    };
  }

  if (APIFY_SUPPORTED.has(platform)) {
    return {
      source: 'apify',
      source_version: ADAPTER_VERSIONS.apify,
      reason: 'apify_fallback',
    };
  }

  return null;
}

export const __TEST__ = { SCRAPE_SUPPORTED, APIFY_SUPPORTED, ADAPTER_VERSIONS };
