/**
 * Live market data tools for TikTok Shop — FastMoss / Cruva flavor.
 *
 * Complements `lib/nerd/tools/analyses.ts` (which reads from searches
 * the user has already run). These tools let the agent pull fresh
 * industry-level data on demand:
 *
 *   - search_tiktok_shop_products_live(category, country)
 *       → Runs the affiliate-sales scraper for a fresh category query.
 *         No lemur enrichment (that's the heavy phase) — products +
 *         the affiliates promoting them + basic follower counts.
 *         Cheap ~$0.05-0.10, 30s wall time.
 *
 *   - enrich_tiktok_shop_creator_live(username, region)
 *       → Fetches / refreshes a single creator's full lemur enrichment
 *         and upserts to tiktok_shop_creator_snapshots. $0.005 + 5-10s.
 *
 * Both use a short-lived in-process cache so repeated calls in one
 * chat session don't re-spend. Cache is best-effort: it's scoped to
 * the serverless instance, so cross-instance calls re-scrape. That's
 * fine for this cost profile — when usage goes up we move to Supabase
 * with a TTL column.
 */

import { z } from 'zod';
import { ToolDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';
import { scrapeAffiliateProducts } from '@/lib/tiktok-shop/scrape-affiliate-products';
import { scrapeCreatorEnrichment } from '@/lib/tiktok-shop/scrape-creator-enrichment';
import type { AffiliateProduct, CreatorEnrichment } from '@/lib/tiktok-shop/types';

// ---------------------------------------------------------------------------
// In-memory cache (per-instance, short TTL)
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const productCache = new Map<string, CacheEntry<AffiliateProduct[]>>();
const PRODUCT_TTL_MS = 5 * 60 * 1000;
const CREATOR_FRESH_TTL_MS = 24 * 60 * 60 * 1000;

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const searchProductsLive: ToolDefinition = {
  name: 'search_tiktok_shop_products_live',
  description:
    'Run a fresh TikTok Shop category scrape — returns top products in the category plus the affiliate creators promoting each. Use when the user wants live industry data (what\'s selling right now in "skincare serum", who\'s promoting "phone cases", etc.) rather than asking about a search they already ran. Does NOT enrich creators with GMV/engagement — that\'s the heavier phase. For a full creator deep-dive, follow up with enrich_tiktok_shop_creator_live for specific usernames.',
  parameters: z.object({
    category: z.string().min(2).describe('Category keyword (e.g. "hair accessories", "skincare serum").'),
    country: z.string().regex(/^[A-Z]{2}$/).default('US').describe('ISO 3166-1 alpha-2 country code.'),
    max_products: z.number().int().min(1).max(10).default(5),
    max_affiliates_per_product: z.number().int().min(1).max(50).default(20),
  }),
  riskLevel: 'read',
  handler: async (params) => {
    const category = (params.category as string).trim();
    const country = ((params.country as string) ?? 'US').toUpperCase();
    const maxProducts = (params.max_products as number) ?? 5;
    const maxAffiliates = (params.max_affiliates_per_product as number) ?? 20;

    const cacheKey = `${country}::${category}::${maxProducts}::${maxAffiliates}`;
    const cached = getCached(productCache, cacheKey);
    if (cached) {
      return {
        success: true,
        data: {
          category,
          country,
          from_cache: true,
          products: cached,
          summary_markdown: summarizeProducts(category, country, cached, true),
        },
      };
    }

    try {
      const products = await scrapeAffiliateProducts({
        searchQuery: category,
        maxProducts,
        maxAffiliatesPerProduct: maxAffiliates,
        countryCode: country,
      });
      setCached(productCache, cacheKey, products, PRODUCT_TTL_MS);

      return {
        success: true,
        data: {
          category,
          country,
          from_cache: false,
          products,
          summary_markdown: summarizeProducts(category, country, products, false),
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to search TikTok Shop products',
      };
    }
  },
};

function summarizeProducts(
  category: string,
  country: string,
  products: AffiliateProduct[],
  fromCache: boolean,
): string {
  if (products.length === 0) {
    return `No products found for "${category}" in ${country}. Try a broader keyword.`;
  }
  const totalAffiliates = products.reduce((n, p) => n + p.affiliates.length, 0);
  const lines: string[] = [
    `## TikTok Shop · "${category}" (${country})${fromCache ? ' · cached' : ''}`,
    `${products.length} product${products.length === 1 ? '' : 's'}, ${totalAffiliates} affiliate entries.`,
    '',
  ];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const price = p.priceDisplay ?? (p.price != null ? `$${p.price}` : '—');
    const rating = p.rating != null ? ` · ${p.rating.toFixed(1)}★` : '';
    lines.push(`${i + 1}. **${p.name}** · ${price} · ${p.salesCount} sales${rating}`);
    lines.push(`   ${p.affiliates.length} affiliate creator${p.affiliates.length === 1 ? '' : 's'}`);
    const topAffiliates = p.affiliates
      .slice(0, 5)
      .map((a) => `@${a.username} (${formatCompact(a.followers)})`)
      .join(', ');
    if (topAffiliates) lines.push(`   Top: ${topAffiliates}`);
  }
  return lines.join('\n');
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const enrichCreatorLive: ToolDefinition = {
  name: 'enrich_tiktok_shop_creator_live',
  description:
    'Fetch a TikTok Shop creator\'s full lemur enrichment (GMV, engagement, demographics, brand collabs). Uses the cached snapshot if it\'s <24h old; otherwise re-runs lemur and updates the cache. Use after search_tiktok_shop_products_live surfaces interesting affiliates, or when the user asks about a specific creator you don\'t yet have data on.',
  parameters: z.object({
    username: z.string().min(1),
    region: z.string().regex(/^[A-Z]{2}$/).default('US'),
    force_refresh: z.boolean().default(false).describe('Re-run lemur even if a fresh snapshot exists.'),
  }),
  riskLevel: 'read',
  handler: async (params) => {
    const admin = createAdminClient();
    const handle = (params.username as string).replace(/^@/, '').trim().toLowerCase();
    const region = ((params.region as string) ?? 'US').toUpperCase();
    const forceRefresh = Boolean(params.force_refresh);

    if (!handle) return { success: false, error: 'username is required' };

    const { data: existing } = await admin
      .from('tiktok_shop_creator_snapshots')
      .select('username, data, fetched_at')
      .eq('username', handle)
      .maybeSingle();

    const fresh =
      existing?.fetched_at && Date.now() - new Date(existing.fetched_at).getTime() < CREATOR_FRESH_TTL_MS;

    if (existing && fresh && !forceRefresh) {
      const creator = existing.data as CreatorEnrichment;
      return {
        success: true,
        data: {
          username: handle,
          from_cache: true,
          fetched_at: existing.fetched_at,
          creator,
          summary_markdown: summarizeCreator(creator, true, existing.fetched_at),
        },
      };
    }

    try {
      const enrichment = await scrapeCreatorEnrichment(handle, region);
      if (!enrichment) {
        if (existing) {
          const creator = existing.data as CreatorEnrichment;
          return {
            success: true,
            data: {
              username: handle,
              from_cache: true,
              fetched_at: existing.fetched_at,
              creator,
              stale: true,
              note: 'Live refresh failed — returning last cached snapshot.',
              summary_markdown: summarizeCreator(creator, true, existing.fetched_at),
            },
          };
        }
        return { success: false, error: `No data returned for @${handle}` };
      }

      const now = new Date().toISOString();
      await admin
        .from('tiktok_shop_creator_snapshots')
        .upsert(
          {
            username: handle,
            nickname: enrichment.nickname,
            avatar_url: enrichment.avatarUrl,
            region: enrichment.region,
            bio: enrichment.bio,
            data: enrichment as unknown as Record<string, unknown>,
            fetched_at: now,
          },
          { onConflict: 'username' },
        );

      return {
        success: true,
        data: {
          username: handle,
          from_cache: false,
          fetched_at: now,
          creator: enrichment,
          summary_markdown: summarizeCreator(enrichment, false, now),
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Enrichment failed',
      };
    }
  },
};

function summarizeCreator(c: CreatorEnrichment, fromCache: boolean, fetchedAt: string): string {
  const s = c.stats;
  const engagementPct = (n: number): string => `${(n > 1 ? n : n * 100).toFixed(1)}%`;
  return [
    `## @${c.username}${c.nickname ? ` (${c.nickname})` : ''}${fromCache ? ' · cached' : ''}`,
    c.region ? `Region: ${c.region}` : null,
    c.bio ? `Bio: ${c.bio}` : null,
    '',
    `**GMV** · Total $${formatCompact(s.gmv.total)} · Video $${formatCompact(s.gmv.video)} · Live $${formatCompact(s.gmv.live)}`,
    `**Units sold (30d)** · ${formatCompact(s.unitsSold30d)}`,
    `**GPM** · $${s.gpm.toFixed(2)}`,
    `**Performance score** · ${s.performanceScore}/100`,
    `**Brand collabs** · ${s.brandCollabs}`,
    `**Promoted products** · ${s.promotedProducts}`,
    '',
    `**Engagement** · video ${engagementPct(s.engagementRate.video)} · live ${engagementPct(s.engagementRate.live)}`,
    `**Avg views** · video ${formatCompact(s.avgViews.video)} · live ${formatCompact(s.avgViews.live)}`,
    `**Posts (30d)** · ${s.contentFrequency.video} videos, ${s.contentFrequency.live} lives`,
    '',
    `_fetched ${new Date(fetchedAt).toLocaleString()}_`,
  ]
    .filter(Boolean)
    .join('\n');
}

export const tiktokShopMarketTools: ToolDefinition[] = [
  searchProductsLive,
  enrichCreatorLive,
];
