// ---------------------------------------------------------------------------
// Full-Site Crawler — Discovers all pages, extracts products + brand info
// ---------------------------------------------------------------------------

import * as cheerio from 'cheerio';
import { extractProducts, extractColors, extractMeta } from './scrape-brand';
import { extractLogo } from './extract-logo';
import type { ScrapedBrand, ScrapedProduct } from './scrape-brand';

export interface CrawlResult {
  brand: ScrapedBrand;
  products: ScrapedProduct[];
  mediaUrls: string[];
  pagesCrawled: number;
}

interface CrawlOptions {
  signal?: AbortSignal;
  maxConcurrent?: number;
  timeoutMs?: number;
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const DEFAULT_MAX_CONCURRENT = 5;
const DEFAULT_TIMEOUT_MS = 240_000; // 240s wall-clock

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function crawlSite(url: string, options?: CrawlOptions): Promise<CrawlResult> {
  const {
    maxConcurrent = DEFAULT_MAX_CONCURRENT,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options ?? {};

  // Create a shared abort controller for the entire crawl
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Merge external signal if provided
  if (options?.signal) {
    options.signal.addEventListener('abort', () => controller.abort());
  }

  const signal = controller.signal;

  try {
    const origin = new URL(url).origin;

    // 1. Fetch homepage
    const homepageHtml = await fetchPage(url, signal);
    if (!homepageHtml) {
      throw new Error('Failed to fetch homepage');
    }

    // 2. Discover all internal links
    const discoveredUrls = new Set<string>([url]);

    // Extract links from homepage
    const homepageLinks = extractInternalLinks(homepageHtml, origin);
    for (const link of homepageLinks) {
      discoveredUrls.add(link);
    }

    // 3. Try sitemap.xml
    const sitemapUrls = await fetchSitemapUrls(origin, signal);
    for (const sitemapUrl of sitemapUrls) {
      discoveredUrls.add(sitemapUrl);
    }

    // 4. Crawl all discovered pages
    const allProducts: ScrapedProduct[] = [];
    const allMediaUrls = new Set<string>();
    const allColors = new Set<string>();
    let pagesCrawled = 1; // homepage already fetched

    // Process homepage first
    const homepageProducts = extractProducts(homepageHtml);
    allProducts.push(...homepageProducts);
    extractMediaUrls(homepageHtml, origin).forEach((u) => allMediaUrls.add(u));
    extractColors(homepageHtml).forEach((c) => allColors.add(c));

    // Crawl remaining pages with concurrency control
    const remainingUrls = [...discoveredUrls].filter((u) => u !== url);

    await runConcurrent(
      remainingUrls,
      maxConcurrent,
      async (pageUrl) => {
        if (signal.aborted) return;

        const html = await fetchPage(pageUrl, signal);
        if (!html) return;

        pagesCrawled++;

        // Extract products from this page
        const products = extractProducts(html);
        allProducts.push(...products);

        // Discover more links (second-level crawl)
        const newLinks = extractInternalLinks(html, origin);
        for (const link of newLinks) {
          discoveredUrls.add(link);
        }

        // Collect media
        extractMediaUrls(html, origin).forEach((u) => allMediaUrls.add(u));
        extractColors(html).forEach((c) => allColors.add(c));
      },
    );

    // 5. Extract logo from homepage
    const logoUrl = extractLogo(homepageHtml, url);

    // 6. Build brand info from homepage
    const name =
      extractMeta(homepageHtml, 'og:site_name') ??
      extractMeta(homepageHtml, 'og:title') ??
      extractTitle(homepageHtml) ??
      new URL(url).hostname.replace(/^www\./, '');

    const description =
      extractMeta(homepageHtml, 'og:description') ??
      extractMeta(homepageHtml, 'description') ??
      '';

    // 7. Deduplicate products
    const deduplicatedProducts = deduplicateProducts(allProducts);

    // 8. Merge homepage colors with crawled colors
    const finalColors = [...allColors]
      .filter((c) => !['#000', '#000000', '#fff', '#ffffff'].includes(c.toLowerCase()))
      .slice(0, 8);

    return {
      brand: {
        name,
        logoUrl: logoUrl?.replace(/^http:\/\//, 'https://') ?? null,
        colors: finalColors,
        description,
        url,
      },
      products: deduplicatedProducts.slice(0, 50),
      mediaUrls: [...allMediaUrls].slice(0, 100),
      pagesCrawled,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// URL discovery
// ---------------------------------------------------------------------------

function extractInternalLinks(html: string, origin: string): string[] {
  const $ = cheerio.load(html);
  const links = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    try {
      const resolved = new URL(href, origin);
      // Only same-origin links
      if (resolved.origin !== origin) return;
      // Skip anchors, mailto, tel, javascript
      if (resolved.hash && resolved.pathname === new URL(origin).pathname) return;
      if (/^(mailto|tel|javascript):/i.test(href)) return;
      // Skip common non-content paths
      if (/\.(pdf|zip|png|jpg|jpeg|gif|svg|webp|mp4|mp3|css|js)$/i.test(resolved.pathname)) return;
      if (/\/(wp-admin|wp-includes|cdn-cgi|_next)\//i.test(resolved.pathname)) return;

      // Normalize: remove trailing slash, remove fragment
      resolved.hash = '';
      const normalized = resolved.href.replace(/\/$/, '');
      links.add(normalized);
    } catch {
      // Invalid URL, skip
    }
  });

  return [...links];
}

async function fetchSitemapUrls(origin: string, signal: AbortSignal): Promise<string[]> {
  const urls: string[] = [];

  try {
    const sitemapUrl = `${origin}/sitemap.xml`;
    const res = await fetch(sitemapUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal,
    });

    if (!res.ok) return urls;

    const xml = await res.text();

    // Extract <loc> URLs from sitemap
    const locRegex = /<loc>([^<]+)<\/loc>/gi;
    let match;
    while ((match = locRegex.exec(xml)) !== null) {
      const loc = match[1].trim();
      // Check if it's a sub-sitemap
      if (loc.endsWith('.xml')) {
        try {
          const subRes = await fetch(loc, {
            headers: { 'User-Agent': USER_AGENT },
            signal,
          });
          if (subRes.ok) {
            const subXml = await subRes.text();
            let subMatch;
            const subLocRegex = /<loc>([^<]+)<\/loc>/gi;
            while ((subMatch = subLocRegex.exec(subXml)) !== null) {
              const subLoc = subMatch[1].trim();
              if (!subLoc.endsWith('.xml')) {
                urls.push(subLoc);
              }
            }
          }
        } catch {
          // Sub-sitemap fetch failed, skip
        }
      } else {
        urls.push(loc);
      }
    }
  } catch {
    // Sitemap not available
  }

  return urls;
}

// ---------------------------------------------------------------------------
// Media extraction
// ---------------------------------------------------------------------------

function extractMediaUrls(html: string, origin: string): string[] {
  const $ = cheerio.load(html);
  const urls: string[] = [];

  $('img[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (!src || src.startsWith('data:')) return;
    try {
      const resolved = new URL(src, origin).href.replace(/^http:\/\//, 'https://');
      const width = parseInt($(el).attr('width') ?? '0', 10);
      const height = parseInt($(el).attr('height') ?? '0', 10);
      if ((width > 0 && width < 50) || (height > 0 && height < 50)) return;
      urls.push(resolved);
    } catch {
      // Invalid URL
    }
  });

  return urls;
}

// ---------------------------------------------------------------------------
// Product deduplication
// ---------------------------------------------------------------------------

function deduplicateProducts(products: ScrapedProduct[]): ScrapedProduct[] {
  const unique: ScrapedProduct[] = [];

  for (const product of products) {
    if (!product.name || product.name.length < 3) continue;

    const isDuplicate = unique.some(
      (existing) => levenshteinRatio(
        existing.name.toLowerCase().trim(),
        product.name.toLowerCase().trim(),
      ) > 0.85,
    );

    if (!isDuplicate) {
      unique.push(product);
    }
  }

  return unique;
}

function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const maxLen = Math.max(a.length, b.length);
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[m][n];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchPage(url: string, signal: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
      signal,
      redirect: 'follow',
    });

    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('xhtml')) return null;

    return await res.text();
  } catch {
    return null;
  }
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

async function runConcurrent<T>(
  items: T[],
  maxConcurrent: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  let active = 0;
  let settled = 0;

  if (items.length === 0) return;

  return new Promise<void>((resolve) => {
    function next() {
      while (active < maxConcurrent && index < items.length) {
        const i = index++;
        active++;

        fn(items[i])
          .catch(() => {
            // Errors handled inside fn
          })
          .finally(() => {
            active--;
            settled++;
            if (settled === items.length) {
              resolve();
            } else {
              next();
            }
          });
      }
    }

    next();
  });
}
