import type { SerpData } from '@/lib/serp/types';
import type { SearchPlatform } from '@/lib/types/search';
import type { WebSearchHit } from '@/lib/search/tools/web-search';

export function guessPlatformFromUrl(url: string): SearchPlatform {
  const u = url.toLowerCase();
  if (u.includes('reddit.com')) return 'reddit';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('tiktok.com')) return 'tiktok';
  // quora.com and other discussion sites fold into `web` — we don't maintain
  // a dedicated Quora pipeline anymore.
  return 'web';
}

/**
 * Minimal SERP blob for metrics + compatibility with existing `hasSerp` consumers.
 */
export function buildMinimalSerpFromHits(hits: WebSearchHit[]): SerpData {
  return {
    webResults: hits.map((h) => ({
      title: h.title,
      url: h.url,
      description: h.snippet,
    })),
    discussions: [],
    videos: [],
  };
}

