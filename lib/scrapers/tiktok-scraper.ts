import { ApifyClient } from 'apify-client';
import type { ScrapedVideo, ScrapeOptions, ScrapeResult } from './types';

const ACTOR_ID = 'clockworks/free-tiktok-scraper';

function getApifyClient(): ApifyClient {
  const token = process.env.APIFY_API_KEY;
  if (!token) throw new Error('APIFY_API_KEY is required for TikTok scraping');
  return new ApifyClient({ token });
}

interface TikTokItem {
  id?: string;
  text?: string;
  desc?: string;
  diggCount?: number;
  commentCount?: number;
  shareCount?: number;
  playCount?: number;
  collectCount?: number;
  authorMeta?: {
    name?: string;
    nickName?: string;
    avatar?: string;
    fans?: number;
  };
  videoUrl?: string;
  webVideoUrl?: string;
  covers?: { default?: string; origin?: string };
  hashtags?: { name?: string }[];
  videoMeta?: { duration?: number };
  createTime?: number;
  createTimeISO?: string;
}

function mapItem(item: TikTokItem): ScrapedVideo | null {
  const id = item.id;
  if (!id) return null;

  const username = item.authorMeta?.name ?? 'unknown';
  const url = item.webVideoUrl || item.videoUrl || `https://www.tiktok.com/@${username}/video/${id}`;

  return {
    platform: 'tiktok',
    platform_id: id,
    url,
    thumbnail_url: item.covers?.default ?? item.covers?.origin ?? null,
    title: null,
    description: item.text ?? item.desc ?? null,
    views: item.playCount ?? 0,
    likes: item.diggCount ?? 0,
    comments: item.commentCount ?? 0,
    shares: item.shareCount ?? 0,
    bookmarks: item.collectCount ?? 0,
    author_username: username,
    author_display_name: item.authorMeta?.nickName ?? null,
    author_avatar: item.authorMeta?.avatar ?? null,
    author_followers: item.authorMeta?.fans ?? 0,
    hashtags: (item.hashtags ?? []).map(h => h.name).filter((n): n is string => !!n),
    duration_seconds: item.videoMeta?.duration ?? null,
    publish_date: item.createTimeISO
      ? item.createTimeISO
      : item.createTime
        ? new Date(item.createTime * 1000).toISOString()
        : null,
  };
}

export async function scrapeTikTok(options: ScrapeOptions): Promise<ScrapeResult> {
  try {
    const client = getApifyClient();
    const maxItems = options.maxResults ?? 50;

    const run = await client.actor(ACTOR_ID).call(
      {
        searchQueries: [options.query],
        maxProfilesPerQuery: 0,
        resultsPerPage: maxItems,
        shouldDownloadCovers: false,
        shouldDownloadVideos: false,
      },
      { waitSecs: 120 },
    );

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    const videos = (items as TikTokItem[])
      .map(mapItem)
      .filter((v): v is ScrapedVideo => v !== null)
      .slice(0, maxItems);

    console.log(`[tiktok-scraper] Scraped ${videos.length} videos for "${options.query}"`);
    return { platform: 'tiktok', videos };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[tiktok-scraper] Error: ${msg}`);
    return { platform: 'tiktok', videos: [], error: msg };
  }
}
