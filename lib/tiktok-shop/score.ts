/**
 * Composite creator score for a TikTok Shop category search.
 *
 * Inputs span multiple value ranges (GMV in USD, followers in millions,
 * performance score 0-100, engagement rate 0-1). We normalize each
 * signal relative to the batch max, weight-sum them, and return 0-100.
 *
 * Weights reflect PRD priority: shop relevance + GMV lead, performance
 * rounds out quality, engagement + activity keep us honest about reach
 * vs. hype.
 */

import type { CreatorEnrichment, RankedCreator, AffiliateProduct } from './types';

interface ScoreInput {
  username: string;
  followers: number;
  categoryProductCount: number;
  enrichment: CreatorEnrichment | null;
}

/** Safe division — returns 0 if max <= 0 so we don't NaN on empty batches. */
function normalize(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}

export function scoreCreators(inputs: ScoreInput[]): Map<string, number> {
  if (inputs.length === 0) return new Map();

  // Batch-relative maxes. `max(1)` guards against log-like signals that
  // could legitimately be 0 across the batch.
  const maxShopRelevance = Math.max(1, ...inputs.map((i) => i.categoryProductCount));
  const maxGmvWeight = Math.max(
    1,
    ...inputs.map((i) => {
      if (!i.enrichment) return 0;
      return (i.enrichment.stats.gmv.total ?? 0) * (i.enrichment.stats.gpm ?? 0);
    }),
  );
  const maxEngagement = Math.max(
    1,
    ...inputs.map((i) => {
      if (!i.enrichment) return 0;
      const er = Math.max(
        i.enrichment.stats.engagementRate.video ?? 0,
        i.enrichment.stats.engagementRate.live ?? 0,
      );
      return er * i.followers;
    }),
  );
  const maxActivity = Math.max(
    1,
    ...inputs.map((i) => {
      if (!i.enrichment) return 0;
      const cf =
        (i.enrichment.stats.contentFrequency.video ?? 0) +
        (i.enrichment.stats.contentFrequency.live ?? 0);
      return cf + (i.enrichment.stats.unitsSold30d ?? 0);
    }),
  );

  const scores = new Map<string, number>();
  for (const i of inputs) {
    const shopRelevance = normalize(i.categoryProductCount, maxShopRelevance);

    let gmvWeight = 0;
    let performance = 0;
    let engagement = 0;
    let activity = 0;

    if (i.enrichment) {
      const s = i.enrichment.stats;
      gmvWeight = normalize(
        (s.gmv.total ?? 0) * (s.gpm ?? 0),
        maxGmvWeight,
      );
      performance = Math.max(0, Math.min(1, (s.performanceScore ?? 0) / 100));
      const er = Math.max(s.engagementRate.video ?? 0, s.engagementRate.live ?? 0);
      engagement = normalize(er * i.followers, maxEngagement);
      activity = normalize(
        (s.contentFrequency.video ?? 0) +
          (s.contentFrequency.live ?? 0) +
          (s.unitsSold30d ?? 0),
        maxActivity,
      );
    }

    // Weights sum to 1.0. Adjust here if the product feedback calls for it.
    const composite =
      shopRelevance * 0.25 +
      gmvWeight * 0.25 +
      performance * 0.2 +
      engagement * 0.15 +
      activity * 0.15;

    scores.set(i.username.toLowerCase(), Math.round(composite * 100));
  }

  return scores;
}

/**
 * Merge Phase 1 products + Phase 2 enrichments + scores into the ranked
 * creator list the UI consumes.
 */
export function buildRankedCreators(
  products: AffiliateProduct[],
  enrichments: Map<string, CreatorEnrichment>,
): RankedCreator[] {
  // Aggregate: username → { followers, nickname, products[], categoryProductCount }
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

  const scores = scoreCreators(scoreInputs);

  const ranked: RankedCreator[] = Array.from(byUsername.values()).map((agg) => {
    const enrichment = enrichments.get(agg.username.toLowerCase()) ?? null;
    return {
      username: agg.username,
      nickname: enrichment?.nickname ?? agg.nickname,
      avatarUrl: enrichment?.avatarUrl ?? null,
      followers: agg.followers,
      region: enrichment?.region ?? null,
      compositeScore: scores.get(agg.username.toLowerCase()) ?? 0,
      categoryProductCount: agg.productCount,
      stats: enrichment?.stats ?? null,
      products: agg.products,
    };
  });

  ranked.sort((a, b) => b.compositeScore - a.compositeScore || b.followers - a.followers);
  return ranked;
}
