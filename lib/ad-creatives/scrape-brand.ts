// ---------------------------------------------------------------------------
// Lightweight brand + product scraper for the ad wizard
// ---------------------------------------------------------------------------

import type { CrawledPage } from '@/lib/brand-dna/types';
import { dedupeHexList, cssColorToHex } from '@/lib/brand-dna/color-palette';
import { extractColorPalette, extractLogoUrls } from '@/lib/brand-dna/extract-visuals';
import { extractLogo } from './extract-logo';
import { extractRichProducts } from './extract-products-rich';
import { isJunkProductName } from './product-name-filters';

export type ScrapedBrand = {
  name: string;
  logoUrl: string | null;
  colors: string[];
  description: string;
  url: string;
};

export type ScrapedProduct = {
  name: string;
  imageUrl: string | null;
  description: string;
  price: string | null;
};

export type ScrapeBrandResult = {
  brand: ScrapedBrand;
  products: ScrapedProduct[];
};

/**
 * Fetches the given URL and extracts lightweight brand info + product listings.
 * This is NOT a full Brand DNA generation — just enough to populate the wizard.
 */
export async function scrapeBrandAndProducts(url: string): Promise<ScrapeBrandResult> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch URL (${res.status})`);
  }

  const html = await res.text();
  const brand = extractBrand(html, url);
  const products = extractProducts(html, url);

  // Rewrite http:// URLs to https:// for CSP compliance
  if (brand.logoUrl) {
    brand.logoUrl = brand.logoUrl.replace(/^http:\/\//, 'https://');
  }

  // Filter out non-product scrape artifacts and sanitize URLs
  const ARTIFACT_PATTERNS = /load video|play video|watch/i;
  const cleanProducts = products
    .filter((p) => isPlausibleProduct(p, ARTIFACT_PATTERNS))
    .map((p) => ({
      ...p,
      imageUrl: p.imageUrl ? p.imageUrl.replace(/^http:\/\//, 'https://') : null,
    }));

  return { brand, products: cleanProducts };
}

function isPlausibleProduct(p: ScrapedProduct, artifact: RegExp): boolean {
  if (p.name.length < 3 || artifact.test(p.name)) return false;
  if (isJunkProductName(p.name)) return false;
  if (p.imageUrl) return true;
  if (p.description && p.description.length >= 24) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Brand extraction
// ---------------------------------------------------------------------------

function extractBrand(html: string, url: string): ScrapedBrand {
  const name =
    extractMeta(html, 'og:site_name') ??
    extractMeta(html, 'og:title') ??
    extractTitle(html) ??
    new URL(url).hostname.replace(/^www\./, '');

  const crawled: CrawledPage = {
    url,
    html,
    title: extractTitle(html) ?? name,
    content: '',
    wordCount: 0,
    pageType: 'homepage',
  };

  const paletteHex = extractColorPalette([crawled]).map((c) => c.hex);
  const logoFromDom = extractLogo(html, url);
  const logoFromMeta =
    extractLogoUrls([crawled])
      .map((l) => l.url)
      .find(Boolean) ?? null;

  const logoUrl =
    logoFromDom ??
    logoFromMeta ??
    extractLinkIcon(html, url) ??
    extractMeta(html, 'og:image') ??
    null;

  const description =
    extractMeta(html, 'og:description') ??
    extractMeta(html, 'description') ??
    '';

  const colors = mergeColorLists(paletteHex, extractColors(html));

  return { name, logoUrl, colors, description, url };
}

function mergeColorLists(primary: string[], fallback: string[]): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const c of [...primary, ...fallback]) {
    const hex = cssColorToHex(c) ?? (c.startsWith('#') ? c.toLowerCase() : null);
    if (!hex) continue;
    const n = hex.toLowerCase();
    if (seen.has(n)) continue;
    seen.add(n);
    ordered.push(hex);
  }
  return dedupeHexList(ordered, 6);
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? decodeEntities(match[1].trim()) : null;
}

export function extractMeta(html: string, nameOrProperty: string): string | null {
  // Try property= (OG tags)
  const propRegex = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escapeRegex(nameOrProperty)}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  let match = html.match(propRegex);
  if (match) return decodeEntities(match[1].trim());

  // Try content= before property= (reversed attribute order)
  const reversedRegex = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapeRegex(nameOrProperty)}["']`,
    'i',
  );
  match = html.match(reversedRegex);
  if (match) return decodeEntities(match[1].trim());

  return null;
}

function extractLinkIcon(html: string, baseUrl: string): string | null {
  // Look for apple-touch-icon first (usually higher res), then icon
  const patterns = [
    /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon["']/i,
    /<link[^>]+rel=["']icon["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']icon["']/i,
    /<link[^>]+rel=["']shortcut icon["'][^>]+href=["']([^"']+)["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return resolveUrl(match[1], baseUrl);
    }
  }
  return null;
}

export function extractColors(html: string): string[] {
  const out: string[] = [];
  const push = (raw: string | null | undefined) => {
    const h = cssColorToHex(raw ?? '');
    if (h) out.push(h);
  };

  push(extractMeta(html, 'theme-color'));
  push(extractMeta(html, 'msapplication-TileColor'));

  const hexMatches = html.match(/#(?:[0-9a-fA-F]{3}){1,2}\b/g);
  if (hexMatches) {
    const skip = new Set(['#000', '#000000', '#fff', '#ffffff']);
    for (const c of [...new Set(hexMatches.map((x) => x.toLowerCase()))]) {
      if (skip.has(c)) continue;
      push(c);
      if (out.length >= 12) break;
    }
  }

  return dedupeHexList(out, 8);
}

// ---------------------------------------------------------------------------
// Product extraction
// ---------------------------------------------------------------------------

export function extractProducts(html: string, baseUrl: string): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];

  // 1. JSON-LD (highest signal)
  products.push(...extractJsonLdProducts(html, baseUrl));

  // 2. Microdata, WooCommerce-style cards, figures
  products.push(...extractRichProducts(html, baseUrl));

  // 3. OG product
  const ogProduct = extractOgProduct(html, baseUrl);
  if (ogProduct) products.push(ogProduct);

  // 4. Alt-text heuristics
  products.push(...extractHeuristicProducts(html, baseUrl));

  // Deduplicate by name
  const seen = new Set<string>();
  return products
    .filter((p) => {
      const key = p.name.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 30);
}

function normalizeJsonLdImage(image: unknown, baseUrl: string): string | null {
  if (image == null) return null;
  if (typeof image === 'string') {
    try {
      return new URL(image, baseUrl).href.replace(/^http:\/\//, 'https://');
    } catch {
      return null;
    }
  }
  if (Array.isArray(image)) {
    for (const entry of image) {
      const u = normalizeJsonLdImage(entry, baseUrl);
      if (u) return u;
    }
    return null;
  }
  if (typeof image === 'object' && image !== null && 'url' in image) {
    return normalizeJsonLdImage((image as { url: unknown }).url, baseUrl);
  }
  return null;
}

function extractJsonLdProducts(html: string, baseUrl: string): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : data['@graph'] ?? [data];

      for (const item of items) {
        if (
          item['@type'] === 'Product' ||
          item['@type'] === 'MenuItem' ||
          item['@type'] === 'IndividualProduct'
        ) {
          products.push({
            name: item.name ?? '',
            imageUrl: normalizeJsonLdImage(item.image, baseUrl),
            description: typeof item.description === 'string' ? item.description : '',
            price: extractJsonLdPrice(item),
          });
        }

        // Handle ItemList with products
        if (item['@type'] === 'ItemList' && Array.isArray(item.itemListElement)) {
          for (const listItem of item.itemListElement) {
            const product = listItem.item ?? listItem;
            if (product.name) {
              products.push({
                name: product.name,
                imageUrl: normalizeJsonLdImage(product.image, baseUrl),
                description: typeof product.description === 'string' ? product.description : '',
                price: extractJsonLdPrice(product),
              });
            }
          }
        }
      }
    } catch {
      // Invalid JSON-LD, skip
    }
  }

  return products;
}

function extractJsonLdPrice(item: Record<string, unknown>): string | null {
  const offers = item.offers as Record<string, unknown> | Record<string, unknown>[] | undefined;
  if (!offers) return null;

  const offer = Array.isArray(offers) ? offers[0] : offers;
  if (!offer) return null;

  const price = offer.price ?? offer.lowPrice;
  const currency = (offer.priceCurrency as string) ?? 'USD';

  if (price !== undefined && price !== null) {
    return `${currency} ${price}`;
  }
  return null;
}

function extractOgProduct(html: string, baseUrl: string): ScrapedProduct | null {
  const ogType = extractMeta(html, 'og:type');
  if (ogType !== 'product' && ogType !== 'og:product') return null;

  const name = extractMeta(html, 'og:title');
  if (!name) return null;

  const rawImg = extractMeta(html, 'og:image');
  let imageUrl: string | null = null;
  if (rawImg) {
    try {
      imageUrl = new URL(rawImg, baseUrl).href.replace(/^http:\/\//, 'https://');
    } catch {
      imageUrl = null;
    }
  }

  return {
    name,
    imageUrl,
    description: extractMeta(html, 'og:description') ?? '',
    price:
      extractMeta(html, 'product:price:amount') ??
      extractMeta(html, 'og:price:amount') ??
      null,
  };
}

function extractHeuristicProducts(html: string, baseUrl: string): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];

  // Look for images with alt text containing product-like keywords
  const imgRegex = /<img[^>]+alt=["']([^"']{5,80})["'][^>]+src=["']([^"']+)["'][^>]*>/gi;
  const imgRegexReversed = /<img[^>]+src=["']([^"']+)["'][^>]+alt=["']([^"']{5,80})["'][^>]*>/gi;

  const productKeywords = /product|shop|buy|price|item|collection|menu|dish|meal|offer/i;

  let imgMatch;
  while ((imgMatch = imgRegex.exec(html)) !== null) {
    const alt = decodeEntities(imgMatch[1]);
    if (productKeywords.test(alt) || productKeywords.test(getContext(html, imgMatch.index, 200))) {
      const resolved = resolveUrl(imgMatch[2], baseUrl).replace(/^http:\/\//, 'https://');
      products.push({
        name: alt,
        imageUrl: resolved,
        description: '',
        price: null,
      });
    }
  }

  while ((imgMatch = imgRegexReversed.exec(html)) !== null) {
    const alt = decodeEntities(imgMatch[2]);
    const src = imgMatch[1];
    if (
      !products.some((p) => p.imageUrl?.includes(src.slice(0, 40))) &&
      (productKeywords.test(alt) || productKeywords.test(getContext(html, imgMatch.index, 200)))
    ) {
      const resolved = resolveUrl(src, baseUrl).replace(/^http:\/\//, 'https://');
      products.push({
        name: alt,
        imageUrl: resolved,
        description: '',
        price: null,
      });
    }
  }

  return products;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getContext(html: string, index: number, range: number): string {
  const start = Math.max(0, index - range);
  const end = Math.min(html.length, index + range);
  return html.slice(start, end);
}
