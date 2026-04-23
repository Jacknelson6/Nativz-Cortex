/**
 * lib/search/platform-router.ts
 *
 * Fans a topic-search query out to every selected platform in parallel,
 * normalises the results into a single `PlatformSource[]` shape, and
 * returns per-platform stats for downstream analytics + prompts.
 *
 * Policy (Jack, 2026-04-23):
 *   • There are NO volume presets. Per-platform counts come exclusively
 *     from `scraper_settings` (singleton row id=1), edited by admins in
 *     /admin/settings/ai. If the row is missing or unreachable, the
 *     `SCRAPER_DEFAULTS` fallback kicks in — but admin intent always wins.
 *   • Quora is not a supported platform.
 *   • Every platform has its own try/catch and records a stats row even
 *     on failure, so the merger LLM can distinguish "no data" from "no
 *     attempt".
 *
 * The router used to carry a `volume: 'light' | 'medium' | 'deep'` param
 * that each scraper translated into internal counts. That indirection was
 * the root cause of the 2026-04-23 cost incident (override=0 fell through
 * to deep defaults). We deleted it; the router now reads explicit counts
 * from settings and passes them by value to each fetcher.
 */
import type {
  SearchPlatform,
  PlatformSource,
  PlatformComment,
} from '@/lib/types/search';
import { inferYoutubeVideoFormat } from '@/lib/search/source-mention-utils';

import { gatherRedditData } from '@/lib/reddit/client';
import { gatherYouTubeData } from '@/lib/youtube/search';
import { gatherTikTokData } from '@/lib/tiktok/search';
import { gatherSerpData } from '@/lib/serp/client';
import { gatherSerperData } from '@/lib/serper/client';
import { getScraperSettings } from '@/lib/search/scraper-settings';
import type { SerpData } from '@/lib/serp/types';
import type { SerperPeopleAlsoAsk } from '@/lib/serper/client';

// ── Types ───────────────────────────────────────────────────────────────

export interface ApifyRunContext {
  /** UUID of the `topic_searches` row driving this fan-out (for apify_runs). */
  topicSearchId?: string | null;
  /** UUID of the client the search is bound to (for billing + audits). */
  clientId?: string | null;
  /** Confirmed subtopics — used by Reddit's LLM subreddit-discovery step. */
  subtopics?: string[];
}

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
  /** Google "People Also Ask" questions — gold for content ideation. */
  peopleAlsoAsk?: SerperPeopleAlsoAsk[];
  /** Related search queries surfaced by Google. */
  relatedSearches?: string[];
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Gather data from every requested platform in parallel. One platform
 * failing never blocks the others.
 */
export async function gatherPlatformData(
  query: string,
  platforms: SearchPlatform[],
  timeRange: string,
  runContext: ApifyRunContext = {},
): Promise<PlatformResults> {
  const settings = await getScraperSettings();

  const sources: PlatformSource[] = [];
  const platformStats: PlatformResults['platformStats'] = [];
  let serpData: SerpData | null = null;
  let peopleAlsoAsk: SerperPeopleAlsoAsk[] = [];
  let relatedSearches: string[] = [];

  const runs: Promise<void>[] = [];

  if (platforms.includes('web')) {
    runs.push(
      runWebGather(query, timeRange, settings.web.results, runContext).then((result) => {
        if (!result) {
          platformStats.push({ platform: 'web', postCount: 0, commentCount: 0 });
          return;
        }
        serpData = result.serpData;
        peopleAlsoAsk = result.peopleAlsoAsk;
        relatedSearches = result.relatedSearches;
        sources.push(...result.sources);
        platformStats.push({
          platform: 'web',
          postCount: result.sources.length,
          commentCount: 0,
        });
      }),
    );
  }

  if (platforms.includes('reddit')) {
    runs.push(
      runRedditGather(query, timeRange, settings.reddit, runContext).then((result) => {
        sources.push(...result.sources);
        platformStats.push({
          platform: 'reddit',
          postCount: result.sources.length,
          commentCount: result.commentCount,
          topSubreddits: result.topSubreddits,
        });
      }),
    );
  }

  if (platforms.includes('youtube')) {
    runs.push(
      runYouTubeGather(query, timeRange, settings.youtube).then((result) => {
        sources.push(...result.sources);
        platformStats.push({
          platform: 'youtube',
          postCount: result.sources.length,
          commentCount: result.commentCount,
          topChannels: result.topChannels,
        });
      }),
    );
  }

  if (platforms.includes('tiktok')) {
    runs.push(
      runTikTokGather(query, timeRange, settings.tiktok).then((result) => {
        sources.push(...result.sources);
        platformStats.push({
          platform: 'tiktok',
          postCount: result.sources.length,
          commentCount: result.commentCount,
          topHashtags: result.topHashtags,
        });
      }),
    );
  }

  await Promise.allSettled(runs);

  return {
    sources: dedupeByUrl(sources),
    serpData,
    platformStats,
    peopleAlsoAsk,
    relatedSearches,
  };
}

// ── Per-platform gatherers ──────────────────────────────────────────────

async function runWebGather(
  query: string,
  timeRange: string,
  webResultsCap: number,
  runContext: ApifyRunContext,
): Promise<{
  sources: PlatformSource[];
  serpData: SerpData | null;
  peopleAlsoAsk: SerperPeopleAlsoAsk[];
  relatedSearches: string[];
} | null> {
  try {
    const [serpResult, serperResult] = await Promise.allSettled([
      gatherSerpData(query, {
        timeRange,
        limit: webResultsCap,
        runContext: { topicSearchId: runContext.topicSearchId, clientId: runContext.clientId },
      }),
      process.env.SERPER_API_KEY
        ? gatherSerperData(query, timeRange, Math.min(30, Math.max(10, webResultsCap)))
        : Promise.resolve(null),
    ]);

    const sources: PlatformSource[] = [];
    let serpData: SerpData | null = null;
    let peopleAlsoAsk: SerperPeopleAlsoAsk[] = [];
    let relatedSearches: string[] = [];

    if (serpResult.status === 'fulfilled') {
      serpData = serpResult.value;
      sources.push(...normalizeSerpToSources(serpResult.value));
      if (sources.length === 0) {
        console.warn('[platform-router] SERP returned 0 sources');
      }
    } else {
      console.error('[platform-router] SERP failed:', serpResult.reason);
    }

    if (serperResult.status === 'fulfilled' && serperResult.value) {
      peopleAlsoAsk = serperResult.value.peopleAlsoAsk;
      relatedSearches = serperResult.value.relatedSearches;
      for (const paa of peopleAlsoAsk) {
        sources.push({
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
      console.error('[platform-router] Serper failed:', serperResult.reason);
    }

    console.log(
      `[platform-router] Web: ${sources.length} sources` +
        ` (SERP: ${serpData ? serpData.webResults.length + serpData.discussions.length + serpData.videos.length : 0}, PAA: ${peopleAlsoAsk.length})`,
    );
    return { sources, serpData, peopleAlsoAsk, relatedSearches };
  } catch (err) {
    console.error('[platform-router] Web gather threw:', err);
    return null;
  }
}

async function runRedditGather(
  query: string,
  timeRange: string,
  redditSettings: { posts: number; commentPosts: number },
  runContext: ApifyRunContext,
): Promise<{ sources: PlatformSource[]; commentCount: number; topSubreddits: string[] }> {
  try {
    // 1s stagger lets the web handler land first — reduces spiky concurrency.
    await wait(1000);
    const data = await gatherRedditData(query, timeRange, {
      topicSearchId: runContext.topicSearchId,
      clientId: runContext.clientId,
      subtopics: runContext.subtopics,
      postsOverride: redditSettings.posts,
      commentsPerPostOverride: redditSettings.commentPosts,
    });

    const sources: PlatformSource[] = data.postsWithComments.map((post) => ({
      platform: 'reddit',
      id: post.id,
      url: `https://reddit.com${post.permalink}`,
      title: post.title,
      content: post.selftext || post.title,
      author: post.author,
      subreddit: post.subreddit,
      engagement: { score: post.score, comments: post.num_comments },
      createdAt: new Date(post.created_utc * 1000).toISOString(),
      comments: post.top_comments.map(
        (c): PlatformComment => ({
          id: c.id,
          text: c.body,
          author: c.author,
          likes: c.score,
          createdAt: new Date(c.created_utc * 1000).toISOString(),
        }),
      ),
    }));

    const commentCount = sources.reduce((sum, s) => sum + s.comments.length, 0);
    console.log(
      `[platform-router] Reddit: ${sources.length} posts, ${commentCount} comments, subreddits: ${data.topSubreddits.join(', ') || 'none'}`,
    );
    return { sources, commentCount, topSubreddits: data.topSubreddits };
  } catch (err) {
    console.error('[platform-router] Reddit failed:', err);
    return { sources: [], commentCount: 0, topSubreddits: [] };
  }
}

async function runYouTubeGather(
  query: string,
  timeRange: string,
  ytSettings: { videos: number; commentVideos: number; transcriptVideos: number },
): Promise<{ sources: PlatformSource[]; commentCount: number; topChannels: string[] }> {
  try {
    const data = await gatherYouTubeData(query, timeRange, {
      videos: ytSettings.videos,
      commentVideos: ytSettings.commentVideos,
      transcriptVideos: ytSettings.transcriptVideos,
    });

    const sources: PlatformSource[] = data.videos.map((vid) => ({
      platform: 'youtube',
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
      comments: vid.top_comments.map(
        (c): PlatformComment => ({
          id: c.id,
          text: c.text,
          author: c.authorName,
          likes: c.likeCount,
          createdAt: c.publishedAt,
        }),
      ),
      transcript: vid.transcript,
    }));

    const commentCount = sources.reduce((sum, s) => sum + s.comments.length, 0);
    const topChannels = [...new Set(data.videos.map((v) => v.channelTitle))].slice(0, 10);
    console.log(
      `[platform-router] YouTube: ${sources.length} videos, ${commentCount} comments`,
    );
    return { sources, commentCount, topChannels };
  } catch (err) {
    console.error('[platform-router] YouTube failed:', err);
    return { sources: [], commentCount: 0, topChannels: [] };
  }
}

async function runTikTokGather(
  query: string,
  timeRange: string,
  ttSettings: { videos: number; commentVideos: number; transcriptVideos: number },
): Promise<{ sources: PlatformSource[]; commentCount: number; topHashtags: string[] }> {
  try {
    const data = await gatherTikTokData(query, timeRange, {
      videos: ttSettings.videos,
      commentVideos: ttSettings.commentVideos,
      transcriptVideos: ttSettings.transcriptVideos,
    });

    const sources: PlatformSource[] = data.videos.map((vid) => ({
      platform: 'tiktok',
      id: vid.id,
      url: `https://www.tiktok.com/@${vid.author.uniqueId}/video/${vid.id}`,
      title: vid.desc.slice(0, 100),
      content: vid.desc,
      author: vid.author.nickname || vid.author.uniqueId,
      thumbnailUrl: vid.coverUrl ?? undefined,
      videoFormat: 'short',
      engagement: {
        views: vid.stats.playCount,
        likes: vid.stats.diggCount,
        comments: vid.stats.commentCount,
        shares: vid.stats.shareCount,
      },
      createdAt: new Date(vid.createTime * 1000).toISOString(),
      comments: vid.top_comments.map(
        (c): PlatformComment => ({
          id: `tt-${vid.id}-${c.createTime}`,
          text: c.text,
          author: c.user,
          likes: c.diggCount,
          createdAt: new Date(c.createTime * 1000).toISOString(),
        }),
      ),
      transcript: vid.transcript,
    }));

    const commentCount = sources.reduce((sum, s) => sum + s.comments.length, 0);
    console.log(
      `[platform-router] TikTok: ${sources.length} videos, ${commentCount} comments`,
    );
    return { sources, commentCount, topHashtags: data.topHashtags };
  } catch (err) {
    console.error('[platform-router] TikTok failed:', err);
    return { sources: [], commentCount: 0, topHashtags: [] };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dedupeByUrl(sources: PlatformSource[]): PlatformSource[] {
  const seen = new Set<string>();
  const out: PlatformSource[] = [];
  for (const s of sources) {
    const key = s.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** Convert SERP data into normalized `PlatformSource` rows. */
function normalizeSerpToSources(serpData: SerpData): PlatformSource[] {
  const sources: PlatformSource[] = [];

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

  for (const item of serpData.discussions) {
    sources.push({
      platform: 'web',
      id: `disc-${item.url}`,
      url: item.url,
      title: item.title,
      content: item.description,
      author: '',
      engagement: { comments: item.answers ?? undefined },
      createdAt: '',
      comments: [],
    });
  }

  for (const item of serpData.videos) {
    sources.push({
      platform: 'web',
      id: `vid-${item.url}`,
      url: item.url,
      title: item.title,
      content: item.description ?? '',
      author: item.creator ?? '',
      engagement: {
        views: item.views
          ? parseInt(item.views.replace(/[^0-9]/g, ''), 10) || undefined
          : undefined,
      },
      createdAt: '',
      comments: [],
    });
  }

  return sources;
}

// ── Prompt formatting (kept from the original router) ──────────────────

/**
 * Format platform sources into context blocks for the merger/research LLM.
 * Groups by platform, ranks by engagement, and includes top comments +
 * transcript snippets inline. Token budget scales with active platform
 * count to keep the overall prompt under the research model's context.
 */
export function formatPlatformContext(
  sources: PlatformSource[],
  stats: PlatformResults['platformStats'],
): string {
  const blocks: string[] = [];

  const byPlatform: Record<string, PlatformSource[]> = {};
  for (const source of sources) {
    const key = source.platform;
    (byPlatform[key] ??= []).push(source);
  }

  const activePlatforms = stats.filter(
    (s) => (byPlatform[s.platform]?.length ?? 0) > 0,
  ).length;
  const itemsPerPlatform =
    activePlatforms <= 1 ? 60 : activePlatforms === 2 ? 40 : 25;

  for (const stat of stats) {
    const platformSources = byPlatform[stat.platform] ?? [];
    if (platformSources.length === 0) continue;

    const label = platformLabel(stat.platform);

    const header = `## ${label} (${stat.postCount} posts${stat.commentCount > 0 ? `, ${stat.commentCount} comments` : ''})`;
    const subInfo = stat.topSubreddits?.length
      ? `Top subreddits: ${stat.topSubreddits.slice(0, 5).map((s) => `r/${s}`).join(', ')}`
      : stat.topChannels?.length
        ? `Top channels: ${stat.topChannels.slice(0, 5).join(', ')}`
        : stat.topHashtags?.length
          ? `Top hashtags: ${stat.topHashtags.slice(0, 5).map((h) => `#${h}`).join(', ')}`
          : '';

    const sorted = [...platformSources].sort((a, b) => {
      const aEng =
        (a.engagement.score ?? 0) + (a.engagement.likes ?? 0) + (a.engagement.views ?? 0);
      const bEng =
        (b.engagement.score ?? 0) + (b.engagement.likes ?? 0) + (b.engagement.views ?? 0);
      return bEng - aEng;
    });

    const topItems = sorted.slice(0, itemsPerPlatform);

    const items = topItems
      .map((s) => {
        const eng: string[] = [];
        if (s.engagement.score) eng.push(`↑${s.engagement.score}`);
        if (s.engagement.views) eng.push(`${formatNum(s.engagement.views)} views`);
        if (s.engagement.likes) eng.push(`${formatNum(s.engagement.likes)} likes`);
        if (s.engagement.comments) eng.push(`${s.engagement.comments} comments`);
        const engStr = eng.length ? ` [${eng.join(', ')}]` : '';
        const sub = s.subreddit ? ` (r/${s.subreddit})` : '';

        let entry = `- ${s.title}${sub}${engStr}\n  ${s.content.slice(0, 300)}`;

        if (s.transcript) {
          entry += `\n  Transcript: "${s.transcript.slice(0, 300)}${s.transcript.length > 300 ? '...' : ''}"`;
        }

        if (s.comments.length > 0) {
          const commentTexts = s.comments
            .slice(0, 3)
            .map((c) => `    > "${c.text.slice(0, 200)}" [${c.likes} likes]`)
            .join('\n');
          entry += `\n  Top comments:\n${commentTexts}`;
        }

        return entry;
      })
      .join('\n\n');

    blocks.push(`${header}\n${subInfo ? subInfo + '\n' : ''}\n${items}`);
  }

  return blocks.join('\n\n---\n\n');
}

function platformLabel(p: SearchPlatform): string {
  switch (p) {
    case 'web':
      return 'Web';
    case 'reddit':
      return 'Reddit';
    case 'youtube':
      return 'YouTube';
    case 'tiktok':
      return 'TikTok';
    default:
      return String(p);
  }
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
