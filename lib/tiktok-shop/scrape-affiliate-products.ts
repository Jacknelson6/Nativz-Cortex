/**
 * Phase 1: call `george.the.developer/tiktok-shop-affiliate-sales-scraper`
 * to discover products matching a category keyword plus the affiliates
 * promoting each product.
 *
 * Input schema (confirmed from the actor's public input-schema page):
 *   - searchQuery (string) — beta discovery mode
 *   - market: { countryCode, locale, timezoneId, currency } — defaults US
 *   - maxProducts (int, max 10)
 *   - maxAffiliatesPerProduct (int, max 100)
 *
 * Output shape isn't exhaustively documented, so we read defensively
 * (multiple naming variants) and log the raw first item on each run
 * for drift detection.
 */

import {
  startApifyActorRun,
  waitForApifyRunSuccess,
  fetchApifyDatasetItems,
} from '@/lib/tiktok/apify-run';
import type { AffiliateCreator, AffiliateProduct } from './types';

const ACTOR_ID = 'george.the.developer/tiktok-shop-affiliate-sales-scraper';

export interface ScrapeAffiliateProductsParams {
  searchQuery: string;
  maxProducts?: number;
  maxAffiliatesPerProduct?: number;
  countryCode?: string;
}

interface RawAffiliateItem {
  username?: string;
  handle?: string;
  creatorName?: string;
  nickname?: string;
  displayName?: string;
  followerCount?: number;
  followers?: number;
  isVerified?: boolean;
  verified?: boolean;
  hasCommission?: boolean;
  commission?: boolean;
}

interface RawProductItem {
  productUrl?: string;
  url?: string;
  productId?: string;
  id?: string;
  name?: string;
  title?: string;
  price?: number | string;
  priceDisplay?: string;
  priceText?: string;
  salesCount?: number;
  sales?: number;
  rating?: number;
  stars?: number;
  thumbnailUrl?: string;
  thumbnail?: string;
  image?: string;
  affiliates?: RawAffiliateItem[];
  creators?: RawAffiliateItem[];
}

function getApifyKey(): string {
  const k = process.env.APIFY_API_KEY;
  if (!k) throw new Error('APIFY_API_KEY is required for TikTok Shop scraping');
  return k;
}

function pickAffiliateUsername(raw: RawAffiliateItem): string | null {
  const candidate =
    raw.username ??
    raw.handle ??
    raw.creatorName ??
    raw.displayName ??
    null;
  if (!candidate) return null;
  return candidate.replace(/^@/, '').trim() || null;
}

function normalizeAffiliates(raw: RawAffiliateItem[] | undefined): AffiliateCreator[] {
  if (!Array.isArray(raw)) return [];
  const out: AffiliateCreator[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const username = pickAffiliateUsername(r);
    if (!username || seen.has(username)) continue;
    seen.add(username);
    out.push({
      username,
      nickname: r.nickname ?? r.displayName ?? r.creatorName ?? null,
      followers: r.followerCount ?? r.followers ?? 0,
      isVerified: Boolean(r.isVerified ?? r.verified),
      hasCommission: Boolean(r.hasCommission ?? r.commission),
    });
  }
  return out;
}

function normalizeProduct(raw: RawProductItem): AffiliateProduct | null {
  const productUrl = raw.productUrl ?? raw.url;
  if (!productUrl) return null;
  const priceNumber =
    typeof raw.price === 'number'
      ? raw.price
      : typeof raw.price === 'string' && raw.price.match(/[0-9.]+/)
        ? Number(raw.price.match(/[0-9.]+/)![0])
        : null;
  return {
    productUrl,
    productId: raw.productId ?? raw.id ?? null,
    name: raw.name ?? raw.title ?? '(unnamed product)',
    price: priceNumber,
    priceDisplay:
      raw.priceDisplay ??
      raw.priceText ??
      (typeof raw.price === 'string' ? raw.price : priceNumber !== null ? `$${priceNumber}` : null),
    salesCount: raw.salesCount ?? raw.sales ?? 0,
    rating: raw.rating ?? raw.stars ?? null,
    thumbnailUrl: raw.thumbnailUrl ?? raw.thumbnail ?? raw.image ?? null,
    affiliates: normalizeAffiliates(raw.affiliates ?? raw.creators),
  };
}

export async function scrapeAffiliateProducts(
  params: ScrapeAffiliateProductsParams,
): Promise<AffiliateProduct[]> {
  const apiKey = getApifyKey();
  const maxProducts = Math.min(10, Math.max(1, params.maxProducts ?? 5));
  const maxAffiliatesPerProduct = Math.min(
    100,
    Math.max(1, params.maxAffiliatesPerProduct ?? 20),
  );

  console.log(
    `[tiktok-shop] affiliate products: query="${params.searchQuery}" maxProducts=${maxProducts} maxAffiliates=${maxAffiliatesPerProduct}`,
  );

  const runId = await startApifyActorRun(
    ACTOR_ID,
    {
      searchQuery: params.searchQuery,
      market: {
        countryCode: params.countryCode ?? 'US',
        locale: 'en-US',
        timezoneId: 'America/New_York',
        currency: 'USD',
      },
      maxProducts,
      maxAffiliatesPerProduct,
    },
    apiKey,
  );

  if (!runId) {
    throw new Error(`Failed to start ${ACTOR_ID}`);
  }

  const ok = await waitForApifyRunSuccess(runId, apiKey, 180_000, 4_000);
  if (!ok) {
    throw new Error(`Affiliate scraper run did not succeed (timed out or failed)`);
  }

  const items = (await fetchApifyDatasetItems(runId, apiKey, 50)) as RawProductItem[];
  if (items.length > 0) {
    console.log(
      `[tiktok-shop] affiliate scraper raw keys: ${Object.keys(items[0]).join(', ')}`,
    );
  }

  const products: AffiliateProduct[] = [];
  for (const raw of items) {
    const normalized = normalizeProduct(raw);
    if (normalized) products.push(normalized);
  }

  console.log(
    `[tiktok-shop] affiliate products: got ${products.length} product(s), ${products.reduce((n, p) => n + p.affiliates.length, 0)} affiliate entries`,
  );
  return products;
}
