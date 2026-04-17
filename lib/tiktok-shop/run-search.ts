/**
 * Full TikTok Shop category search pipeline.
 *
 *   1. Affiliate scraper → products with affiliates
 *   2. Deduplicate creators across all products
 *   3. Lemur enrichment (parallel, concurrency-limited)
 *   4. Cache enrichments to tiktok_shop_creator_snapshots
 *   5. Build ranked creator list with composite scores
 *   6. Persist results + flip status to `completed`
 *
 * Writes progress to `tiktok_shop_searches` so the poll endpoint can
 * show status/progress without WebSockets.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { scrapeAffiliateProducts } from './scrape-affiliate-products';
import {
  scrapeCreatorEnrichmentBatch,
} from './scrape-creator-enrichment';
import { buildRankedCreators } from './score';
import { pickPrimaryBenchmark, type CreatorCategory } from './taxonomy';
import type { CreatorEnrichment, SearchResults } from './types';

type AdminClient = ReturnType<typeof createAdminClient>;

export interface RunSearchOptions {
  maxProducts?: number;
  maxAffiliatesPerProduct?: number;
  minFollowers?: number;
  marketCountryCode?: string;
  clientId?: string | null;
}

async function persistCreatorSnapshots(
  admin: AdminClient,
  enrichments: Map<string, CreatorEnrichment>,
): Promise<void> {
  if (enrichments.size === 0) return;
  const rows = Array.from(enrichments.values()).map((e) => ({
    username: e.username.toLowerCase(),
    nickname: e.nickname,
    avatar_url: e.avatarUrl,
    region: e.region,
    bio: e.bio,
    data: e as unknown as Record<string, unknown>,
    fetched_at: new Date().toISOString(),
  }));

  const { error } = await admin
    .from('tiktok_shop_creator_snapshots')
    .upsert(rows, { onConflict: 'username' });
  if (error) {
    console.warn(`[tiktok-shop] creator snapshot upsert failed: ${error.message}`);
  }
}

export async function runTikTokShopSearch(
  searchId: string,
  query: string,
  options: RunSearchOptions = {},
): Promise<void> {
  const admin = createAdminClient();

  async function updateStatus(patch: Record<string, unknown>): Promise<void> {
    const { error } = await admin
      .from('tiktok_shop_searches')
      .update(patch)
      .eq('id', searchId);
    if (error) {
      console.warn(`[tiktok-shop] status update failed for ${searchId}: ${error.message}`);
    }
  }

  try {
    await updateStatus({ status: 'running' });

    // Phase 1: affiliate scraper
    const products = await scrapeAffiliateProducts({
      searchQuery: query,
      maxProducts: options.maxProducts,
      maxAffiliatesPerProduct: options.maxAffiliatesPerProduct,
      countryCode: options.marketCountryCode ?? 'US',
    });

    // Collect unique usernames (apply min-followers filter here so we
    // don't waste lemur runs on tiny accounts).
    const minFollowers = options.minFollowers ?? 0;
    const uniqueUsernames = new Set<string>();
    for (const product of products) {
      for (const affiliate of product.affiliates) {
        if (affiliate.followers < minFollowers) continue;
        uniqueUsernames.add(affiliate.username);
      }
    }

    await updateStatus({
      products_found: products.length,
      creators_found: uniqueUsernames.size,
    });

    // Phase 2: lemur enrichment (parallel)
    const usernames = Array.from(uniqueUsernames);
    const enrichments = await scrapeCreatorEnrichmentBatch(usernames, {
      concurrency: 5,
      region: options.marketCountryCode ?? 'US',
      onProgress: (done, total) => {
        if (done % 5 === 0 || done === total) {
          void updateStatus({ creators_enriched: done });
          console.log(`[tiktok-shop] enrichment progress: ${done}/${total}`);
        }
      },
    });

    // Phase 3: compose ranked creator list
    const ranked = buildRankedCreators(products, enrichments);

    // Cache snapshots for the creator deep-dive page
    await persistCreatorSnapshots(admin, enrichments);

    // Pick a regional benchmark to surface in the results header. We use
    // the top-3 creators' most-frequent canonical category as the signal —
    // if a plurality of high-rank creators are "Beauty & Personal Care",
    // we show the beauty-specific regional stat.
    const countryCode = options.marketCountryCode ?? 'US';
    const categoryVotes = new Map<CreatorCategory, number>();
    for (const c of ranked.slice(0, 5)) {
      for (const cat of c.categories) {
        categoryVotes.set(cat, (categoryVotes.get(cat) ?? 0) + 1);
      }
    }
    const sortedCategories = Array.from(categoryVotes.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => cat);
    const benchmark = pickPrimaryBenchmark(countryCode, sortedCategories);

    const results: SearchResults = {
      products,
      creators: ranked,
      primaryBenchmark: benchmark
        ? {
            countryCode,
            category: benchmark.category,
            gmvShare: benchmark.gmvShare,
            note: benchmark.note,
          }
        : null,
    };

    await updateStatus({
      status: 'completed',
      completed_at: new Date().toISOString(),
      creators_enriched: enrichments.size,
      results: results as unknown as Record<string, unknown>,
    });

    console.log(
      `[tiktok-shop] search ${searchId} done: ${products.length} products, ${ranked.length} creators (${enrichments.size} enriched)`,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[tiktok-shop] search ${searchId} failed:`, msg);
    await updateStatus({
      status: 'failed',
      error_message: msg.slice(0, 1000),
      completed_at: new Date().toISOString(),
    });
  }
}
