// lib/search/platform-router.ts — Orchestrates multi-platform data gathering

import type { SearchPlatform, SearchVolume, PlatformSource, PlatformComment } from '@/lib/types/search';
import { gatherRedditData } from '@/lib/reddit/client';
import { gatherYouTubeData } from '@/lib/youtube/search';
import { gatherTikTokData } from '@/lib/tiktok/search';
import { gatherSerpData } from '@/lib/brave/client';
import type { BraveSerpData } from '@/lib/brave/types';

export interface PlatformResults {
  sources: PlatformSource[];
  braveSerpData: BraveSerpData | null;
  platformStats: {
    platform: SearchPlatform;
    postCount: number;
    commentCount: number;
    topSubreddits?: string[];
    topChannels?: string[];
    topHashtags?: string[];
  }[];
}

/**
 * Gather data from all selected platforms in parallel.
 * Each platform has its own timeout and fallback — if one fails,
 * the search still completes with available data.
 */
export async function gatherPlatformData(
  query: string,
  platforms: SearchPlatform[],
  timeRange: string,
  volume: SearchVolume = 'quick',
): Promise<PlatformResults> {
  const allSources: PlatformSource[] = [];
  const platformStats: PlatformResults['platformStats'] = [];
  let braveSerpData: BraveSerpData | null = null;

  // Build platform fetch promises
  const promises: Promise<void>[] = [];

  // Web (Brave) — always included
  if (platforms.includes('web')) {
    promises.push(
      (async () => {
        try {
          const serpData = await gatherSerpData(query, { timeRange });
          braveSerpData = serpData;

          // Convert Brave results to PlatformSource format
          const webSources = normalizeBraveToSources(serpData);
          allSources.push(...webSources);

          platformStats.push({
            platform: 'web',
            postCount: webSources.length,
            commentCount: 0,
          });
        } catch (err) {
          console.error('Brave Search failed:', err);
          platformStats.push({ platform: 'web', postCount: 0, commentCount: 0 });
        }
      })(),
    );
  }

  // Reddit
  if (platforms.includes('reddit')) {
    promises.push(
      (async () => {
        try {
          const redditData = await gatherRedditData(query, timeRange, volume);

          const redditSources: PlatformSource[] = redditData.postsWithComments.map((post) => ({
            platform: 'reddit' as const,
            id: post.id,
            url: `https://reddit.com${post.permalink}`,
            title: post.title,
            content: post.selftext || post.title,
            author: post.author,
            subreddit: post.subreddit,
            engagement: {
              score: post.score,
              comments: post.num_comments,
            },
            createdAt: new Date(post.created_utc * 1000).toISOString(),
            comments: post.top_comments.map((c): PlatformComment => ({
              id: c.id,
              text: c.body,
              author: c.author,
              likes: c.score,
              createdAt: new Date(c.created_utc * 1000).toISOString(),
            })),
          }));

          allSources.push(...redditSources);

          const totalComments = redditSources.reduce((sum, s) => sum + s.comments.length, 0);
          platformStats.push({
            platform: 'reddit',
            postCount: redditSources.length,
            commentCount: totalComments,
            topSubreddits: redditData.topSubreddits,
          });
        } catch (err) {
          console.error('Reddit search failed:', err);
          platformStats.push({ platform: 'reddit', postCount: 0, commentCount: 0 });
        }
      })(),
    );
  }

  // YouTube
  if (platforms.includes('youtube')) {
    promises.push(
      (async () => {
        try {
          const ytData = await gatherYouTubeData(query, timeRange, volume);

          const ytSources: PlatformSource[] = ytData.videos.map((vid) => ({
            platform: 'youtube' as const,
            id: vid.id,
            url: `https://www.youtube.com/watch?v=${vid.id}`,
            title: vid.title,
            content: vid.description,
            author: vid.channelTitle,
            engagement: {
              views: vid.viewCount,
              likes: vid.likeCount,
              comments: vid.commentCount,
            },
            createdAt: vid.publishedAt,
            comments: vid.top_comments.map((c): PlatformComment => ({
              id: c.id,
              text: c.text,
              author: c.authorName,
              likes: c.likeCount,
              createdAt: c.publishedAt,
            })),
          }));

          allSources.push(...ytSources);

          const totalComments = ytSources.reduce((sum, s) => sum + s.comments.length, 0);
          const topChannels = [...new Set(ytData.videos.map((v) => v.channelTitle))].slice(0, 10);
          platformStats.push({
            platform: 'youtube',
            postCount: ytSources.length,
            commentCount: totalComments,
            topChannels,
          });
        } catch (err) {
          console.error('YouTube search failed:', err);
          platformStats.push({ platform: 'youtube', postCount: 0, commentCount: 0 });
        }
      })(),
    );
  }

  // TikTok (via Apify)
  if (platforms.includes('tiktok')) {
    promises.push(
      (async () => {
        try {
          const ttData = await gatherTikTokData(query, timeRange, volume);

          const ttSources: PlatformSource[] = ttData.videos.map((vid) => ({
            platform: 'tiktok' as const,
            id: vid.id,
            url: `https://www.tiktok.com/@${vid.author.uniqueId}/video/${vid.id}`,
            title: vid.desc.slice(0, 100),
            content: vid.desc,
            author: vid.author.nickname || vid.author.uniqueId,
            engagement: {
              views: vid.stats.playCount,
              likes: vid.stats.diggCount,
              comments: vid.stats.commentCount,
              shares: vid.stats.shareCount,
            },
            createdAt: new Date(vid.createTime * 1000).toISOString(),
            comments: vid.top_comments.map((c): PlatformComment => ({
              id: `tt-${vid.id}-${c.createTime}`,
              text: c.text,
              author: c.user,
              likes: c.diggCount,
              createdAt: new Date(c.createTime * 1000).toISOString(),
            })),
          }));

          allSources.push(...ttSources);

          platformStats.push({
            platform: 'tiktok',
            postCount: ttSources.length,
            commentCount: 0,
            topHashtags: ttData.topHashtags,
          });
        } catch (err) {
          console.error('TikTok search failed:', err);
          platformStats.push({ platform: 'tiktok', postCount: 0, commentCount: 0 });
        }
      })(),
    );
  }

  // Execute all platform fetches in parallel
  await Promise.allSettled(promises);

  return { sources: allSources, braveSerpData, platformStats };
}

/**
 * Convert Brave SERP data into normalized PlatformSource format.
 */
function normalizeBraveToSources(serpData: BraveSerpData): PlatformSource[] {
  const sources: PlatformSource[] = [];

  // Web results
  for (const item of serpData.webResults) {
    sources.push({
      platform: 'web',
      id: `web-${item.url}`,
      url: item.url,
      title: item.title,
      content: item.description,
      author: '',
      engagement: {},
      createdAt: '',
      comments: [],
    });
  }

  // Discussion results
  for (const item of serpData.discussions) {
    sources.push({
      platform: 'web',
      id: `disc-${item.url}`,
      url: item.url,
      title: item.title,
      content: item.description,
      author: '',
      engagement: {
        comments: item.answers ?? undefined,
      },
      createdAt: '',
      comments: [],
    });
  }

  // Video results
  for (const item of serpData.videos) {
    sources.push({
      platform: 'web',
      id: `vid-${item.url}`,
      url: item.url,
      title: item.title,
      content: item.description ?? '',
      author: item.creator ?? '',
      engagement: {
        views: item.views ? parseInt(item.views.replace(/[^0-9]/g, ''), 10) || undefined : undefined,
      },
      createdAt: '',
      comments: [],
    });
  }

  return sources;
}

/**
 * Format platform sources into context blocks for the AI prompt.
 * Clusters by platform and summarizes engagement metrics.
 */
export function formatPlatformContext(
  sources: PlatformSource[],
  stats: PlatformResults['platformStats'],
): string {
  const blocks: string[] = [];

  // Group by platform
  const byPlatform: Record<string, PlatformSource[]> = {};
  for (const source of sources) {
    const key = source.platform;
    if (!byPlatform[key]) byPlatform[key] = [];
    byPlatform[key].push(source);
  }

  for (const stat of stats) {
    const platformSources = byPlatform[stat.platform] ?? [];
    if (platformSources.length === 0) continue;

    const label = stat.platform === 'web' ? 'Web & News' :
      stat.platform === 'reddit' ? 'Reddit' :
      stat.platform === 'youtube' ? 'YouTube' :
      stat.platform === 'tiktok' ? 'TikTok' : stat.platform;

    const header = `## ${label} (${stat.postCount} posts${stat.commentCount > 0 ? `, ${stat.commentCount} comments` : ''})`;
    const subInfo = stat.topSubreddits?.length
      ? `Top subreddits: ${stat.topSubreddits.slice(0, 5).map((s) => `r/${s}`).join(', ')}`
      : stat.topChannels?.length
        ? `Top channels: ${stat.topChannels.slice(0, 5).join(', ')}`
        : stat.topHashtags?.length
          ? `Top hashtags: ${stat.topHashtags.slice(0, 5).map((h) => `#${h}`).join(', ')}`
          : '';

    // Sort by engagement and take top items for the prompt
    const sorted = [...platformSources].sort((a, b) => {
      const aEng = (a.engagement.score ?? 0) + (a.engagement.likes ?? 0) + (a.engagement.views ?? 0);
      const bEng = (b.engagement.score ?? 0) + (b.engagement.likes ?? 0) + (b.engagement.views ?? 0);
      return bEng - aEng;
    });

    // Take top 30 for the prompt (to stay within token budget)
    const topItems = sorted.slice(0, 30);

    const items = topItems.map((s) => {
      const eng: string[] = [];
      if (s.engagement.score) eng.push(`↑${s.engagement.score}`);
      if (s.engagement.views) eng.push(`${formatNum(s.engagement.views)} views`);
      if (s.engagement.likes) eng.push(`${formatNum(s.engagement.likes)} likes`);
      if (s.engagement.comments) eng.push(`${s.engagement.comments} comments`);
      const engStr = eng.length ? ` [${eng.join(', ')}]` : '';
      const sub = s.subreddit ? ` (r/${s.subreddit})` : '';

      let entry = `- ${s.title}${sub}${engStr}\n  ${s.content.slice(0, 300)}`;

      // Include top comments
      if (s.comments.length > 0) {
        const commentTexts = s.comments
          .slice(0, 3)
          .map((c) => `    > "${c.text.slice(0, 200)}" [${c.likes} likes]`)
          .join('\n');
        entry += `\n  Top comments:\n${commentTexts}`;
      }

      return entry;
    }).join('\n\n');

    blocks.push(`${header}\n${subInfo ? subInfo + '\n' : ''}\n${items}`);
  }

  return blocks.join('\n\n---\n\n');
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
