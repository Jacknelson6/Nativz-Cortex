// lib/search/platform-router.ts — Orchestrates multi-platform data gathering

import type { SearchPlatform, SearchVolume, PlatformSource, PlatformComment } from '@/lib/types/search';
import { inferYoutubeVideoFormat } from '@/lib/search/source-mention-utils';

/**
 * Centralized volume config — single source of truth for per-platform source counts.
 * Matches the three-tier depth system: Light / Medium (default) / Deep.
 */
export const VOLUME_CONFIG = {
  light: {
    reddit: { posts: 20, commentPosts: 5 },
    youtube: { videos: 15, commentVideos: 5, transcriptVideos: 3 },
    tiktok: { videos: 15, commentVideos: 5, transcriptVideos: 3 },
    web: { results: 15 },
  },
  medium: {
    reddit: { posts: 100, commentPosts: 20 },
    youtube: { videos: 100, commentVideos: 30, transcriptVideos: 20 },
    tiktok: { videos: 500, commentVideos: 50, transcriptVideos: 500 },
    web: { results: 30 },
  },
  deep: {
    reddit: { posts: 500, commentPosts: 50 },
    youtube: { videos: 500, commentVideos: 100, transcriptVideos: 50 },
    tiktok: { videos: 500, commentVideos: 100, transcriptVideos: 30 },
    web: { results: 50 },
  },
  // backward compat alias
  quick: {
    reddit: { posts: 20, commentPosts: 5 },
    youtube: { videos: 15, commentVideos: 5, transcriptVideos: 3 },
    tiktok: { videos: 15, commentVideos: 5, transcriptVideos: 3 },
    web: { results: 15 },
  },
} as const;
import { gatherRedditData } from '@/lib/reddit/client';
import { gatherYouTubeData } from '@/lib/youtube/search';
import { gatherTikTokData } from '@/lib/tiktok/search';
import { gatherSerpData } from '@/lib/serp/client';
import { gatherQuoraData } from '@/lib/quora/client';
import { gatherSerperData } from '@/lib/serper/client';
import type { SerpData } from '@/lib/serp/types';
import type { SerperPeopleAlsoAsk } from '@/lib/serper/client';

export interface PlatformResults {
  sources: PlatformSource[];
  serpData: SerpData | null;
  platformStats: {
    platform: SearchPlatform;
    postCount: number;
    commentCount: number;
    topSubreddits?: string[];
    topChannels?: string[];
    topHashtags?: string[];
  }[];
  /** Google "People Also Ask" questions — great for content ideation */
  peopleAlsoAsk?: SerperPeopleAlsoAsk[];
  /** Related search queries from Google */
  relatedSearches?: string[];
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
  volume: SearchVolume = 'medium',
): Promise<PlatformResults> {
  const allSources: PlatformSource[] = [];
  const platformStats: PlatformResults['platformStats'] = [];
  let serpData: SerpData | null = null;
  let peopleAlsoAsk: SerperPeopleAlsoAsk[] = [];
  let relatedSearches: string[] = [];

  // Build platform fetch promises
  const promises: Promise<void>[] = [];

  // Web — runs SearXNG + Serper (Google SERP) in parallel
  if (platforms.includes('web')) {
    promises.push(
      (async () => {
        try {
          // Run SearXNG (general web via DuckDuckGo engine by default) + Serper (Google) in parallel for maximum coverage
          const [searxngResult, serperResult] = await Promise.allSettled([
            gatherSerpData(query, { timeRange }),
            process.env.SERPER_API_KEY ? gatherSerperData(query, timeRange, volume) : Promise.resolve(null),
          ]);

          // Process SearXNG results
          if (searxngResult.status === 'fulfilled') {
            serpData = searxngResult.value;
            const webSources = normalizeSerpToSources(searxngResult.value);
            if (webSources.length === 0) {
              console.warn('[platform-router] SearXNG returned 0 web sources for query');
            }
            allSources.push(...webSources);
          } else {
            console.error('[platform-router] SearXNG search failed:', searxngResult.reason);
          }

          // Process Serper results (People Also Ask + Google organic)
          if (serperResult.status === 'fulfilled' && serperResult.value) {
            peopleAlsoAsk = serperResult.value.peopleAlsoAsk;
            relatedSearches = serperResult.value.relatedSearches;

            if (serperResult.value.peopleAlsoAsk.length === 0) {
              console.warn('[platform-router] Serper returned 0 People Also Ask results');
            }

            // Add People Also Ask as web sources (questions people are searching)
            for (const paa of serperResult.value.peopleAlsoAsk) {
              allSources.push({
                platform: 'web',
                id: `paa-${paa.link}`,
                url: paa.link,
                title: `❓ ${paa.question}`,
                content: paa.snippet,
                author: '',
                engagement: {},
                createdAt: '',
                comments: [],
              });
            }
          } else if (serperResult.status === 'rejected') {
            console.error('[platform-router] Serper search failed:', serperResult.reason);
          }

          const webCount = allSources.filter(s => s.platform === 'web').length;
          console.log(`[platform-router] Web sources total: ${webCount} (SearXNG: ${serpData ? serpData.webResults.length + serpData.discussions.length + serpData.videos.length : 0}, Serper PAA: ${peopleAlsoAsk.length})`);
          platformStats.push({
            platform: 'web',
            postCount: webCount,
            commentCount: 0,
          });
        } catch (err) {
          console.error('Web search failed:', err);
          platformStats.push({ platform: 'web', postCount: 0, commentCount: 0 });
        }
      })(),
    );
  }

  // Reddit — delayed 1s to stagger requests (web handler goes first)
  if (platforms.includes('reddit')) {
    promises.push(
      (async () => {
        try {
          await new Promise(r => setTimeout(r, 1000));
          const redditData = await gatherRedditData(query, timeRange, volume);
          console.log(`[platform-router] Reddit raw: ${redditData.posts.length} posts, ${redditData.postsWithComments.length} with comments, subreddits: ${redditData.topSubreddits.join(', ') || 'none'}`);

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
            thumbnailUrl: vid.thumbnailUrl,
            videoFormat: inferYoutubeVideoFormat(vid.title),
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
            transcript: vid.transcript,
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
            thumbnailUrl: vid.coverUrl ?? undefined,
            videoFormat: 'short' as const,
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
            transcript: vid.transcript,
          }));

          allSources.push(...ttSources);

          const totalComments = ttSources.reduce((sum, s) => sum + s.comments.length, 0);
          platformStats.push({
            platform: 'tiktok',
            postCount: ttSources.length,
            commentCount: totalComments,
            topHashtags: ttData.topHashtags,
          });
        } catch (err) {
          console.error('TikTok search failed:', err);
          platformStats.push({ platform: 'tiktok', postCount: 0, commentCount: 0 });
        }
      })(),
    );
  }

  // Quora — delayed 2s to stagger requests (web + reddit go first)
  if (platforms.includes('quora')) {
    promises.push(
      (async () => {
        try {
          await new Promise(r => setTimeout(r, 2000));
          const quoraData = await gatherQuoraData(query, timeRange, volume);
          console.log(`[platform-router] Quora raw: ${quoraData.threads.length} threads (total: ${quoraData.totalResults})`);

          const quoraSources: PlatformSource[] = quoraData.threads.map((thread) => ({
            platform: 'quora' as const,
            id: thread.id,
            url: thread.url,
            title: thread.question,
            content: thread.topAnswer,
            author: '',
            engagement: {
              comments: thread.answerCount ?? undefined,
            },
            createdAt: '',
            comments: [],
          }));

          allSources.push(...quoraSources);

          platformStats.push({
            platform: 'quora',
            postCount: quoraSources.length,
            commentCount: 0,
          });
        } catch (err) {
          console.error('Quora search failed:', err);
          platformStats.push({ platform: 'quora', postCount: 0, commentCount: 0 });
        }
      })(),
    );
  }

  // Execute all platform fetches in parallel
  await Promise.allSettled(promises);

  // Deduplicate sources by URL (keep first occurrence)
  const seenUrls = new Set<string>();
  const dedupedSources = allSources.filter((s) => {
    const key = s.url.toLowerCase();
    if (seenUrls.has(key)) return false;
    seenUrls.add(key);
    return true;
  });

  return { sources: dedupedSources, serpData, platformStats, peopleAlsoAsk, relatedSearches };
}

/**
 * Convert SearXNG SERP data into normalized PlatformSource format.
 */
function normalizeSerpToSources(serpData: SerpData): PlatformSource[] {
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

  // Scale items per platform inversely with platform count to stay within token budget
  const activePlatforms = stats.filter((s) => (byPlatform[s.platform]?.length ?? 0) > 0).length;
  const itemsPerPlatform = activePlatforms <= 1 ? 60 : activePlatforms === 2 ? 40 : 25;

  for (const stat of stats) {
    const platformSources = byPlatform[stat.platform] ?? [];
    if (platformSources.length === 0) continue;

    const label = stat.platform === 'web' ? 'Web' :
      stat.platform === 'reddit' ? 'Reddit' :
      stat.platform === 'youtube' ? 'YouTube' :
      stat.platform === 'tiktok' ? 'TikTok' :
      stat.platform === 'quora' ? 'Quora' : stat.platform;

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

    const topItems = sorted.slice(0, itemsPerPlatform);

    const items = topItems.map((s) => {
      const eng: string[] = [];
      if (s.engagement.score) eng.push(`↑${s.engagement.score}`);
      if (s.engagement.views) eng.push(`${formatNum(s.engagement.views)} views`);
      if (s.engagement.likes) eng.push(`${formatNum(s.engagement.likes)} likes`);
      if (s.engagement.comments) eng.push(`${s.engagement.comments} comments`);
      const engStr = eng.length ? ` [${eng.join(', ')}]` : '';
      const sub = s.subreddit ? ` (r/${s.subreddit})` : '';

      let entry = `- ${s.title}${sub}${engStr}\n  ${s.content.slice(0, 300)}`;

      // Include transcript snippet if available
      if (s.transcript) {
        entry += `\n  Transcript: "${s.transcript.slice(0, 300)}${s.transcript.length > 300 ? '...' : ''}"`;
      }

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
