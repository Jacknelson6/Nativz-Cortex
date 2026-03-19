import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import type { CrawledPage } from './types';

const USER_AGENT = 'Mozilla/5.0 (compatible; NativzBot/1.0)';
const FETCH_TIMEOUT_MS = 10_000;
const DELAY_MS = 800;
const MAX_CONTENT_LENGTH = 50_000;

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN ?? '';

// Pages to prioritize for Brand DNA extraction
const PRIORITY_PATHS = [
  '/',
  '/about', '/about-us', '/our-story', '/who-we-are',
  '/products', '/services', '/shop', '/store', '/collections',
  '/contact', '/contact-us',
  '/blog', '/news', '/resources',
  '/pricing', '/plans',
  '/team', '/our-team',
  '/faq', '/faqs',
];

function classifyPage(url: string, content: string): CrawledPage['pageType'] {
  const path = new URL(url).pathname.toLowerCase();
  if (path === '/' || path === '') return 'homepage';
  if (/\/(about|our-story|who-we-are|mission)/.test(path)) return 'about';
  if (/\/(product|service|shop|store|collection|pricing|plans)/.test(path)) return 'product';
  if (/\/(contact|get-in-touch)/.test(path)) return 'contact';
  if (/\/(blog|news|resource|article|post)/.test(path)) return 'blog';
  // Content-based fallback
  const lower = content.toLowerCase();
  if (lower.includes('add to cart') || lower.includes('buy now') || lower.includes('pricing')) return 'product';
  return 'other';
}

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
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

async function fetchPage(url: string): Promise<string | null> {
  const cfHtml = await fetchWithCloudflare(url);
  if (cfHtml) return cfHtml;
  return fetchWithTimeout(url);
}

function extractFromHtml(html: string, url: string): { title: string; content: string } | null {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  const content = article?.textContent?.trim() ?? '';
  if (content.length < 50) return null;
  const title = article?.title ?? new URL(url).pathname;
  return {
    title,
    content: content.length > MAX_CONTENT_LENGTH ? content.slice(0, MAX_CONTENT_LENGTH) : content,
  };
}

function normalizeUrl(raw: string, base: string): string | null {
  try {
    const url = new URL(raw, base);
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
  const ext = new URL(url).pathname.split('.').pop()?.toLowerCase() ?? '';
  const skip = new Set(['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico', 'pdf', 'zip', 'mp4', 'css', 'js', 'json', 'xml', 'woff', 'woff2', 'ttf']);
  return !skip.has(ext);
}

/**
 * Crawl a website for Brand DNA extraction.
 * Returns pages with raw HTML (for CSS/meta parsing) and extracted text content.
 * Prioritizes key brand pages (about, products, contact) over deep blog posts.
 */
export async function crawlForBrandDNA(
  websiteUrl: string,
  maxPages = 30,
): Promise<CrawledPage[]> {
  const origin = new URL(websiteUrl).origin;
  const visited = new Set<string>();
  const pages: CrawledPage[] = [];

  // Build priority queue: known key paths first
  const priorityUrls: string[] = [];
  for (const path of PRIORITY_PATHS) {
    const url = normalizeUrl(path, origin);
    if (url && !visited.has(url)) {
      priorityUrls.push(url);
      visited.add(url);
    }
  }

  // Crawl priority pages first
  for (const url of priorityUrls) {
    if (pages.length >= maxPages) break;
    const html = await fetchPage(url);
    if (!html) continue;

    const extracted = extractFromHtml(html, url);
    if (!extracted) continue;

    pages.push({
      url,
      html,
      title: extracted.title,
      content: extracted.content,
      wordCount: extracted.content.split(/\s+/).length,
      pageType: classifyPage(url, extracted.content),
    });

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  // Discover more URLs from crawled pages and crawl remaining
  const discoveredUrls: string[] = [];
  for (const page of pages) {
    const dom = new JSDOM(page.html, { url: page.url });
    const anchors = dom.window.document.querySelectorAll('a[href]');
    for (const a of anchors) {
      const href = a.getAttribute('href');
      if (!href) continue;
      const normalized = normalizeUrl(href, page.url);
      if (normalized && isSameDomain(normalized, origin) && isPageUrl(normalized) && !visited.has(normalized)) {
        visited.add(normalized);
        discoveredUrls.push(normalized);
      }
    }
  }

  // Crawl discovered pages (up to maxPages total)
  for (const url of discoveredUrls) {
    if (pages.length >= maxPages) break;
    const html = await fetchPage(url);
    if (!html) continue;

    const extracted = extractFromHtml(html, url);
    if (!extracted) continue;

    pages.push({
      url,
      html,
      title: extracted.title,
      content: extracted.content,
      wordCount: extracted.content.split(/\s+/).length,
      pageType: classifyPage(url, extracted.content),
    });

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  return pages;
}
