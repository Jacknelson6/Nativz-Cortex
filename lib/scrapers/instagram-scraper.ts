import { ApifyClient } from 'apify-client';
import type { ScrapedVideo, ScrapeOptions, ScrapeResult } from './types';

const ACTOR_ID = 'apify/instagram-scraper';

function getApifyClient(): ApifyClient {
  const token = process.env.APIFY_API_KEY;
  if (!token) throw new Error('APIFY_API_KEY is required for Instagram scraping');
  return new ApifyClient({ token });
}

interface IGItem {
  id?: string;
  shortCode?: string;
  caption?: string;
  likesCount?: number;
  commentsCount?: number;
  videoViewCount?: number;
  videoPlayCount?: number;
  timestamp?: string;
  ownerUsername?: string;
  ownerFullName?: string;
  ownerId?: string;
  displayUrl?: string;
  videoUrl?: string;
  url?: string;
  type?: string;
  hashtags?: string[];
  videoDuration?: number;
  dimensionsHeight?: number;
  dimensionsWidth?: number;
}

function mapItem(item: IGItem): ScrapedVideo | null {
  const id = item.shortCode || item.id;
  if (!id) return null;

  // Only include video/reel content
  if (item.type && !['Video', 'Reel', 'video', 'reel'].includes(item.type)) return null;

  const username = item.ownerUsername ?? 'unknown';
  const url = item.url || `https://www.instagram.com/reel/${id}/`;

  return {
    platform: 'instagram',
    platform_id: id,
    url,
    thumbnail_url: item.displayUrl ?? null,
    title: null,
    description: item.caption ?? null,
    views: item.videoPlayCount ?? item.videoViewCount ?? 0,
    likes: item.likesCount ?? 0,
    comments: item.commentsCount ?? 0,
    shares: 0,
    bookmarks: 0,
    author_username: username,
    author_display_name: item.ownerFullName ?? null,
    author_avatar: null,
    author_followers: 0, // IG scraper doesn't always return this per-post
    hashtags: item.hashtags ?? extractHashtags(item.caption),
    duration_seconds: item.videoDuration ? Math.round(item.videoDuration) : null,
    publish_date: item.timestamp ?? null,
  };
}

function extractHashtags(text?: string | null): string[] {
  if (!text) return [];
  const matches = text.matchAll(/#(\w+)/g);
  return [...matches].map(m => m[1].toLowerCase());
}

export async function scrapeInstagram(options: ScrapeOptions): Promise<ScrapeResult> {
  try {
    const client = getApifyClient();
    const maxItems = options.maxResults ?? 50;

    // Use keyword search for better relevance (hashtag search strips spaces and is too broad)
    const queries = options.searchQueries?.length
      ? options.searchQueries
      : [options.query];

    console.log(`[instagram-scraper] Running Apify actor ${ACTOR_ID} with queries: ${queries.join(', ')}`);
    const run = await client.actor(ACTOR_ID).call(
      {
        search: queries.join(', '),
        resultsType: 'posts',
        resultsLimit: maxItems,
        searchType: 'hashtag',
        searchLimit: queries.length,
      },
      { waitSecs: 120 },
    );

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    const videos = (items as IGItem[])
      .map(mapItem)
      .filter((v): v is ScrapedVideo => v !== null)
      .slice(0, maxItems);

    console.log(`[instagram-scraper] Scraped ${videos.length} reels for "${options.query}"`);
    return { platform: 'instagram', videos };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[instagram-scraper] Error: ${msg}`);
    return { platform: 'instagram', videos: [], error: msg };
  }
}
