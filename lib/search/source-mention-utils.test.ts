import { describe, expect, it } from 'vitest';
import {
  engagementRatePercent,
  extractYoutubeVideoId,
  formatViewsApprox,
  inferYoutubeVideoFormat,
  resolveSourceThumbnailUrl,
  roughSentimentScore,
  sentimentChip,
  sentimentWord,
  sourceCategoryLabel,
  sourceHeaderLabel,
  sourcePlaceLabel,
} from './source-mention-utils';
import type { PlatformSource } from '@/lib/types/search';

const EM_DASH = '—';

/**
 * source-mention-utils owns most of the per-source presentation logic
 * for the topic search rail (thumbnail resolution, engagement rate,
 * platform-aware labels). The contracts that matter the most:
 *
 *   - YouTube thumbnails resolve from a multi-step fallback: stored
 *     thumbnailUrl > extracted id > source.id > null. Each step has
 *     produced a real bug at some point; the order isn't decorative.
 *
 *   - sourceHeaderLabel never returns the creator handle. The card
 *     header is the platform/site (this is documented in the source
 *     comment); leaking the handle into the rail header is a known
 *     visual regression we keep guarding against.
 *
 *   - engagementRatePercent caps at 999 to keep the chip readable
 *     when a source has 1 view and 50 likes. Removing the cap blows
 *     out the layout.
 */

const makeSource = (overrides: Partial<PlatformSource> = {}): PlatformSource =>
  ({
    platform: 'youtube',
    id: 'sample-id',
    url: 'https://youtube.com/watch?v=sample-id',
    title: '',
    content: '',
    author: '',
    engagement: {},
    createdAt: '2026-01-01T00:00:00Z',
    comments: [],
    ...overrides,
  }) as PlatformSource;

describe('inferYoutubeVideoFormat', () => {
  it('detects "#shorts" tag in title (case-insensitive)', () => {
    expect(inferYoutubeVideoFormat('My new video #shorts')).toBe('short');
    expect(inferYoutubeVideoFormat('My new video #SHORTS')).toBe('short');
  });

  it('detects "#short" singular variant', () => {
    expect(inferYoutubeVideoFormat('quick clip #short')).toBe('short');
  });

  it('returns "long" when no shorts tag is present', () => {
    expect(inferYoutubeVideoFormat('full episode breakdown')).toBe('long');
    expect(inferYoutubeVideoFormat('')).toBe('long');
  });

  it('does NOT match "#shorty" or other false-friend tokens', () => {
    expect(inferYoutubeVideoFormat('check out my #shorty')).toBe('long');
  });
});

describe('extractYoutubeVideoId', () => {
  it('extracts id from a youtube.com watch URL', () => {
    expect(extractYoutubeVideoId('https://youtube.com/watch?v=abc123')).toBe('abc123');
    expect(extractYoutubeVideoId('https://www.youtube.com/watch?v=abc123&t=10s')).toBe('abc123');
  });

  it('extracts id from a /shorts/ URL', () => {
    expect(extractYoutubeVideoId('https://youtube.com/shorts/abc123')).toBe('abc123');
  });

  it('extracts id from a youtu.be short URL', () => {
    expect(extractYoutubeVideoId('https://youtu.be/abc123')).toBe('abc123');
  });

  it('returns null for unparseable URLs', () => {
    expect(extractYoutubeVideoId('not a url')).toBeNull();
  });

  it('returns null for non-YouTube hosts', () => {
    expect(extractYoutubeVideoId('https://vimeo.com/123')).toBeNull();
  });

  it('returns null for a youtube.com URL with no v= param', () => {
    expect(extractYoutubeVideoId('https://youtube.com/')).toBeNull();
  });
});

describe('resolveSourceThumbnailUrl', () => {
  it('returns the stored thumbnailUrl when present (regardless of platform)', () => {
    const s = makeSource({ thumbnailUrl: 'https://cdn.example/x.jpg' });
    expect(resolveSourceThumbnailUrl(s)).toBe('https://cdn.example/x.jpg');
  });

  it('falls back to YouTube hqdefault for short-form videos', () => {
    const s = makeSource({
      url: 'https://youtube.com/watch?v=zzz',
      videoFormat: 'short',
    });
    expect(resolveSourceThumbnailUrl(s)).toBe('https://img.youtube.com/vi/zzz/hqdefault.jpg');
  });

  it('falls back to YouTube maxresdefault for long-form videos', () => {
    const s = makeSource({
      url: 'https://youtube.com/watch?v=zzz',
      videoFormat: 'long',
    });
    expect(resolveSourceThumbnailUrl(s)).toBe('https://img.youtube.com/vi/zzz/maxresdefault.jpg');
  });

  it('uses source.id when the URL has no extractable video id', () => {
    const s = makeSource({
      id: 'fallback-id',
      url: 'https://youtube.com/',
      videoFormat: 'long',
    });
    expect(resolveSourceThumbnailUrl(s)).toBe(
      'https://img.youtube.com/vi/fallback-id/maxresdefault.jpg',
    );
  });

  it('returns null for non-YouTube sources without a stored thumbnail', () => {
    const s = makeSource({ platform: 'reddit', thumbnailUrl: null });
    expect(resolveSourceThumbnailUrl(s)).toBeNull();
  });
});

describe('engagementRatePercent', () => {
  it('returns null when views is 0 (avoids divide-by-zero)', () => {
    const s = makeSource({ engagement: { views: 0, likes: 50 } });
    expect(engagementRatePercent(s)).toBeNull();
  });

  it('returns null when views is missing', () => {
    const s = makeSource({ engagement: { likes: 50 } });
    expect(engagementRatePercent(s)).toBeNull();
  });

  it('computes (likes + comments + 2*shares + |score|) / views * 100, rounded to one decimal', () => {
    const s = makeSource({
      engagement: { views: 1000, likes: 80, comments: 10, shares: 5, score: -2 },
    });
    // (80 + 10 + 10 + 2) / 1000 * 100 = 10.2
    expect(engagementRatePercent(s)).toBe(10.2);
  });

  it('caps the rate at 999 to keep the chip readable', () => {
    const s = makeSource({
      engagement: { views: 1, likes: 1_000_000 },
    });
    expect(engagementRatePercent(s)).toBe(999);
  });

  it('treats absent fields as 0 (no NaN)', () => {
    const s = makeSource({ engagement: { views: 100 } });
    expect(engagementRatePercent(s)).toBe(0);
  });
});

describe('roughSentimentScore + sentimentWord + sentimentChip', () => {
  it('returns 0 for empty / whitespace text', () => {
    expect(roughSentimentScore('')).toBe(0);
    expect(roughSentimentScore('   ')).toBe(0);
  });

  it('scores positive lexicon words at +0.15 each', () => {
    expect(roughSentimentScore('great great great')).toBeCloseTo(0.45, 5);
  });

  it('scores negative lexicon words at -0.15 each', () => {
    expect(roughSentimentScore('terrible awful bad')).toBeCloseTo(-0.45, 5);
  });

  it('clamps the score to [-1, 1]', () => {
    expect(
      roughSentimentScore('love great amazing best excellent good helpful thanks awesome perfect'),
    ).toBe(1);
    expect(
      roughSentimentScore('hate terrible worst awful scam bad horrible disappointed angry useless'),
    ).toBe(-1);
  });

  it('is case-insensitive', () => {
    expect(roughSentimentScore('LOVE THIS')).toBeCloseTo(0.15, 5);
  });

  it('sentimentWord uses the +/-0.2 threshold', () => {
    expect(sentimentWord(0.2)).toBe('Positive');
    expect(sentimentWord(0.19)).toBe('Neutral');
    expect(sentimentWord(-0.2)).toBe('Negative');
    expect(sentimentWord(-0.19)).toBe('Neutral');
  });

  it('sentimentChip returns both emoji and label', () => {
    const chip = sentimentChip(0.5);
    expect(chip).toHaveProperty('emoji');
    expect(chip).toHaveProperty('label', 'Positive');
  });
});

describe('sourceCategoryLabel', () => {
  it('returns "Short-form video" for tiktok always', () => {
    expect(sourceCategoryLabel(makeSource({ platform: 'tiktok' }))).toBe('Short-form video');
  });

  it('respects youtube videoFormat short vs long', () => {
    expect(
      sourceCategoryLabel(makeSource({ platform: 'youtube', videoFormat: 'short' })),
    ).toBe('Short-form video');
    expect(
      sourceCategoryLabel(makeSource({ platform: 'youtube', videoFormat: 'long' })),
    ).toBe('Long-form video');
  });

  it('infers youtube format from #shorts in title when videoFormat is missing', () => {
    expect(
      sourceCategoryLabel(makeSource({ platform: 'youtube', title: 'cool clip #shorts' })),
    ).toBe('Short-form video');
  });

  it('returns subreddit label or "Discussion" for reddit', () => {
    expect(
      sourceCategoryLabel(makeSource({ platform: 'reddit', subreddit: 'fitness' })),
    ).toBe('r/fitness');
    expect(sourceCategoryLabel(makeSource({ platform: 'reddit' }))).toBe('Discussion');
  });

  it('returns "Web article" for web platform', () => {
    expect(sourceCategoryLabel(makeSource({ platform: 'web' }))).toBe('Web article');
  });
});

describe('sourcePlaceLabel', () => {
  it('returns r/<sub> for reddit, "Reddit" otherwise', () => {
    expect(sourcePlaceLabel(makeSource({ platform: 'reddit', subreddit: 'fit' }))).toBe(
      'r/fit',
    );
    expect(sourcePlaceLabel(makeSource({ platform: 'reddit' }))).toBe('Reddit');
  });

  it('returns the author for youtube, falls back to "YouTube"', () => {
    expect(sourcePlaceLabel(makeSource({ platform: 'youtube', author: 'creator' }))).toBe(
      'creator',
    );
    expect(sourcePlaceLabel(makeSource({ platform: 'youtube', author: '' }))).toBe('YouTube');
  });

  it('prefixes tiktok handle with @ and strips an existing leading @', () => {
    expect(sourcePlaceLabel(makeSource({ platform: 'tiktok', author: 'foo' }))).toBe('@foo');
    expect(sourcePlaceLabel(makeSource({ platform: 'tiktok', author: '@foo' }))).toBe('@foo');
  });

  it('returns the bare hostname (no www.) for web sources', () => {
    expect(
      sourcePlaceLabel(
        makeSource({ platform: 'web', url: 'https://www.example.com/article' }),
      ),
    ).toBe('example.com');
    expect(
      sourcePlaceLabel(makeSource({ platform: 'web', url: 'not a url' })),
    ).toBe('Web');
  });
});

describe('sourceHeaderLabel — never the creator handle', () => {
  it('returns "YouTube", not the author', () => {
    expect(
      sourceHeaderLabel(makeSource({ platform: 'youtube', author: 'creator' })),
    ).toBe('YouTube');
  });

  it('returns "TikTok", not the @handle', () => {
    expect(
      sourceHeaderLabel(makeSource({ platform: 'tiktok', author: 'foo' })),
    ).toBe('TikTok');
  });

  it('returns the subreddit slug for reddit (not author)', () => {
    expect(
      sourceHeaderLabel(makeSource({ platform: 'reddit', subreddit: 'fitness', author: 'u/me' })),
    ).toBe('r/fitness');
  });

  it('returns the bare hostname for web', () => {
    expect(
      sourceHeaderLabel(makeSource({ platform: 'web', url: 'https://www.cnn.com/x' })),
    ).toBe('cnn.com');
  });
});

describe('formatViewsApprox', () => {
  it('returns the em-dash placeholder for null/undefined/non-finite', () => {
    expect(formatViewsApprox(undefined)).toBe(EM_DASH);
    expect(formatViewsApprox(NaN)).toBe(EM_DASH);
    expect(formatViewsApprox(Infinity)).toBe(EM_DASH);
  });

  it('prefixes a tilde and uses two-decimal compact counts', () => {
    expect(formatViewsApprox(842)).toBe('~842');
    expect(formatViewsApprox(15_000)).toBe('~15.00K');
    expect(formatViewsApprox(2_500_000)).toBe('~2.50M');
  });
});
