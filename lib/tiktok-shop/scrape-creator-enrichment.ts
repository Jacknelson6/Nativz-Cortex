/**
 * Phase 2: call `lemur/tiktok-shop-creators` to enrich a single creator
 * username with GMV / engagement / demographics / category data.
 *
 * Input schema (confirmed public):
 *   - username (string, required) — TikTok handle (no @)
 *   - region (string, optional) — ISO 3166-2 country code
 *
 * Output shape (from actor docs):
 *   { username, nickname, avatar, region, bio, stats: {
 *       gmv: { total, video, live },
 *       unitsSold (30-day),
 *       gpm,
 *       commissionRange?, brandCollabs, promotedProducts,
 *       promotionPerformanceScore (0-100),
 *       engagementRate: { video, live },
 *       avgViews: { video, live },
 *       avgLikes: { video, live },
 *       avgComments: { video, live },
 *       contentFrequency: { video, live },
 *       followers: { topDemographics: { age[], gender[], location[] } },
 *       categories[], topBrands[], totalBrandCollaborations,
 *     } }
 *
 * Field naming isn't fully stable across actor versions so we try both
 * `snake_case` and `camelCase` variants and log raw keys on first hit.
 */

import {
  startApifyActorRun,
  waitForApifyRunSuccess,
  fetchApifyDatasetItems,
} from '@/lib/tiktok/apify-run';
import type { CreatorDemographic, CreatorEnrichment } from './types';

const ACTOR_ID = 'lemur/tiktok-shop-creators';

function getApifyKey(): string {
  const k = process.env.APIFY_API_KEY;
  if (!k) throw new Error('APIFY_API_KEY is required');
  return k;
}

interface RawDemographic {
  label?: string;
  name?: string;
  key?: string;
  pct?: number;
  percentage?: number;
  value?: number;
}

interface RawLemurStats {
  gmv?: { total?: number; video?: number; live?: number };
  unitsSold?: number;
  units_sold?: number;
  gpm?: number;
  commissionRange?: string;
  commission_range?: string;
  brandCollabs?: number;
  totalBrandCollaborations?: number;
  brand_collaborations?: number;
  promotedProducts?: number;
  promoted_products?: number;
  promotionPerformanceScore?: number;
  performance_score?: number;
  engagementRate?: { video?: number; live?: number };
  engagement_rate?: { video?: number; live?: number };
  avgViews?: { video?: number; live?: number };
  contentFrequency?: { video?: number; live?: number };
  content_frequency?: { video?: number; live?: number };
  followers?: {
    topDemographics?: {
      age?: RawDemographic[];
      gender?: RawDemographic[];
      location?: RawDemographic[];
    };
  };
  categories?: string[];
  category_ids?: string[];
}

interface RawLemurItem {
  username?: string;
  handle?: string;
  nickname?: string;
  displayName?: string;
  avatar?: string;
  avatar_url?: string;
  avatarUrl?: string;
  region?: string;
  country?: string;
  bio?: string;
  description?: string;
  stats?: RawLemurStats;
  error?: string;
}

function normDemo(raw: RawDemographic[] | undefined): CreatorDemographic[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => ({
      label: r.label ?? r.name ?? r.key ?? '',
      pct: r.pct ?? r.percentage ?? r.value ?? 0,
    }))
    .filter((d) => d.label);
}

export async function scrapeCreatorEnrichment(
  username: string,
  region: string = 'US',
): Promise<CreatorEnrichment | null> {
  const apiKey = getApifyKey();
  const handle = username.replace(/^@/, '').trim();
  if (!handle) return null;

  console.log(`[tiktok-shop] enriching @${handle} (region=${region})`);

  const runId = await startApifyActorRun(
    ACTOR_ID,
    { username: handle, region },
    apiKey,
  );
  if (!runId) return null;

  const ok = await waitForApifyRunSuccess(runId, apiKey, 60_000, 3_000);
  if (!ok) {
    console.warn(`[tiktok-shop] enrichment timed out for @${handle}`);
    return null;
  }

  const items = (await fetchApifyDatasetItems(runId, apiKey, 3)) as RawLemurItem[];
  if (items.length === 0) {
    console.warn(`[tiktok-shop] enrichment returned 0 items for @${handle}`);
    return null;
  }

  const raw = items[0];
  if (raw.error) {
    console.warn(`[tiktok-shop] enrichment error for @${handle}: ${raw.error}`);
    return null;
  }

  // Log raw keys once per run for drift detection.
  console.log(
    `[tiktok-shop] lemur raw keys for @${handle}: ${Object.keys(raw).join(', ')}`,
  );

  const s = raw.stats ?? {};
  const engagementRate = s.engagementRate ?? s.engagement_rate ?? {};
  const contentFrequency = s.contentFrequency ?? s.content_frequency ?? {};
  const demographics = s.followers?.topDemographics ?? {};

  return {
    username: raw.username ?? raw.handle ?? handle,
    nickname: raw.nickname ?? raw.displayName ?? null,
    avatarUrl: raw.avatarUrl ?? raw.avatar_url ?? raw.avatar ?? null,
    region: raw.region ?? raw.country ?? null,
    bio: raw.bio ?? raw.description ?? null,
    profileUrl: `https://www.tiktok.com/@${handle}`,
    stats: {
      gmv: {
        total: s.gmv?.total ?? 0,
        video: s.gmv?.video ?? 0,
        live: s.gmv?.live ?? 0,
      },
      unitsSold30d: s.unitsSold ?? s.units_sold ?? 0,
      gpm: s.gpm ?? 0,
      commissionRange: s.commissionRange ?? s.commission_range ?? null,
      brandCollabs:
        s.brandCollabs ??
        s.totalBrandCollaborations ??
        s.brand_collaborations ??
        0,
      promotedProducts: s.promotedProducts ?? s.promoted_products ?? 0,
      performanceScore:
        s.promotionPerformanceScore ?? s.performance_score ?? 0,
      engagementRate: {
        video: engagementRate.video ?? 0,
        live: engagementRate.live ?? 0,
      },
      avgViews: {
        video: s.avgViews?.video ?? 0,
        live: s.avgViews?.live ?? 0,
      },
      contentFrequency: {
        video: contentFrequency.video ?? 0,
        live: contentFrequency.live ?? 0,
      },
      demographics: {
        age: normDemo(demographics.age),
        gender: normDemo(demographics.gender),
        location: normDemo(demographics.location),
      },
      categoryIds: s.categories ?? s.category_ids ?? [],
    },
    raw,
  };
}

/**
 * Enrich a batch of usernames with bounded parallelism. Each lemur run
 * takes 5-10s; 5-way concurrency keeps 30 creators at ~30-60s wall time.
 */
export async function scrapeCreatorEnrichmentBatch(
  usernames: string[],
  opts?: { concurrency?: number; region?: string; onProgress?: (done: number, total: number) => void },
): Promise<Map<string, CreatorEnrichment>> {
  const concurrency = opts?.concurrency ?? 5;
  const region = opts?.region ?? 'US';
  const results = new Map<string, CreatorEnrichment>();
  let done = 0;

  // Simple concurrency-limited runner.
  let index = 0;
  async function worker(): Promise<void> {
    while (index < usernames.length) {
      const i = index++;
      const handle = usernames[i];
      try {
        const enrichment = await scrapeCreatorEnrichment(handle, region);
        if (enrichment) {
          results.set(enrichment.username.toLowerCase(), enrichment);
        }
      } catch (e) {
        console.warn(`[tiktok-shop] enrichment failed for @${handle}:`, e);
      } finally {
        done++;
        opts?.onProgress?.(done, usernames.length);
      }
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, usernames.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return results;
}
