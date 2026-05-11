// VFF-03: per-brand discovery orchestrator.
//
// Reads brand_format_context, runs all three platforms in parallel via the
// 70/30 creator/keyword split, dedups via the platform_hash unique index,
// persists thumbnails, writes telemetry rows, and respects the daily budget
// ceiling (VFF_DAILY_VIDEOS_PER_BRAND).
//
// Called by:
//   - POST /api/cron/format-discovery (every 6h)
//   - POST /api/admin/formats/discover (ad hoc, per brand)

import { createAdminClient } from '@/lib/supabase/admin';
import { getBrandFormatSeeds } from '@/lib/analytics/brand-format-context';
import {
  discoverTikTokForCreators,
  discoverTikTokForKeywords,
} from '@/lib/analytics/sources/tiktok-discovery';
import {
  discoverInstagramForCreators,
  discoverInstagramForKeywords,
} from '@/lib/analytics/sources/instagram-discovery';
import {
  discoverYouTubeForCreators,
  discoverYouTubeForKeywords,
} from '@/lib/analytics/sources/youtube-discovery';
import { persistViralThumbnail } from '@/lib/analytics/persist-viral-thumbnail';
import type {
  DiscoveryPlatform,
  DiscoveredVideo,
  DiscoveryResult,
  DiscoverySignal,
} from '@/lib/analytics/discovery-types';

const DEFAULT_DAILY_CAP = 50;
const CREATOR_SHARE = 0.7; // D-01
const PER_CREATOR_LIMIT = 10;
const PER_KEYWORD_LIMIT = 10;

type PerPlatform = {
  inserted: number;
  deduped: number;
  failed: number;
  signal: DiscoverySignal;
  error?: string;
  cost_usd: number;
};

export type DiscoverForBrandOptions = {
  platforms?: DiscoveryPlatform[];
  dailyCap?: number;
};

export type DiscoverForBrandResult = {
  client_id: string;
  videos_attempted: number;
  videos_inserted: number;
  videos_deduped: number;
  total_apify_cost_usd: number;
  duration_ms: number;
  per_platform: Record<DiscoveryPlatform, PerPlatform>;
  errors: Array<{ client_id: string; platform: string; message: string }>;
  signal: DiscoverySignal;
};

function emptyPerPlatform(signal: DiscoverySignal = 'ok'): PerPlatform {
  return { inserted: 0, deduped: 0, failed: 0, signal, cost_usd: 0 };
}

async function logTelemetry(params: {
  clientId: string;
  platform: DiscoveryPlatform | 'all';
  success: boolean;
  apifyCostUsd: number;
  videosInserted: number;
  videosDeduped: number;
  signal: DiscoverySignal;
  errorMessage?: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('api_error_log').insert({
      route: 'vff_sourcing',
      method: 'POST',
      status_code: params.success ? 200 : 500,
      error_message: params.errorMessage ?? (params.success ? 'ok' : params.signal),
      request_meta: {
        client_id: params.clientId,
        platform: params.platform,
        apify_cost_usd: params.apifyCostUsd,
        videos_inserted: params.videosInserted,
        videos_deduped: params.videosDeduped,
        signal: params.signal,
      },
    });
  } catch {
    // Telemetry must never block the cron.
  }
}

async function todaysInsertedCount(clientId: string): Promise<number> {
  const admin = createAdminClient();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .from('api_error_log')
    .select('id', { count: 'exact', head: true })
    .eq('route', 'vff_sourcing')
    .eq('status_code', 200)
    .gte('created_at', startOfDay.toISOString())
    .contains('request_meta', { client_id: clientId });
  return count ?? 0;
}

async function upsertVideos(
  videos: DiscoveredVideo[],
  cap: number,
): Promise<{ inserted: number; deduped: number; rows: Array<{ id: string; platform: DiscoveryPlatform; external_post_id: string | null; thumbnail_source_url: string | null }> }> {
  if (videos.length === 0) return { inserted: 0, deduped: 0, rows: [] };
  const admin = createAdminClient();
  const limited = videos.slice(0, cap);

  // Insert with onConflict; need to detect inserted-vs-deduped. Easiest:
  // bulk-select existing hashes first, partition, insert only missing.
  const hashes = limited.map((v) => `${v.platform}::${v.source_url_hash}`);
  const { data: existing } = await admin
    .from('viral_videos')
    .select('platform, source_url_hash')
    .in('source_url_hash', limited.map((v) => v.source_url_hash));
  const existingSet = new Set(
    (existing ?? []).map(
      (r: { platform: string; source_url_hash: string }) =>
        `${r.platform}::${r.source_url_hash}`,
    ),
  );
  void hashes; // referenced for clarity; existing set built from per-platform pairs.

  const toInsert = limited.filter(
    (v) => !existingSet.has(`${v.platform}::${v.source_url_hash}`),
  );
  const deduped = limited.length - toInsert.length;

  if (toInsert.length === 0) return { inserted: 0, deduped, rows: [] };

  const insertPayload = toInsert.map((v) => ({
    platform: v.platform,
    source_url: v.source_url,
    source_url_hash: v.source_url_hash,
    external_post_id: v.external_post_id,
    creator_handle: v.creator_handle,
    creator_display_name: v.creator_display_name,
    thumbnail_source_url: v.thumbnail_source_url,
    duration_seconds: v.duration_seconds,
    views_count: v.views_count,
    likes_count: v.likes_count,
    comments_count: v.comments_count,
    shares_count: v.shares_count,
    posted_at: v.posted_at,
    raw_payload: v.raw_payload,
    analysis_status: 'pending',
  }));

  const { data: inserted, error } = await admin
    .from('viral_videos')
    .upsert(insertPayload, { onConflict: 'platform,source_url_hash', ignoreDuplicates: true })
    .select('id, platform, external_post_id, thumbnail_source_url');
  if (error) {
    console.warn('[vff] viral_videos upsert failed:', error.message);
    return { inserted: 0, deduped, rows: [] };
  }
  const rows = (inserted ?? []) as Array<{
    id: string;
    platform: DiscoveryPlatform;
    external_post_id: string | null;
    thumbnail_source_url: string | null;
  }>;
  return { inserted: rows.length, deduped, rows };
}

async function persistThumbnails(
  rows: Array<{ id: string; platform: DiscoveryPlatform; external_post_id: string | null; thumbnail_source_url: string | null }>,
): Promise<void> {
  if (rows.length === 0) return;
  const admin = createAdminClient();
  await Promise.all(
    rows.map(async (r) => {
      if (!r.thumbnail_source_url || !r.external_post_id) return;
      const result = await persistViralThumbnail(
        r.platform,
        r.external_post_id,
        r.thumbnail_source_url,
      );
      if (result.storage_url) {
        await admin
          .from('viral_videos')
          .update({
            thumbnail_storage_url: result.storage_url,
            thumbnail_persisted_at: new Date().toISOString(),
          })
          .eq('id', r.id);
      }
    }),
  );
}

function splitCap(cap: number): { creators: number; keywords: number } {
  const creators = Math.max(1, Math.round(cap * CREATOR_SHARE));
  const keywords = Math.max(0, cap - creators);
  return { creators, keywords };
}

async function runPlatform(
  platform: DiscoveryPlatform,
  creators: string[],
  keywords: string[],
  perPlatformCap: number,
): Promise<{ result: DiscoveryResult; combined: DiscoveredVideo[] }> {
  const { creators: creatorsCap, keywords: keywordsCap } = splitCap(perPlatformCap);
  const creatorJob = (async () => {
    if (creatorsCap === 0 || creators.length === 0) {
      return {
        videos: [],
        cost_usd: 0,
        signal: 'creators_empty' as DiscoverySignal,
      };
    }
    if (platform === 'tiktok') return discoverTikTokForCreators(creators, PER_CREATOR_LIMIT);
    if (platform === 'instagram') return discoverInstagramForCreators(creators, PER_CREATOR_LIMIT);
    return discoverYouTubeForCreators(creators, PER_CREATOR_LIMIT);
  })();
  const keywordJob = (async () => {
    if (keywordsCap === 0 || keywords.length === 0) {
      return {
        videos: [],
        cost_usd: 0,
        signal: 'keywords_empty' as DiscoverySignal,
      };
    }
    if (platform === 'tiktok') return discoverTikTokForKeywords(keywords, PER_KEYWORD_LIMIT);
    if (platform === 'instagram') return discoverInstagramForKeywords(keywords, PER_KEYWORD_LIMIT);
    return discoverYouTubeForKeywords(keywords, PER_KEYWORD_LIMIT);
  })();

  const [creatorRes, keywordRes] = await Promise.all([creatorJob, keywordJob]);
  const cost_usd = (creatorRes.cost_usd ?? 0) + (keywordRes.cost_usd ?? 0);
  const combined = [
    ...creatorRes.videos.slice(0, creatorsCap),
    ...keywordRes.videos.slice(0, keywordsCap),
  ];
  const signal: DiscoverySignal =
    creatorRes.signal === 'failed' && keywordRes.signal === 'failed'
      ? 'failed'
      : creatorRes.signal === 'quota_exhausted' || keywordRes.signal === 'quota_exhausted'
        ? 'quota_exhausted'
        : 'ok';
  const error = creatorRes.error ?? keywordRes.error;
  return {
    result: { videos: combined, cost_usd, signal, error },
    combined,
  };
}

export async function discoverForBrand(
  clientId: string,
  opts: DiscoverForBrandOptions = {},
): Promise<DiscoverForBrandResult> {
  const start = Date.now();
  const dailyCap =
    opts.dailyCap ??
    Number(process.env.VFF_DAILY_VIDEOS_PER_BRAND ?? '') ??
    DEFAULT_DAILY_CAP;
  const cap = Number.isFinite(dailyCap) && dailyCap > 0 ? dailyCap : DEFAULT_DAILY_CAP;

  const platforms: DiscoveryPlatform[] = opts.platforms ?? ['tiktok', 'instagram', 'youtube'];

  const result: DiscoverForBrandResult = {
    client_id: clientId,
    videos_attempted: 0,
    videos_inserted: 0,
    videos_deduped: 0,
    total_apify_cost_usd: 0,
    duration_ms: 0,
    per_platform: {
      tiktok: emptyPerPlatform('ok'),
      instagram: emptyPerPlatform('ok'),
      youtube: emptyPerPlatform('ok'),
    },
    errors: [],
    signal: 'ok',
  };

  const ctx = await getBrandFormatSeeds(clientId);
  if (!ctx) {
    await logTelemetry({
      clientId,
      platform: 'all',
      success: false,
      apifyCostUsd: 0,
      videosInserted: 0,
      videosDeduped: 0,
      signal: 'no_context',
    });
    result.signal = 'no_context';
    result.duration_ms = Date.now() - start;
    return result;
  }

  const seeds = (ctx.seed_terms ?? []).slice(0, 5);
  const creators = ctx.reference_creator_handles ?? {
    tiktok: [],
    instagram: [],
    youtube: [],
  };
  if (seeds.length === 0 && Object.values(creators).every((arr) => arr.length === 0)) {
    await logTelemetry({
      clientId,
      platform: 'all',
      success: false,
      apifyCostUsd: 0,
      videosInserted: 0,
      videosDeduped: 0,
      signal: 'no_context',
      errorMessage: 'no_signals',
    });
    result.signal = 'no_context';
    result.duration_ms = Date.now() - start;
    return result;
  }

  const alreadyInsertedToday = await todaysInsertedCount(clientId);
  if (alreadyInsertedToday >= cap) {
    await logTelemetry({
      clientId,
      platform: 'all',
      success: false,
      apifyCostUsd: 0,
      videosInserted: 0,
      videosDeduped: 0,
      signal: 'budget_capped',
    });
    result.signal = 'budget_capped';
    result.duration_ms = Date.now() - start;
    return result;
  }

  const remaining = cap - alreadyInsertedToday;
  const perPlatformCap = Math.max(1, Math.floor(remaining / platforms.length));

  for (const platform of platforms) {
    if (result.videos_inserted >= remaining) {
      result.per_platform[platform] = emptyPerPlatform('budget_capped');
      continue;
    }
    try {
      const { result: r, combined } = await runPlatform(
        platform,
        creators[platform] ?? [],
        seeds,
        perPlatformCap,
      );
      result.per_platform[platform].cost_usd = r.cost_usd;
      result.per_platform[platform].signal = r.signal;
      if (r.error) result.per_platform[platform].error = r.error;
      result.total_apify_cost_usd += r.cost_usd;
      result.videos_attempted += combined.length;

      if (combined.length === 0) {
        await logTelemetry({
          clientId,
          platform,
          success: r.signal !== 'failed',
          apifyCostUsd: r.cost_usd,
          videosInserted: 0,
          videosDeduped: 0,
          signal: r.signal,
          errorMessage: r.error,
        });
        continue;
      }

      const { inserted, deduped, rows } = await upsertVideos(
        combined,
        Math.max(0, remaining - result.videos_inserted),
      );
      result.per_platform[platform].inserted = inserted;
      result.per_platform[platform].deduped = deduped;
      result.videos_inserted += inserted;
      result.videos_deduped += deduped;

      // Fire-and-await thumbnail persistence so the surface is durable
      // before VFF-04 picks up the pending queue.
      await persistThumbnails(rows);

      await logTelemetry({
        clientId,
        platform,
        success: true,
        apifyCostUsd: r.cost_usd,
        videosInserted: inserted,
        videosDeduped: deduped,
        signal: r.signal,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'platform run failed';
      result.per_platform[platform].failed = 1;
      result.per_platform[platform].signal = 'failed';
      result.per_platform[platform].error = msg;
      result.errors.push({ client_id: clientId, platform, message: msg });
      await logTelemetry({
        clientId,
        platform,
        success: false,
        apifyCostUsd: 0,
        videosInserted: 0,
        videosDeduped: 0,
        signal: 'failed',
        errorMessage: msg,
      });
    }
  }

  result.duration_ms = Date.now() - start;
  return result;
}

export const __TEST__ = {
  splitCap,
  CREATOR_SHARE,
};
