import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { createKnowledgeEntry, createKnowledgeLink } from '@/lib/knowledge/queries';
import type { KnowledgeEntry, WebPageMetadata } from '@/lib/knowledge/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrawlConfig {
  clientId: string;
  startUrl: string;
  maxPages: number;
  maxDepth: number;
  createdBy: string | null;
}

interface QueueItem {
  url: string;
  depth: number;
  parentUrl?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_AGENT = 'Mozilla/5.0 (compatible; NativzBot/1.0)';
const FETCH_TIMEOUT_MS = 10_000;
const DELAY_MS = 1_000;
const MIN_CONTENT_LENGTH = 50;
const MAX_CONTENT_LENGTH = 50_000;

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN ?? '';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeUrl(raw: string, base: string): string | null {
  try {
    const url = new URL(raw, base);
    // Strip hash and trailing slash for dedup
    url.hash = '';
    let normalized = url.toString();
    if (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
    return normalized;
  } catch {
    return null;
  }
}

function isSameDomain(url: string, baseOrigin: string): boolean {
  try {
    return new URL(url).origin === baseOrigin;
  } catch {
    return false;
  }
}

function isPageUrl(url: string): boolean {
  const ext = new URL(url).pathname.split('.').pop()?.toLowerCase() ?? '';
  const skipExtensions = new Set([
    'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico',
    'pdf', 'zip', 'mp4', 'mp3', 'wav', 'avi', 'mov',
    'css', 'js', 'json', 'xml', 'woff', 'woff2', 'ttf', 'eot',
  ]);
  return !skipExtensions.has(ext);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return null;
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
      // Cloudflare BR returns { result: "<html>..." } or similar shapes
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
  // Try Cloudflare BR first for rendered HTML, fall back to plain fetch
  const cfHtml = await fetchWithCloudflare(url);
  if (cfHtml) return cfHtml;
  return fetchWithTimeout(url);
}

// ---------------------------------------------------------------------------
// Sitemap
// ---------------------------------------------------------------------------

async function fetchSitemapUrls(startUrl: string): Promise<string[]> {
  const origin = new URL(startUrl).origin;
  const sitemapUrl = `${origin}/sitemap.xml`;
  const xml = await fetchWithTimeout(sitemapUrl, 5000);
  if (!xml) return [];

  const urls: string[] = [];
  const locRegex = /<loc>\s*(.*?)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = locRegex.exec(xml)) !== null) {
    const loc = match[1];
    if (loc && isPageUrl(loc)) {
      urls.push(loc);
    }
  }
  return urls;
}

// ---------------------------------------------------------------------------
// Content extraction
// ---------------------------------------------------------------------------

function extractContent(html: string, url: string): { title: string; content: string; links: string[] } | null {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  const content = article?.textContent?.trim() ?? '';
  if (content.length < MIN_CONTENT_LENGTH) return null;

  const title = article?.title ?? new URL(url).pathname;
  const cappedContent = content.length > MAX_CONTENT_LENGTH
    ? content.slice(0, MAX_CONTENT_LENGTH)
    : content;

  // Extract internal links from original HTML
  const links: string[] = [];
  const origin = new URL(url).origin;
  const linkDom = new JSDOM(html, { url });
  const anchors = linkDom.window.document.querySelectorAll('a[href]');
  for (const anchor of anchors) {
    const href = anchor.getAttribute('href');
    if (!href) continue;
    const normalized = normalizeUrl(href, url);
    if (normalized && isSameDomain(normalized, origin) && isPageUrl(normalized)) {
      links.push(normalized);
    }
  }

  return { title, content: cappedContent, links: [...new Set(links)] };
}

// ---------------------------------------------------------------------------
// Main crawl function
// ---------------------------------------------------------------------------

export async function crawlClientWebsite(config: CrawlConfig): Promise<KnowledgeEntry[]> {
  const {
    clientId,
    startUrl,
    maxPages = 50,
    maxDepth = 3,
    createdBy,
  } = config;

  const origin = new URL(startUrl).origin;
  const visited = new Set<string>();
  const queue: QueueItem[] = [];
  const entries: KnowledgeEntry[] = [];

  // URL -> created entry ID (for linking)
  const urlToEntryId = new Map<string, string>();
  // Track which URLs link to which other URLs
  const linkMap = new Map<string, string[]>();

  // Step 1: try sitemap
  const sitemapUrls = await fetchSitemapUrls(startUrl);
  if (sitemapUrls.length > 0) {
    for (const url of sitemapUrls.slice(0, maxPages)) {
      const normalized = normalizeUrl(url, origin);
      if (normalized && !visited.has(normalized)) {
        queue.push({ url: normalized, depth: 1 });
        visited.add(normalized);
      }
    }
  }

  // Always ensure start URL is in queue
  const normalizedStart = normalizeUrl(startUrl, origin);
  if (normalizedStart && !visited.has(normalizedStart)) {
    queue.unshift({ url: normalizedStart, depth: 0 });
    visited.add(normalizedStart);
  }

  // If no sitemap URLs, start BFS from start URL
  if (queue.length === 0 && normalizedStart) {
    queue.push({ url: normalizedStart, depth: 0 });
    visited.add(normalizedStart);
  }

  // Step 2: BFS crawl
  let idx = 0;
  while (idx < queue.length && entries.length < maxPages) {
    const item = queue[idx++];

    // Fetch and extract
    const html = await fetchPage(item.url);
    if (!html) continue;

    const extracted = extractContent(html, item.url);
    if (!extracted) continue;

    // Store as knowledge entry
    const wordCount = extracted.content.split(/\s+/).length;
    const metadata: WebPageMetadata = {
      source_url: item.url,
      scraped_at: new Date().toISOString(),
      depth: item.depth,
      word_count: wordCount,
      status: 'completed',
    };

    try {
      const entry = await createKnowledgeEntry({
        client_id: clientId,
        type: 'web_page',
        title: extracted.title,
        content: extracted.content,
        metadata: metadata as unknown as Record<string, unknown>,
        source: 'scraped',
        created_by: createdBy,
      });
      entries.push(entry);
      urlToEntryId.set(item.url, entry.id);
      linkMap.set(item.url, extracted.links);
    } catch (err) {
      console.error(`Failed to store knowledge entry for ${item.url}:`, err);
      continue;
    }

    // Enqueue discovered links (BFS)
    if (item.depth < maxDepth) {
      for (const link of extracted.links) {
        if (!visited.has(link) && isSameDomain(link, origin)) {
          visited.add(link);
          queue.push({ url: link, depth: item.depth + 1 });
        }
      }
    }

    // Rate limit
    if (idx < queue.length && entries.length < maxPages) {
      await sleep(DELAY_MS);
    }
  }

  // Step 3: Create links between pages that reference each other
  for (const [sourceUrl, targetUrls] of linkMap) {
    const sourceId = urlToEntryId.get(sourceUrl);
    if (!sourceId) continue;

    for (const targetUrl of targetUrls) {
      const targetId = urlToEntryId.get(targetUrl);
      if (!targetId || targetId === sourceId) continue;

      try {
        await createKnowledgeLink({
          client_id: clientId,
          source_id: sourceId,
          source_type: 'entry',
          target_id: targetId,
          target_type: 'entry',
          label: 'links_to',
        });
      } catch (err) {
        // Silently skip duplicate link errors
        console.error(`Failed to create link ${sourceUrl} -> ${targetUrl}:`, err);
      }
    }
  }

  return entries;
}
