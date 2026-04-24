/**
 * POST /api/admin/scraper-settings/refresh-pricing
 *
 * Recomputes per-unit scraper pricing from real cost data and writes the
 * result to `scraper_unit_prices`. Two sources, in priority order:
 *
 *   1. `apify_runs` from the last 30 days — we take mean(cost_usd /
 *      dataset_items) per actor, weighted by dataset_items. This is the
 *      actual observed cost of a scrape unit on our workload.
 *   2. Apify's /v2/acts/{actorId} pricingInfos as a sanity check. If a run
 *      sample is thin (< 3 completed runs) we fall back to the posted actor
 *      price rather than trust a tiny sample.
 *
 * Actor → platform mapping is explicit — we have multiple actors per
 * platform (e.g. trudax + macrocosmos for Reddit) and pick whichever
 * provider is currently the default for our pipeline.
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  invalidateUnitPricesCache,
  DEFAULT_UNIT_PRICES,
  type UnitPrices,
} from '@/lib/search/scraper-settings';

export const dynamic = 'force-dynamic';

const APIFY_API_BASE = 'https://api.apify.com/v2';

type PlatformKey = keyof UnitPrices;

/**
 * Which actors we treat as authoritative for each platform's per-unit cost.
 * The primary wins when data is available; secondaries feed the refresh only
 * if the primary has no recent runs. Mirrors the provider routing in
 * `lib/reddit/apify-*.ts` and `lib/tiktok/apify-*.ts`.
 */
const PRIMARY_ACTOR: Record<Exclude<PlatformKey, 'refreshedAt'>, string> = {
  reddit: 'trudax/reddit-scraper-lite',
  youtube: 'streamers/youtube-scraper',
  tiktok: 'apidojo/tiktok-scraper',
  web: 'scraperlink/google-search-results-serp-scraper',
};

const FALLBACK_ACTORS: Record<Exclude<PlatformKey, 'refreshedAt'>, string[]> = {
  reddit: ['macrocosmos/reddit-scraper'],
  youtube: [],
  tiktok: ['apidojo/tiktok-profile-scraper'],
  web: [],
};

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };
  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users').select('role, is_super_admin').eq('id', user.id).single();
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    return { ok: false as const, status: 403 };
  }
  return { ok: true as const, admin, user };
}

interface ActorPriceSample {
  actorId: string;
  runs: number;
  avgCostPerItem: number;
  source: 'apify_runs' | 'apify_actor_spec' | 'default';
}

async function sampleFromApifyRuns(
  admin: ReturnType<typeof createAdminClient>,
  actorId: string,
): Promise<ActorPriceSample | null> {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data, error } = await admin
    .from('apify_runs')
    .select('cost_usd, dataset_items')
    .eq('actor_id', actorId)
    .eq('status', 'SUCCEEDED')
    .gt('dataset_items', 0)
    .gte('created_at', since);

  if (error || !data || data.length === 0) return null;

  // Weighted mean: sum(cost) / sum(items). Heavier runs dominate so one tiny
  // 2-item run doesn't skew a price we use against 200-item runs.
  let totalCost = 0;
  let totalItems = 0;
  for (const r of data) {
    totalCost += Number(r.cost_usd ?? 0);
    totalItems += Number(r.dataset_items ?? 0);
  }
  if (totalItems === 0) return null;

  return {
    actorId,
    runs: data.length,
    avgCostPerItem: totalCost / totalItems,
    source: 'apify_runs',
  };
}

async function sampleFromApifyActorSpec(
  actorId: string,
  apifyToken: string,
): Promise<ActorPriceSample | null> {
  try {
    // Apify actorId uses tilde format: username~actor-name
    const pathId = actorId.replace('/', '~');
    const res = await fetch(`${APIFY_API_BASE}/acts/${pathId}`, {
      headers: { Authorization: `Bearer ${apifyToken}` },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: { pricingInfos?: Array<{ unitPriceUsd?: number; pricePerUnitUsd?: number }> };
    };
    const priceInfo = body.data?.pricingInfos?.[0];
    const price = priceInfo?.unitPriceUsd ?? priceInfo?.pricePerUnitUsd ?? 0;
    if (!price) return null;
    return { actorId, runs: 0, avgCostPerItem: price, source: 'apify_actor_spec' };
  } catch {
    return null;
  }
}

async function resolvePlatformPrice(
  admin: ReturnType<typeof createAdminClient>,
  platform: Exclude<PlatformKey, 'refreshedAt'>,
  apifyToken: string | null,
): Promise<{ price: number; sample: ActorPriceSample | null }> {
  const candidates = [PRIMARY_ACTOR[platform], ...FALLBACK_ACTORS[platform]];

  for (const actorId of candidates) {
    const sample = await sampleFromApifyRuns(admin, actorId);
    if (sample && sample.runs >= 3) {
      return { price: sample.avgCostPerItem, sample };
    }
  }

  // Thin sample — try Apify's posted price for the primary actor.
  if (apifyToken) {
    const spec = await sampleFromApifyActorSpec(PRIMARY_ACTOR[platform], apifyToken);
    if (spec) return { price: spec.avgCostPerItem, sample: spec };
  }

  // One more pass — if we had ANY runs (even < 3), use them rather than a
  // hardcoded default. Lower confidence but still real-world data.
  for (const actorId of candidates) {
    const sample = await sampleFromApifyRuns(admin, actorId);
    if (sample) return { price: sample.avgCostPerItem, sample };
  }

  return {
    price: DEFAULT_UNIT_PRICES[platform],
    sample: { actorId: PRIMARY_ACTOR[platform], runs: 0, avgCostPerItem: DEFAULT_UNIT_PRICES[platform], source: 'default' },
  };
}

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? 'unauthorized' : 'forbidden' }, { status: auth.status });
  }

  const apifyToken = (process.env.APIFY_API_KEY ?? process.env.APIFY_API_TOKEN)?.trim() || null;

  const platforms: Array<Exclude<PlatformKey, 'refreshedAt'>> = ['reddit', 'youtube', 'tiktok', 'web'];
  const resolved = await Promise.all(
    platforms.map(async (p) => ({ platform: p, ...(await resolvePlatformPrice(auth.admin, p, apifyToken)) })),
  );

  const priceMap: Record<Exclude<PlatformKey, 'refreshedAt'>, number> = {
    reddit: 0,
    youtube: 0,
    tiktok: 0,
    web: 0,
  };
  const sourceMap: Record<string, { actor: string; runs: number; source: string; price: number }> = {};
  for (const r of resolved) {
    priceMap[r.platform] = Number(r.price.toFixed(6));
    sourceMap[r.platform] = {
      actor: r.sample?.actorId ?? PRIMARY_ACTOR[r.platform],
      runs: r.sample?.runs ?? 0,
      source: r.sample?.source ?? 'default',
      price: Number(r.price.toFixed(6)),
    };
  }

  const { error: upsertErr } = await auth.admin
    .from('scraper_unit_prices')
    .upsert(
      {
        id: 1,
        reddit_price_per_unit: priceMap.reddit,
        youtube_price_per_unit: priceMap.youtube,
        tiktok_price_per_unit: priceMap.tiktok,
        web_price_per_unit: priceMap.web,
        refreshed_at: new Date().toISOString(),
        source: sourceMap,
      },
      { onConflict: 'id' },
    );

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  invalidateUnitPricesCache();

  return NextResponse.json({
    prices: priceMap,
    source: sourceMap,
    refreshedAt: new Date().toISOString(),
  });
}
