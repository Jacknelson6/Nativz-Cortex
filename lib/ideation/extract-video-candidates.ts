import type { SerpData } from '@/lib/serp/types';
import type { PlatformBreakdown, PlatformSource, TopicSearch, TopicSource, TrendingTopic } from '@/lib/types/search';
import { hasSources } from '@/lib/types/search';

export interface VideoCandidate {
  url: string;
  title: string;
  platform: string | null;
  engagementScore: number;
  stats: { views: number; likes: number; comments: number; shares: number } | null;
}

function isVideoLikeUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes('youtube.com') ||
    u.includes('youtu.be') ||
    u.includes('tiktok.com') ||
    u.includes('instagram.com/reel') ||
    u.includes('instagram.com/p/') ||
    u.includes('facebook.com') ||
    u.includes('fb.watch')
  );
}

function scoreFromEngagement(eng: {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  score?: number;
}): number {
  return (
    (eng.views ?? 0) +
    (eng.likes ?? 0) * 10 +
    (eng.comments ?? 0) * 5 +
    (eng.shares ?? 0) * 5 +
    (eng.score ?? 0) * 20
  );
}

function parseViewString(raw?: string): number {
  if (!raw) return 0;
  const s = raw.trim().toUpperCase().replace(/,/g, '');
  const match = s.match(/^([\d.]+)\s*([KMB])?$/i);
  if (match) {
    const n = parseFloat(match[1]);
    if (Number.isNaN(n)) return 0;
    const mult = match[2]?.toUpperCase();
    if (mult === 'K') return Math.round(n * 1_000);
    if (mult === 'M') return Math.round(n * 1_000_000);
    if (mult === 'B') return Math.round(n * 1_000_000_000);
    return Math.round(n);
  }
  const digits = parseInt(s.replace(/[^\d]/g, ''), 10);
  return Number.isNaN(digits) ? 0 : digits;
}

function pushUnique(map: Map<string, VideoCandidate>, c: VideoCandidate) {
  if (!c.url || map.has(c.url)) return;
  map.set(c.url, c);
}

/**
 * Collect video URLs from a completed topic search (v1 SERP, v2 platform_data, trending sources).
 */
export function extractVideoCandidatesFromSearch(search: TopicSearch): VideoCandidate[] {
  const map = new Map<string, VideoCandidate>();

  const pd = search.platform_data as
    | { sources?: PlatformSource[] }
    | null
    | undefined;
  const sources = pd?.sources ?? [];
  for (const s of sources) {
    if (!isVideoLikeUrl(s.url)) continue;
    const score = scoreFromEngagement(s.engagement ?? {});
    pushUnique(map, {
      url: s.url,
      title: s.title?.trim() || 'Video',
      platform: s.platform ?? null,
      engagementScore: score,
      stats: {
        views: s.engagement?.views ?? 0,
        likes: s.engagement?.likes ?? 0,
        comments: s.engagement?.comments ?? 0,
        shares: s.engagement?.shares ?? 0,
      },
    });
  }

  const serp = search.serp_data as SerpData | null | undefined;
  if (serp?.videos?.length) {
    for (const v of serp.videos) {
      if (!v.url || !isVideoLikeUrl(v.url)) continue;
      const views = parseViewString(v.views);
      pushUnique(map, {
        url: v.url,
        title: v.title?.trim() || 'Video',
        platform: v.platform?.replace(/^www\./, '') ?? null,
        engagementScore: views,
        stats: { views, likes: 0, comments: 0, shares: 0 },
      });
    }
  }

  if (serp?.webResults?.length) {
    for (const w of serp.webResults) {
      if (!w.url || !isVideoLikeUrl(w.url)) continue;
      pushUnique(map, {
        url: w.url,
        title: w.title?.trim() || 'Video',
        platform: null,
        engagementScore: 0,
        stats: null,
      });
    }
  }

  if (serp?.discussions?.length) {
    for (const d of serp.discussions) {
      if (!d.url || !isVideoLikeUrl(d.url)) continue;
      pushUnique(map, {
        url: d.url,
        title: d.title?.trim() || 'Video',
        platform: null,
        engagementScore: (d.answers ?? 0) * 5,
        stats: { views: 0, likes: 0, comments: d.answers ?? 0, shares: 0 },
      });
    }
  }

  const topics = (search.trending_topics ?? []) as TrendingTopic[];
  for (const topic of topics) {
    if (!hasSources(topic)) continue;
    for (const src of topic.sources ?? []) {
      const ts = src as TopicSource;
      if (!ts.url) continue;
      const ok =
        ts.type === 'video' ||
        isVideoLikeUrl(ts.url);
      if (!ok) continue;
      pushUnique(map, {
        url: ts.url,
        title: ts.title?.trim() || topic.name || 'Video',
        platform: ts.platform ?? null,
        engagementScore: (topic.video_ideas?.length ?? 0) * 100,
        stats: null,
      });
    }
  }

  return [...map.values()].sort((a, b) => b.engagementScore - a.engagementScore);
}

/**
 * True when platform_breakdown has conversational platforms dominating (ideation PRD priority).
 */
export function isConversationHeavyBreakdown(breakdown: PlatformBreakdown[] | undefined): boolean {
  if (!breakdown?.length) return false;
  const conv = breakdown.filter((p) => ['reddit', 'web'].includes(p.platform));
  const convPosts = conv.reduce((s, p) => s + p.post_count, 0);
  const total = breakdown.reduce((s, p) => s + p.post_count, 0);
  return total > 0 && convPosts / total >= 0.35;
}
