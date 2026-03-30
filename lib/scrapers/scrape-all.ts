import type { ScrapedVideo, ScoredVideo, ScrapeResult, HookPattern } from './types';
import { scrapeTikTok } from './tiktok-scraper';
import { scrapeYouTube } from './youtube-scraper';
import { scrapeInstagram } from './instagram-scraper';
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
}

export interface ScrapeAllResult {
  videos: ScoredVideo[];
  hookPatterns: HookPattern[];
  platformCounts: { tiktok: number; youtube: number; instagram: number };
  errors: string[];
}

/**
 * Check which scrapers are available based on env vars
 */
function getAvailablePlatforms(): Set<string> {
  const available = new Set<string>();
  if (process.env.APIFY_API_KEY) {
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
  const { query, searchId, maxResultsPerPlatform = 50, timeRange, userId, userEmail } = options;
  const available = getAvailablePlatforms();
  const requested = new Set(options.platforms ?? ['tiktok', 'youtube', 'instagram']);
  const errors: string[] = [];

  console.log(`[scrape-all] Starting scrape for "${query}" (search ${searchId})`);
  console.log(`[scrape-all] Available platforms: ${[...available].join(', ')}`);

  // Run available scrapers in parallel
  const scrapePromises: Promise<ScrapeResult>[] = [];

  if (requested.has('tiktok') && available.has('tiktok')) {
    scrapePromises.push(scrapeTikTok({ query, maxResults: maxResultsPerPlatform, timeRange }));
  }
  if (requested.has('youtube') && available.has('youtube')) {
    scrapePromises.push(scrapeYouTube({ query, maxResults: maxResultsPerPlatform, timeRange }));
  }
  if (requested.has('instagram') && available.has('instagram')) {
    scrapePromises.push(scrapeInstagram({ query, maxResults: maxResultsPerPlatform, timeRange }));
  }

  if (scrapePromises.length === 0) {
    console.log('[scrape-all] No scrapers available — skipping video scraping');
    return {
      videos: [],
      hookPatterns: [],
      platformCounts: { tiktok: 0, youtube: 0, instagram: 0 },
      errors: ['No scraper API keys configured (APIFY_API_KEY, YOUTUBE_API_KEY)'],
    };
  }

  const results = await Promise.allSettled(scrapePromises);

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
    return { videos: [], hookPatterns: [], platformCounts, errors };
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

  return { videos: withHooks, hookPatterns, platformCounts, errors };
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
