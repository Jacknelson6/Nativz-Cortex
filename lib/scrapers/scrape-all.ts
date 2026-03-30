import type { ScrapedVideo, ScoredVideo, ScrapeResult, HookPattern } from './types';
import { scrapeTikTok } from './tiktok-scraper';
import { scrapeYouTube } from './youtube-scraper';
import { scrapeInstagram } from './instagram-scraper';
import { gatherWebContext, type WebContextResult } from './web-context-scraper';
import { calculateOutlierScores } from '@/lib/search/outlier-engine';
import { extractHooksFromVideos, clusterHookPatterns } from '@/lib/search/hook-extractor';
import { createAdminClient } from '@/lib/supabase/admin';

export interface ScrapeAllOptions {
  query: string;
  searchId: string;
  maxResultsPerPlatform?: number;
  timeRange?: string;
  /** Skip individual platforms if their env vars are missing */
  platforms?: ('tiktok' | 'youtube' | 'instagram')[];
  userId?: string;
  userEmail?: string;
  /** Selected keywords from the keyword picker step */
  keywords?: string[];
  /** Language code (e.g. 'en') for filtering results */
  language?: string;
}

/**
 * Build platform-specific search queries from the main topic + selected keywords.
 * Produces 2-3 targeted queries per platform instead of one broad term.
 */
function buildSearchQueries(query: string, keywords?: string[]): string[] {
  const queries: string[] = [];

  // Always include the full query as-is
  queries.push(query);

  if (keywords && keywords.length > 0) {
    // Add keyword combinations for specificity
    // Take up to 3 most specific keywords and pair them with the topic
    const specific = keywords
      .filter(k => k.toLowerCase() !== query.toLowerCase())
      .slice(0, 3);

    for (const kw of specific) {
      queries.push(`${query} ${kw}`);
    }
  }

  // Deduplicate
  return [...new Set(queries.map(q => q.trim()))].slice(0, 4);
}

export interface ScrapeAllResult {
  videos: ScoredVideo[];
  hookPatterns: HookPattern[];
  platformCounts: { tiktok: number; youtube: number; instagram: number };
  webContext: WebContextResult | null;
  errors: string[];
}

const LOCAL_SCRAPER_URL = process.env.LOCAL_SCRAPER_URL || 'http://localhost:3200';

/**
 * Check if the local scraper service is available
 */
async function isLocalScraperAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_SCRAPER_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Scrape via local Playwright service — never throws; errors become ScrapeResult.error
 */
async function scrapeLocal(platform: 'tiktok' | 'instagram', query: string, maxResults: number, timeRange?: string): Promise<ScrapeResult> {
  try {
    const res = await fetch(`${LOCAL_SCRAPER_URL}/scrape/${platform}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, maxResults, timeRange }),
      signal: AbortSignal.timeout(180000),
    });
    if (!res.ok) {
      const text = await res.text();
      return { platform, videos: [], error: `Local scraper error ${res.status}: ${text.substring(0, 200)}` };
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return { platform, videos: [], error: 'Local scraper returned invalid JSON' };
    }
    if (!data || typeof data !== 'object') {
      return { platform, videos: [], error: 'Local scraper returned empty response' };
    }
    const body = data as Partial<ScrapeResult>;
    return {
      platform,
      videos: Array.isArray(body.videos) ? body.videos : [],
      error: body.error,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { platform, videos: [], error: `Local scraper failed: ${msg}` };
  }
}

async function localThenApify(
  platform: 'tiktok' | 'instagram',
  localResult: ScrapeResult,
  runApify: () => Promise<ScrapeResult>,
): Promise<ScrapeResult> {
  const hasApify = !!process.env.APIFY_API_KEY;
  const needsFallback = !!(localResult.error || localResult.videos.length === 0);

  if (!needsFallback) {
    console.log(`[scrape-all] ${platform}: local OK (${localResult.videos.length} videos)`);
    return localResult;
  }

  if (!hasApify) {
    console.warn(
      `[scrape-all] ${platform}: local unusable (${localResult.error ?? '0 videos'}) and APIFY_API_KEY not set — skipping Apify`,
    );
    return localResult;
  }

  console.log(`[scrape-all] ${platform}: falling back to Apify (local: ${localResult.error ?? 'empty results'})`);
  const apifyResult = await runApify();
  console.log(
    `[scrape-all] ${platform}: Apify returned ${apifyResult.videos.length} videos` +
      (apifyResult.error ? ` (error: ${apifyResult.error})` : ''),
  );
  return apifyResult;
}

/**
 * Check which scrapers are available based on env vars and local service
 */
function getAvailablePlatforms(localAvailable: boolean): Set<string> {
  const available = new Set<string>();
  if (localAvailable || process.env.APIFY_API_KEY) {
    available.add('tiktok');
    available.add('instagram');
  }
  if (process.env.YOUTUBE_API_KEY) {
    available.add('youtube');
  }
  return available;
}

/**
 * Scrape videos from all available platforms, compute outlier scores,
 * extract hooks, and persist to DB.
 */
export async function scrapeAllPlatforms(options: ScrapeAllOptions): Promise<ScrapeAllResult> {
  const { query, searchId, maxResultsPerPlatform = 50, timeRange, userId, userEmail, keywords, language } = options;
  const available = getAvailablePlatforms(false); // Skip local scraper check — Apify is primary
  const requested = new Set(options.platforms ?? ['tiktok', 'youtube', 'instagram']);
  const errors: string[] = [];

  // Build targeted search queries from topic + keywords
  const searchQueries = buildSearchQueries(query, keywords);
  const perQueryLimit = Math.ceil(maxResultsPerPlatform / searchQueries.length);

  console.log(`[scrape-all] Starting scrape for "${query}" (search ${searchId})`);
  console.log(`[scrape-all] Keywords: ${keywords?.join(', ') || 'none'}`);
  console.log(`[scrape-all] Search queries: ${searchQueries.join(' | ')}`);
  console.log(`[scrape-all] Language: ${language || 'en (default)'}`);
  console.log(`[scrape-all] Available platforms: ${[...available].join(', ')}`);

  // Run available scrapers in parallel with targeted queries
  const scrapePromises: Promise<ScrapeResult>[] = [];

  if (requested.has('tiktok') && available.has('tiktok')) {
    // TikTok: pass all search queries to the actor (it supports multiple)
    scrapePromises.push(scrapeTikTok({
      query: searchQueries[0], // Primary query
      searchQueries, // All queries for the actor
      maxResults: maxResultsPerPlatform,
      timeRange,
      language: language || 'en',
    }));
  }
  if (requested.has('youtube') && available.has('youtube')) {
    // YouTube: run each query and merge results
    const ytPromises = searchQueries.map(q =>
      scrapeYouTube({ query: q, maxResults: perQueryLimit, timeRange, language: language || 'en' }),
    );
    scrapePromises.push(
      Promise.all(ytPromises).then(results => {
        const allVids: ScrapedVideo[] = [];
        const errs: string[] = [];
        for (const r of results) {
          allVids.push(...r.videos);
          if (r.error) errs.push(r.error);
        }
        // Deduplicate by platform_id
        const seen = new Set<string>();
        const unique = allVids.filter(v => {
          if (seen.has(v.platform_id)) return false;
          seen.add(v.platform_id);
          return true;
        });
        return { platform: 'youtube' as const, videos: unique.slice(0, maxResultsPerPlatform), error: errs.length > 0 ? errs.join('; ') : undefined };
      }),
    );
  }
  if (requested.has('instagram') && available.has('instagram')) {
    // Instagram: use the most specific query
    scrapePromises.push(scrapeInstagram({
      query: searchQueries[0],
      searchQueries,
      maxResults: maxResultsPerPlatform,
      timeRange,
      language: language || 'en',
    }));
  }

  if (scrapePromises.length === 0) {
    console.log('[scrape-all] No scrapers available — skipping video scraping');
    return {
      videos: [],
      hookPatterns: [],
      platformCounts: { tiktok: 0, youtube: 0, instagram: 0 },
      webContext: null,
      errors: ['No scraper API keys configured (APIFY_API_KEY, YOUTUBE_API_KEY)'],
    };
  }

  // Gather lightweight web context (SERP + Reddit) in parallel with video scraping
  const webContextPromise = gatherWebContext(query, { timeRange, language, keywords })
    .then(ctx => {
      console.log(`[scrape-all] Web context: ${ctx.serpResults.length} SERP results, ${ctx.redditThreads.length} Reddit threads`);
      return ctx;
    })
    .catch(err => {
      console.error('[scrape-all] Web context failed (non-blocking):', err);
      return null as WebContextResult | null;
    });

  const [results, webContext] = await Promise.all([
    Promise.allSettled(scrapePromises),
    webContextPromise,
  ]);

  const allVideos: ScrapedVideo[] = [];
  const platformCounts = { tiktok: 0, youtube: 0, instagram: 0 };

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { platform, videos, error } = result.value;
      if (error) errors.push(`${platform}: ${error}`);
      allVideos.push(...videos);
      platformCounts[platform] = videos.length;
    } else {
      errors.push(`Scraper failed: ${result.reason}`);
    }
  }

  console.log(`[scrape-all] Total scraped: ${allVideos.length} videos (TikTok: ${platformCounts.tiktok}, YouTube: ${platformCounts.youtube}, Instagram: ${platformCounts.instagram})`);

  if (allVideos.length === 0) {
    return { videos: [], hookPatterns: [], platformCounts, webContext, errors };
  }

  // Calculate outlier scores
  const scored = calculateOutlierScores(allVideos);

  // Extract hooks from descriptions/titles
  const withHooks = extractHooksFromVideos(scored);

  // Cluster hooks via LLM (non-blocking for the main pipeline)
  let hookPatterns: HookPattern[] = [];
  try {
    hookPatterns = await clusterHookPatterns(withHooks, { userId, userEmail });
    console.log(`[scrape-all] Identified ${hookPatterns.length} hook patterns`);
  } catch (err) {
    console.error('[scrape-all] Hook clustering failed:', err);
    errors.push('Hook pattern clustering failed');
  }

  // Persist to DB
  try {
    await persistVideos(searchId, withHooks);
    await persistHookPatterns(searchId, hookPatterns);
    console.log(`[scrape-all] Persisted ${withHooks.length} videos and ${hookPatterns.length} hook patterns`);
  } catch (err) {
    console.error('[scrape-all] DB persist failed:', err);
    errors.push(`DB persist failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  return { videos: withHooks, hookPatterns, platformCounts, webContext, errors };
}

async function persistVideos(searchId: string, videos: ScoredVideo[]): Promise<void> {
  if (videos.length === 0) return;
  const admin = createAdminClient();

  // Batch insert in chunks of 100
  const chunkSize = 100;
  for (let i = 0; i < videos.length; i += chunkSize) {
    const chunk = videos.slice(i, i + chunkSize);
    const rows = chunk.map(v => ({
      search_id: searchId,
      platform: v.platform,
      platform_id: v.platform_id,
      url: v.url,
      thumbnail_url: v.thumbnail_url,
      title: v.title,
      description: v.description?.substring(0, 5000) ?? null,
      views: v.views,
      likes: v.likes,
      comments: v.comments,
      shares: v.shares,
      bookmarks: v.bookmarks,
      author_username: v.author_username,
      author_display_name: v.author_display_name,
      author_avatar: v.author_avatar,
      author_followers: v.author_followers,
      outlier_score: v.outlier_score,
      hook_text: v.hook_text,
      hashtags: v.hashtags,
      duration_seconds: v.duration_seconds,
      publish_date: v.publish_date,
    }));

    const { error } = await admin
      .from('topic_search_videos')
      .upsert(rows, { onConflict: 'search_id,platform,platform_id' });

    if (error) {
      console.error(`[scrape-all] Batch insert error (chunk ${i}):`, error.message);
    }
  }
}

async function persistHookPatterns(searchId: string, patterns: HookPattern[]): Promise<void> {
  if (patterns.length === 0) return;
  const admin = createAdminClient();

  const rows = patterns.map(p => ({
    search_id: searchId,
    pattern: p.pattern,
    video_count: p.video_count,
    avg_views: p.avg_views,
    avg_outlier_score: p.avg_outlier_score,
    example_video_ids: null, // Will be UUIDs once we have the DB IDs
  }));

  const { error } = await admin.from('topic_search_hooks').insert(rows);
  if (error) {
    console.error('[scrape-all] Hook patterns insert error:', error.message);
  }
}
