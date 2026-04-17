/**
 * Composite ranking for TikTok Shop category searches.
 *
 * Mirrors the two-axis convention FastMoss + YooFinds use on their
 * profile pages:
 *
 *   - Traffic Index (0–100)        — reach + activity + engagement
 *   - E-commerce Potential (0–100) — conversion + GMV + brand trust
 *
 * We then blend the two into an overall `compositeScore` that's still
 * sortable, so the results table works one of three ways:
 *   - sort by Composite (default)
 *   - sort by Traffic
 *   - sort by E-commerce Potential
 *
 * All three are 0–100 and batch-normalized, so different categories
 * still produce meaningful comparisons within a single search.
 */

import type { AffiliateProduct, CreatorEnrichment, RankedCreator } from './types';
import { classifyAccountType } from './account-type';
import { normalizeCreatorCategories } from './taxonomy';

interface ScoreInput {
  username: string;
  followers: number;
  categoryProductCount: number;
  enrichment: CreatorEnrichment | null;
}

interface CreatorIndices {
  trafficIndex: number;
  ecommercePotentialIndex: number;
  compositeScore: number;
}

/** Safe division — returns 0 if max ≤ 0 so we never NaN on empty batches. */
function normalize(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}

/**
 * Traffic Index components — batch-normalized signals of reach.
 *   - engagement × followers (reach-weighted interaction)
 *   - avg views per post (raw reach)
 *   - content frequency (posting cadence)
 */
function trafficIndexFor(i: ScoreInput, maxes: BatchMaxes): number {
  if (!i.enrichment) return 0;
  const s = i.enrichment.stats;
  const bestEngagementRate = Math.max(
    s.engagementRate.video ?? 0,
    s.engagementRate.live ?? 0,
  );
  const engagementReach = bestEngagementRate * i.followers;
  const avgViews = Math.max(s.avgViews.video ?? 0, s.avgViews.live ?? 0);
  const frequency = (s.contentFrequency.video ?? 0) + (s.contentFrequency.live ?? 0);

  const blend =
    normalize(engagementReach, maxes.engagementReach) * 0.45 +
    normalize(avgViews, maxes.avgViews) * 0.35 +
    normalize(frequency, maxes.frequency) * 0.2;

  return Math.round(blend * 100);
}

/**
 * E-commerce Potential components — batch-normalized signals of
 * conversion strength.
 *   - total GMV
 *   - GPM (GMV per thousand views)
 *   - promotion performance score (0–100 directly)
 *   - brand collaborations (trust + portfolio)
 *   - units sold in the last 30 days (recent commercial traction)
 */
function ecommercePotentialFor(i: ScoreInput, maxes: BatchMaxes): number {
  if (!i.enrichment) return 0;
  const s = i.enrichment.stats;
  const blend =
    normalize(s.gmv.total ?? 0, maxes.gmvTotal) * 0.3 +
    normalize(s.gpm ?? 0, maxes.gpm) * 0.2 +
    Math.max(0, Math.min(1, (s.performanceScore ?? 0) / 100)) * 0.2 +
    normalize(s.brandCollabs ?? 0, maxes.brandCollabs) * 0.15 +
    normalize(s.unitsSold30d ?? 0, maxes.unitsSold) * 0.15;

  return Math.round(blend * 100);
}

interface BatchMaxes {
  engagementReach: number;
  avgViews: number;
  frequency: number;
  gmvTotal: number;
  gpm: number;
  brandCollabs: number;
  unitsSold: number;
  shopRelevance: number;
}

function computeMaxes(inputs: ScoreInput[]): BatchMaxes {
  const zero = (): number => 1;
  const maxes: BatchMaxes = {
    engagementReach: zero(),
    avgViews: zero(),
    frequency: zero(),
    gmvTotal: zero(),
    gpm: zero(),
    brandCollabs: zero(),
    unitsSold: zero(),
    shopRelevance: zero(),
  };
  for (const i of inputs) {
    maxes.shopRelevance = Math.max(maxes.shopRelevance, i.categoryProductCount);
    if (!i.enrichment) continue;
    const s = i.enrichment.stats;
    const bestEr = Math.max(s.engagementRate.video ?? 0, s.engagementRate.live ?? 0);
    maxes.engagementReach = Math.max(maxes.engagementReach, bestEr * i.followers);
    maxes.avgViews = Math.max(maxes.avgViews, Math.max(s.avgViews.video ?? 0, s.avgViews.live ?? 0));
    maxes.frequency = Math.max(
      maxes.frequency,
      (s.contentFrequency.video ?? 0) + (s.contentFrequency.live ?? 0),
    );
    maxes.gmvTotal = Math.max(maxes.gmvTotal, s.gmv.total ?? 0);
    maxes.gpm = Math.max(maxes.gpm, s.gpm ?? 0);
    maxes.brandCollabs = Math.max(maxes.brandCollabs, s.brandCollabs ?? 0);
    maxes.unitsSold = Math.max(maxes.unitsSold, s.unitsSold30d ?? 0);
  }
  return maxes;
}

/**
 * Compute per-creator indices. Returns a map keyed by lower-case
 * username so callers can join back to the ranking aggregation.
 */
export function computeCreatorIndices(inputs: ScoreInput[]): Map<string, CreatorIndices> {
  if (inputs.length === 0) return new Map();
  const maxes = computeMaxes(inputs);

  const out = new Map<string, CreatorIndices>();
  for (const i of inputs) {
    const trafficIndex = trafficIndexFor(i, maxes);
    const ecommercePotentialIndex = ecommercePotentialFor(i, maxes);
    // Shop relevance (how many products in this search the creator
    // appears on) tips the composite toward creators whose footprint
    // matches the specific category that was queried. Kept separate so
    // the Traffic / E-commerce indices remain profile-level signals.
    const shopRelevance = normalize(i.categoryProductCount, maxes.shopRelevance);
    const composite =
      shopRelevance * 0.25 +
      (trafficIndex / 100) * 0.35 +
      (ecommercePotentialIndex / 100) * 0.4;

    out.set(i.username.toLowerCase(), {
      trafficIndex,
      ecommercePotentialIndex,
      compositeScore: Math.round(composite * 100),
    });
  }
  return out;
}

/**
 * Merge Phase 1 products + Phase 2 enrichments + scores + derived
 * metadata (account type, canonical categories) into the ranked
 * creator list the UI consumes.
 */
export function buildRankedCreators(
  products: AffiliateProduct[],
  enrichments: Map<string, CreatorEnrichment>,
): RankedCreator[] {
  interface Agg {
    username: string;
    nickname: string | null;
    followers: number;
    productCount: number;
    products: RankedCreator['products'];
  }

  const byUsername = new Map<string, Agg>();

  for (const product of products) {
    for (const affiliate of product.affiliates) {
      const key = affiliate.username.toLowerCase();
      const existing = byUsername.get(key);
      const productEntry: RankedCreator['products'][number] = {
        name: product.name,
        price: product.price,
        priceDisplay: product.priceDisplay,
        salesCount: product.salesCount,
        rating: product.rating,
        productUrl: product.productUrl,
      };
      if (existing) {
        existing.productCount += 1;
        existing.products.push(productEntry);
        if (!existing.nickname && affiliate.nickname) existing.nickname = affiliate.nickname;
        if (affiliate.followers > existing.followers) existing.followers = affiliate.followers;
      } else {
        byUsername.set(key, {
          username: affiliate.username,
          nickname: affiliate.nickname,
          followers: affiliate.followers,
          productCount: 1,
          products: [productEntry],
        });
      }
    }
  }

  const scoreInputs: ScoreInput[] = Array.from(byUsername.values()).map((agg) => ({
    username: agg.username,
    followers: agg.followers,
    categoryProductCount: agg.productCount,
    enrichment: enrichments.get(agg.username.toLowerCase()) ?? null,
  }));

  const indices = computeCreatorIndices(scoreInputs);

  const ranked: RankedCreator[] = Array.from(byUsername.values()).map((agg) => {
    const enrichment = enrichments.get(agg.username.toLowerCase()) ?? null;
    const scored = indices.get(agg.username.toLowerCase());
    const accountType = classifyAccountType({
      username: agg.username,
      nickname: enrichment?.nickname ?? agg.nickname,
      bio: enrichment?.bio ?? null,
      enrichment,
    });
    const categories = normalizeCreatorCategories(enrichment?.stats.categoryIds);

    return {
      username: agg.username,
      nickname: enrichment?.nickname ?? agg.nickname,
      avatarUrl: enrichment?.avatarUrl ?? null,
      followers: agg.followers,
      region: enrichment?.region ?? null,
      compositeScore: scored?.compositeScore ?? 0,
      trafficIndex: scored?.trafficIndex ?? 0,
      ecommercePotentialIndex: scored?.ecommercePotentialIndex ?? 0,
      categoryProductCount: agg.productCount,
      accountType,
      categories,
      stats: enrichment?.stats ?? null,
      products: agg.products,
    };
  });

  ranked.sort((a, b) => b.compositeScore - a.compositeScore || b.followers - a.followers);
  return ranked;
}
