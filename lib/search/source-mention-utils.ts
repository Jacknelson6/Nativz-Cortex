import type { PlatformSource, SearchPlatform } from '@/lib/types/search';
import { getSentimentEmoji } from '@/lib/utils/sentiment';

/** Heuristic: Shorts often tagged in title; API search may still return watch URLs. */
export function inferYoutubeVideoFormat(title: string): 'short' | 'long' {
  return /#shorts?\b/i.test(title) ? 'short' : 'long';
}

export function extractYoutubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] ?? null;
      return u.searchParams.get('v');
    }
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1) || null;
  } catch {
    // ignore
  }
  return null;
}

/** Best thumbnail for UI: stored URL, else YouTube CDN fallback. */
export function resolveSourceThumbnailUrl(source: PlatformSource): string | null {
  if (source.thumbnailUrl) return source.thumbnailUrl;
  if (source.platform === 'youtube') {
    const id = extractYoutubeVideoId(source.url) ?? source.id;
    if (!id) return null;
    const kind = source.videoFormat ?? inferYoutubeVideoFormat(source.title);
    return kind === 'short'
      ? `https://img.youtube.com/vi/${id}/hqdefault.jpg`
      : `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
  }
  return null;
}

function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return String(n);
}

/** Rough engagement rate: interactions per view (capped for display). */
export function engagementRatePercent(source: PlatformSource): number | null {
  const v = source.engagement.views ?? 0;
  if (v <= 0) return null;
  const likes = source.engagement.likes ?? 0;
  const comments = source.engagement.comments ?? 0;
  const shares = source.engagement.shares ?? 0;
  const score = source.engagement.score ?? 0;
  const interactions = likes + comments + shares * 2 + Math.abs(score);
  const raw = (interactions / v) * 100;
  return Math.min(999, Math.round(raw * 10) / 10);
}

/** Lightweight lexicon sentiment for tag chips (not model-grade). */
export function roughSentimentScore(text: string): number {
  if (!text.trim()) return 0;
  const t = text.toLowerCase();
  const pos =
    (t.match(/\b(love|great|amazing|best|excellent|good|helpful|thanks|awesome|perfect)\b/g) ?? []).length;
  const neg =
    (t.match(/\b(hate|terrible|worst|awful|scam|bad|horrible|disappointed|angry|useless)\b/g) ?? []).length;
  const delta = (pos - neg) * 0.15;
  return Math.max(-1, Math.min(1, delta));
}

export function sentimentWord(score: number): string {
  if (score >= 0.2) return 'Positive';
  if (score <= -0.2) return 'Negative';
  return 'Neutral';
}

export function sentimentChip(score: number): { emoji: string; label: string } {
  return { emoji: getSentimentEmoji(score), label: sentimentWord(score) };
}

export function sourceCategoryLabel(source: PlatformSource): string {
  switch (source.platform) {
    case 'youtube':
      return (source.videoFormat ?? inferYoutubeVideoFormat(source.title)) === 'short'
        ? 'Short-form video'
        : 'Long-form video';
    case 'tiktok':
      return 'Short-form video';
    case 'reddit':
      return source.subreddit ? `r/${source.subreddit}` : 'Discussion';
    case 'quora':
      return 'Q&A';
    case 'web':
      return 'Web article';
    default:
      return 'Source';
  }
}

export function sourcePlaceLabel(source: PlatformSource): string {
  switch (source.platform) {
    case 'reddit':
      return source.subreddit ? `r/${source.subreddit}` : 'Reddit';
    case 'youtube':
      return source.author || 'YouTube';
    case 'tiktok':
      return source.author ? `@${source.author.replace(/^@/, '')}` : 'TikTok';
    case 'quora':
      return 'Quora';
    case 'web': {
      try {
        return new URL(source.url).hostname.replace(/^www\./, '');
      } catch {
        return 'Web';
      }
    }
    default:
      return (source.platform as SearchPlatform) || 'Source';
  }
}

/** Card header: platform or site — never the creator handle (use for Sources rail). */
export function sourceHeaderLabel(source: PlatformSource): string {
  switch (source.platform) {
    case 'reddit':
      return source.subreddit ? `r/${source.subreddit}` : 'Reddit';
    case 'youtube':
      return 'YouTube';
    case 'tiktok':
      return 'TikTok';
    case 'quora':
      return 'Quora';
    case 'web': {
      try {
        return new URL(source.url).hostname.replace(/^www\./, '');
      } catch {
        return 'Web';
      }
    }
    default:
      return (source.platform as SearchPlatform) || 'Source';
  }
}

export function formatViewsApprox(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `~${compactCount(n)}`;
}
