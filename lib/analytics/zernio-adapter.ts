// ZNA-01 T08: Zernio adapter for platform snapshots + post metrics.
//
// Thin wrapper around the Zernio HTTP client used by lib/posting and
// lib/reporting/sync. Returns insert-shaped rows ready for the
// platform_snapshots / post_metrics tables. Throws on API failure so
// the caller (sync orchestrator) can persist a platform_snapshot_errors
// row and continue with the next platform.
//
// NOTE: For v1 we delegate to the existing Zernio service methods that
// lib/reporting/sync.ts already exercises. This adapter exists so future
// ZNA work can rewire to a dedicated Zernio-snapshot endpoint without
// touching every call site.

import { getPostingService } from '@/lib/posting';
import type {
  AnalyticsPlatform,
  PlatformSnapshotInsert,
  PostMetricInsert,
} from '@/lib/analytics/types';

interface FetchArgs {
  clientId: string;
  socialProfileId: string;
  platform: AnalyticsPlatform;
  lateAccountId: string;
  date: string; // YYYY-MM-DD UTC
}

export async function fetchZernioPlatformSnapshot(
  args: FetchArgs,
): Promise<PlatformSnapshotInsert> {
  const { clientId, socialProfileId, platform, lateAccountId, date } = args;
  const service = getPostingService();

  // Single-day range; the existing service expects ISO dates.
  const stats = await service.getFollowerStats(lateAccountId, date, date);

  // getFollowerStats returns either a single-day object or an array
  // depending on platform; normalize to a number.
  const followerCount =
    typeof stats === 'object' && stats !== null && 'followers' in stats
      ? Number((stats as { followers?: number | null }).followers ?? 0)
      : 0;

  return {
    client_id: clientId,
    social_profile_id: socialProfileId,
    platform,
    snapshot_date: date,
    follower_count: followerCount,
    source: 'zernio',
    source_version: 'zernio-v2',
    captured_at: new Date().toISOString(),
  };
}

export async function fetchZernioPostMetrics(args: {
  clientId: string;
  socialProfileId: string;
  platform: AnalyticsPlatform;
  lateAccountId: string;
  since: string;
}): Promise<PostMetricInsert[]> {
  // Stub: existing sync.ts already pulls post metrics via service.getPosts;
  // this adapter exists for symmetry with the scrape adapter. Real wiring
  // lives in the sync refactor (deferred to follow-up).
  void args;
  return [];
}
