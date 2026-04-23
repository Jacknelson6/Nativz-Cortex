/**
 * Ecom competitor scrape via Apify actor apify/e-commerce-scraping-tool
 * (actor id 2APbAvDfNDOWXbkWf). Passes one or more listing URLs (usually
 * the storefront root) and returns a normalized snapshot: product count +
 * top-product sample for Cortex's UI.
 *
 * Runs lazily — only call when the caller is ready to wait for the Apify
 * run (the cron or a manual refresh). The actor bills per result; we cap
 * `maxProductResults` so a single run is bounded.
 *
 * @see https://apify.com/apify/e-commerce-scraping-tool
 * @see https://console.apify.com/actors/2APbAvDfNDOWXbkWf
 */
import { runAndLogApifyActor } from '@/lib/tiktok/apify-run';

const DEFAULT_ACTOR = 'apify/e-commerce-scraping-tool';
const DEFAULT_MAX_PRODUCTS = 60;
const DEFAULT_MAX_WAIT_MS = 2 * 60 * 1000;
const DEFAULT_POLL_MS = 5_000;

function getActorId(): string {
  return (process.env.APIFY_ECOM_ACTOR_ID ?? DEFAULT_ACTOR).trim();
}

function maxProducts(): number {
  const raw = Number.parseInt(process.env.APIFY_ECOM_MAX_PRODUCTS ?? '', 10);
  if (Number.isInteger(raw) && raw > 0) return raw;
  return DEFAULT_MAX_PRODUCTS;
}

export interface EcomSnapshotProduct {
  title: string;
  url: string | null;
  price: number | null;
  currency: string | null;
  imageUrl: string | null;
  handle: string | null;
}

export interface EcomSnapshot {
  scrapedAt: string;
  productCount: number;
  topProducts: EcomSnapshotProduct[];
  signals: {
    currency: string | null;
    pricePercentiles: { p25: number | null; p50: number | null; p75: number | null };
  };
  source: 'apify_ecom';
}

function normaliseDomain(domain: string): string {
  const trimmed = domain.trim().toLowerCase();
  // Strip protocol + trailing slash
  return trimmed.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

/** Build the listing URL we hand to the Apify actor. */
export function listingUrlForDomain(domain: string): string {
  return `https://${normaliseDomain(domain)}`;
}

// ─── Dataset item normalisation ─────────────────────────────────────────────

type RawApifyProduct = {
  title?: string;
  name?: string;
  url?: string;
  productUrl?: string;
  link?: string;
  price?: number | string;
  currentPrice?: number | string;
  salePrice?: number | string;
  currency?: string;
  currencyCode?: string;
  image?: string;
  imageUrl?: string;
  images?: Array<{ url?: string } | string>;
  handle?: string;
  sku?: string;
};

function parsePrice(raw: number | string | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const cleaned = String(raw).replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}\b)/g, '');
  const normalised = cleaned.replace(',', '.');
  const num = Number.parseFloat(normalised);
  return Number.isFinite(num) ? num : null;
}

function firstImageUrl(item: RawApifyProduct): string | null {
  if (typeof item.imageUrl === 'string' && item.imageUrl) return item.imageUrl;
  if (typeof item.image === 'string' && item.image) return item.image;
  const images = item.images;
  if (Array.isArray(images) && images.length > 0) {
    const first = images[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object' && typeof first.url === 'string') return first.url;
  }
  return null;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx] ?? null;
}

export function normaliseEcomDatasetItems(items: unknown[]): EcomSnapshot {
  const products: EcomSnapshotProduct[] = [];
  let currency: string | null = null;
  const prices: number[] = [];

  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as RawApifyProduct;
    const title = item.title ?? item.name;
    if (!title || typeof title !== 'string') continue;

    const url = item.url ?? item.productUrl ?? item.link ?? null;
    const price =
      parsePrice(item.currentPrice) ??
      parsePrice(item.salePrice) ??
      parsePrice(item.price);
    const cur = (item.currency ?? item.currencyCode ?? null) as string | null;
    if (cur && !currency) currency = cur;
    if (price !== null) prices.push(price);

    products.push({
      title: title.trim(),
      url: typeof url === 'string' && url.length > 0 ? url : null,
      price,
      currency: cur ?? currency,
      imageUrl: firstImageUrl(item),
      handle: (item.handle ?? item.sku ?? null) as string | null,
    });
  }

  prices.sort((a, b) => a - b);
  return {
    scrapedAt: new Date().toISOString(),
    productCount: products.length,
    topProducts: products.slice(0, 12),
    signals: {
      currency,
      pricePercentiles: {
        p25: percentile(prices, 25),
        p50: percentile(prices, 50),
        p75: percentile(prices, 75),
      },
    },
    source: 'apify_ecom',
  };
}

// ─── Public entry ──────────────────────────────────────────────────────────

export async function scrapeEcomCompetitor(opts: {
  domain: string;
  listingUrls?: string[];
  maxWaitMs?: number;
}): Promise<EcomSnapshot | null> {
  const apiKey = process.env.APIFY_API_KEY?.trim();
  if (!apiKey) {
    console.error('[apify-ecom] APIFY_API_KEY not configured');
    return null;
  }

  const listingUrls =
    opts.listingUrls && opts.listingUrls.length > 0
      ? opts.listingUrls
      : [listingUrlForDomain(opts.domain)];

  const input = {
    listingUrls: listingUrls.map((url) => ({ url })),
    maxProductResults: maxProducts(),
    scrapeMode: 'Auto',
  };

  const { runId, items, succeeded } = await runAndLogApifyActor(
    getActorId(),
    input,
    apiKey,
    {
      maxWaitMs: opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS,
      pollIntervalMs: DEFAULT_POLL_MS,
      fetchLimit: maxProducts(),
      context: { purpose: 'ecom_shopify_scrape' },
    },
  );
  if (!runId || !succeeded) return null;
  return normaliseEcomDatasetItems(items);
}
