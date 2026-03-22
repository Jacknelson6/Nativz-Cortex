import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { buildRobotsPolicy } from './crawl-robots';
import { fetchTextOnce, fetchTextWithRetries, HostPacer } from './crawl-fetch';
import type { CrawledPage } from './types';

const USER_AGENT =
  'Mozilla/5.0 (compatible; NativzBot/1.0; +https://nativz.io) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 12_000;
const PACER_INITIAL_MS = 650;
const PACER_FLOOR_MS = 400;
const PACER_CAP_MS = 2200;
const MAX_CONTENT_LENGTH = 55_000;
const MIN_READABILITY_CHARS = 50;
const MIN_FALLBACK_CHARS = 40;
const SITEMAP_MAX_LOCS = 400;
const SITEMAP_NESTED_MAX = 6;

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN ?? '';

const PRIORITY_PATHS = [
  '/',
  '/about',
  '/about-us',
  '/our-story',
  '/who-we-are',
  '/company',
  '/mission',
  '/products',
  '/product',
  '/services',
  '/service',
  '/solutions',
  '/features',
  '/shop',
  '/store',
  '/collections',
  '/contact',
  '/contact-us',
  '/get-in-touch',
  '/blog',
  '/news',
  '/resources',
  '/pricing',
  '/plans',
  '/team',
  '/our-team',
  '/faq',
  '/faqs',
  '/industries',
  '/customers',
  '/case-studies',
];

const BLOCKED_PATH =
  /\/(?:cart|checkout|bag|basket|account|my-account|login|signin|sign-in|signup|sign-up|register|wp-admin|wp-login|oauth|authorize|password-reset|reset-password)(?:\/|$)/i;

/** Exported for tests — skip auth, cart, and admin flows. */
export function isBrandDnaCrawlExcluded(url: string): boolean {
  try {
    return BLOCKED_PATH.test(new URL(url).pathname);
  } catch {
    return true;
  }
}

/** Exported for tests — higher score is crawled sooner after the priority pass. */
export function brandDnaUrlCrawlPriority(url: string): number {
  try {
    const path = new URL(url).pathname.toLowerCase();
    let score = 0;
    if (/\/(about|our-story|mission|company|who-we-are|culture)/.test(path)) score += 32;
    if (/\/(product|service|solution|shop|collection|pricing|plan|feature)/.test(path)) score += 26;
    if (/\/(contact|support|demo|book)/.test(path)) score += 16;
    if (/\/(case-stud|customer|industr|portfolio)/.test(path)) score += 14;
    if (/\/(blog|news|resource|learn|guide|article)\b/.test(path)) score += 9;
    const depth = path.split('/').filter(Boolean).length;
    score -= Math.max(0, depth - 3) * 3;
    if (path.includes('tag/') || path.includes('category/') || path.includes('author/')) score -= 8;
    return score;
  } catch {
    return -100;
  }
}

function classifyPage(url: string, content: string): CrawledPage['pageType'] {
  const path = new URL(url).pathname.toLowerCase();
  if (path === '/' || path === '') return 'homepage';
  if (/\/(about|our-story|who-we-are|mission|company)/.test(path)) return 'about';
  if (/\/(product|service|shop|store|collection|pricing|plans|solution|feature)/.test(path)) return 'product';
  if (/\/(contact|get-in-touch|demo|book)/.test(path)) return 'contact';
  if (/\/(blog|news|resource|article|post|guide)/.test(path)) return 'blog';
  const lower = content.toLowerCase();
  if (lower.includes('add to cart') || lower.includes('buy now') || lower.includes('pricing')) return 'product';
  return 'other';
}

function isUrlAllowedByRobots(url: string, policy: ReturnType<typeof buildRobotsPolicy>): boolean {
  try {
    const path = new URL(url).pathname || '/';
    return policy.isPathAllowed(path);
  } catch {
    return false;
  }
}

function extractCanonicalUrl(html: string, pageUrl: string, origin: string): string | null {
  try {
    const dom = new JSDOM(html, { url: pageUrl });
    const doc = dom.window.document;
    let link: Element | null = doc.querySelector('link[rel="canonical"]');
    if (!link) {
      for (const el of doc.querySelectorAll('link[rel]')) {
        const tokens = el.getAttribute('rel')?.toLowerCase().split(/\s+/) ?? [];
        if (tokens.includes('canonical')) {
          link = el;
          break;
        }
      }
    }
    const href = link?.getAttribute('href')?.trim();
    if (!href) return null;
    const n = normalizeUrl(href, pageUrl);
    if (!n || !isSameDomain(n, origin)) return null;
    return n;
  } catch {
    return null;
  }
}

async function fetchWithCloudflare(url: string): Promise<string | null> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/browser-rendering/content`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      }
    );
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const json = await res.json();
      if (typeof json === 'object' && json !== null) {
        if (typeof json.result === 'string') return json.result;
        if (typeof json.html === 'string') return json.html;
      }
      return JSON.stringify(json);
    }
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPage(url: string, pacer: HostPacer): Promise<string | null> {
  await pacer.waitTurn();
  const cfHtml = await fetchWithCloudflare(url);
  pacer.recordComplete();
  if (cfHtml) {
    pacer.noteSuccess();
    return cfHtml;
  }
  return fetchTextWithRetries(url, {
    timeoutMs: FETCH_TIMEOUT_MS,
    pacer,
    userAgent: USER_AGENT,
    maxRetries: 2,
  });
}

function extractFallbackFromDocument(doc: Document, pageUrl: string): { title: string; content: string } | null {
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim();
  const docTitle = doc.querySelector('title')?.textContent?.trim();
  const title = (ogTitle || docTitle || new URL(pageUrl).pathname).slice(0, 220);

  const metaDesc =
    doc.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ||
    '';

  const selectors = ['main', '[role="main"]', '#main', '#content', '.main-content', 'article', '#primary'];
  let mainText = '';
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (!el) continue;
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script, style, noscript, svg, nav, footer, [aria-hidden="true"]').forEach((n) => n.remove());
    const t = clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (t.length > mainText.length) mainText = t;
  }

  if (mainText.length < MIN_FALLBACK_CHARS && doc.body) {
    const clone = doc.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script, style, noscript, svg, header, nav, footer').forEach((n) => n.remove());
    const t = clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (t.length > mainText.length) mainText = t;
  }

  const combined = [metaDesc, mainText].filter((s) => s.length > 0).join('\n\n').trim();
  if (combined.length < MIN_FALLBACK_CHARS) return null;

  return {
    title,
    content: combined.length > MAX_CONTENT_LENGTH ? combined.slice(0, MAX_CONTENT_LENGTH) : combined,
  };
}

function extractFromHtml(html: string, url: string): { title: string; content: string } | null {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  const reader = new Readability(doc);
  const article = reader.parse();
  const readableText = article?.textContent?.trim() ?? '';
  const readableTitle = article?.title?.trim() ?? '';

  if (readableText.length >= MIN_READABILITY_CHARS) {
    const title =
      readableTitle || doc.querySelector('title')?.textContent?.trim() || new URL(url).pathname;
    return {
      title: title.slice(0, 220),
      content:
        readableText.length > MAX_CONTENT_LENGTH ? readableText.slice(0, MAX_CONTENT_LENGTH) : readableText,
    };
  }

  return extractFallbackFromDocument(doc, url);
}

export function normalizeUrl(raw: string, base: string): string | null {
  try {
    const url = new URL(raw, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    let normalized = url.toString();
    if (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
    return normalized;
  } catch {
    return null;
  }
}

function isSameDomain(url: string, baseOrigin: string): boolean {
  try { return new URL(url).origin === baseOrigin; } catch { return false; }
}

function isPageUrl(url: string): boolean {
  try {
    if (isBrandDnaCrawlExcluded(url)) return false;
    const ext = new URL(url).pathname.split('.').pop()?.toLowerCase() ?? '';
    const skip = new Set([
      'jpg',
      'jpeg',
      'png',
      'gif',
      'svg',
      'webp',
      'ico',
      'pdf',
      'zip',
      'mp4',
      'mp3',
      'css',
      'js',
      'mjs',
      'json',
      'xml',
      'woff',
      'woff2',
      'ttf',
      'eot',
      'map',
    ]);
    return !skip.has(ext);
  } catch {
    return false;
  }
}

async function collectSitemapUrls(
  origin: string,
  visited: Set<string>,
  pacer: HostPacer,
  robotsPolicy: ReturnType<typeof buildRobotsPolicy>
): Promise<string[]> {
  const out: string[] = [];
  const seenLocs = new Set<string>();

  async function parseSitemapXml(xml: string, depth: number): Promise<void> {
    if (depth > 2 || out.length >= SITEMAP_MAX_LOCS) return;

    if (/<sitemapindex/i.test(xml)) {
      const locRe = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
      let m: RegExpExecArray | null;
      const nested: string[] = [];
      while ((m = locRe.exec(xml)) !== null && nested.length < SITEMAP_NESTED_MAX) {
        nested.push(m[1].trim());
      }
      for (const sub of nested) {
        if (out.length >= SITEMAP_MAX_LOCS) break;
        const nestedXml = await fetchTextWithRetries(sub, {
          timeoutMs: 15_000,
          pacer,
          userAgent: USER_AGENT,
          acceptXml: true,
          maxRetries: 1,
        });
        if (nestedXml && /<urlset|<url>/i.test(nestedXml)) {
          await parseSitemapXml(nestedXml, depth + 1);
        }
      }
      return;
    }

    const locRe = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
    let m: RegExpExecArray | null;
    while ((m = locRe.exec(xml)) !== null && out.length < SITEMAP_MAX_LOCS) {
      const loc = m[1].trim();
      if (seenLocs.has(loc)) continue;
      seenLocs.add(loc);
      const n = normalizeUrl(loc, origin);
      if (
        n &&
        isSameDomain(n, origin) &&
        isPageUrl(n) &&
        isUrlAllowedByRobots(n, robotsPolicy) &&
        !visited.has(n)
      ) {
        visited.add(n);
        out.push(n);
      }
    }
  }

  for (const path of ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml']) {
    if (out.length >= SITEMAP_MAX_LOCS) break;
    const raw = await fetchTextWithRetries(`${origin}${path}`, {
      timeoutMs: 14_000,
      pacer,
      userAgent: USER_AGENT,
      acceptXml: true,
      maxRetries: 1,
    });
    if (!raw || !/<urlset|<sitemapindex/i.test(raw)) continue;
    await parseSitemapXml(raw, 0);
    if (out.length > 0) break;
  }

  return out;
}

function mergeDiscoveredUrls(linkUrls: string[], sitemapUrls: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const u of [...sitemapUrls, ...linkUrls]) {
    if (seen.has(u)) continue;
    seen.add(u);
    merged.push(u);
  }
  merged.sort((a, b) => brandDnaUrlCrawlPriority(b) - brandDnaUrlCrawlPriority(a));
  return merged;
}

/**
 * Crawl a website for Brand DNA extraction.
 * Returns pages with raw HTML (for CSS/meta parsing) and extracted text content.
 * Tries priority paths, merges sitemap + link discovery, then crawls by relevance score.
 */
export async function crawlForBrandDNA(websiteUrl: string, maxPages = 30): Promise<CrawledPage[]> {
  const startUrl = normalizeUrl(websiteUrl, websiteUrl) ?? websiteUrl;
  const origin = new URL(startUrl).origin;
  const visited = new Set<string>();
  const seenContentKeys = new Set<string>();
  const pages: CrawledPage[] = [];

  const pacer = new HostPacer(PACER_INITIAL_MS, PACER_FLOOR_MS, PACER_CAP_MS);
  const robotsPolicy = await (async () => {
    await pacer.waitTurn();
    const res = await fetchTextOnce(`${origin}/robots.txt`, 8000, USER_AGENT, true);
    pacer.recordComplete();
    if (res.ok && res.text) return buildRobotsPolicy(res.text);
    return buildRobotsPolicy(null);
  })();
  pacer.setFloor(robotsPolicy.minIntervalMs);

  const priorityUrls: string[] = [];
  for (const path of PRIORITY_PATHS) {
    const url = normalizeUrl(path, origin);
    if (url && !visited.has(url) && isUrlAllowedByRobots(url, robotsPolicy)) {
      priorityUrls.push(url);
      visited.add(url);
    }
  }

  async function crawlOne(url: string): Promise<void> {
    if (pages.length >= maxPages) return;
    if (!isUrlAllowedByRobots(url, robotsPolicy)) return;
    const html = await fetchPage(url, pacer);
    if (!html) return;

    const canonical = extractCanonicalUrl(html, url, origin);
    const contentKey = normalizeUrl(canonical ?? url, canonical ?? url) ?? url;
    if (seenContentKeys.has(contentKey)) return;
    seenContentKeys.add(contentKey);

    const extracted = extractFromHtml(html, url);
    if (!extracted) return;

    pages.push({
      url,
      html,
      title: extracted.title,
      content: extracted.content,
      wordCount: extracted.content.split(/\s+/).filter(Boolean).length,
      pageType: classifyPage(url, extracted.content),
    });
  }

  for (const url of priorityUrls) {
    if (pages.length >= maxPages) break;
    await crawlOne(url);
  }

  const fromLinks: string[] = [];
  for (const page of pages) {
    const dom = new JSDOM(page.html, { url: page.url });
    const anchors = dom.window.document.querySelectorAll('a[href]');
    for (const a of anchors) {
      const href = a.getAttribute('href');
      if (!href) continue;
      const normalized = normalizeUrl(href, page.url);
      if (
        normalized &&
        isSameDomain(normalized, origin) &&
        isPageUrl(normalized) &&
        isUrlAllowedByRobots(normalized, robotsPolicy) &&
        !visited.has(normalized)
      ) {
        visited.add(normalized);
        fromLinks.push(normalized);
      }
    }
  }

  const fromSitemap = await collectSitemapUrls(origin, visited, pacer, robotsPolicy);
  const discovered = mergeDiscoveredUrls(fromLinks, fromSitemap);

  for (const url of discovered) {
    if (pages.length >= maxPages) break;
    if (pages.some((p) => p.url === url)) continue;
    await crawlOne(url);
  }

  return pages;
}
