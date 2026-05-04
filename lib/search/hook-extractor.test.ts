import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({
  createCompletion: vi.fn(),
}));

import { clusterHookPatterns, extractHookFromText, extractHooksFromVideos } from './hook-extractor';
import { createCompletion } from '@/lib/ai/client';
import type { ScoredVideo } from '@/lib/scrapers/types';

/**
 * hook-extractor owns the "what's the opening line of this video?"
 * logic that feeds the topic-search hooks panel + the LLM clustering
 * step. Three contracts to pin:
 *
 *   1. extractHookFromText strips trailing hashtags off the first line
 *      before returning it. "Real opening line #fyp #fitness" must
 *      surface as "Real opening line", not the raw caption — the hook
 *      list is meant to read like spoken openings, not metadata.
 *      Note: the short-first-line / `#`-prefix fallback uses a regex
 *      that does NOT cross `\n`, so the fallback only finds a sentence
 *      break when the punctuation is on the first line of cleaned text.
 *
 *   2. extractHooksFromVideos preserves an existing hook_text rather
 *      than overwriting it. The DB-backed hook is more authoritative
 *      than re-derived text; a regression that re-derives unconditionally
 *      would silently rewrite manually-curated hooks.
 *
 *   3. clusterHookPatterns maps the LLM's `video_indices` back to
 *      `${platform}:${platform_id}` strings using the SORTED top-100
 *      list. The LLM never sees the raw IDs, so the index mapping is
 *      the only thing tying patterns back to real videos. Sorting by
 *      views desc is part of this contract — switching to ascending
 *      would change which videos the LLM sees AND which platform_ids
 *      come back as examples.
 */

const makeVideo = (overrides: Partial<ScoredVideo>): ScoredVideo =>
  ({
    platform: 'tiktok',
    platform_id: 'pid',
    url: 'https://example.com/x',
    thumbnail_url: null,
    title: null,
    description: null,
    views: 100,
    likes: 0,
    comments: 0,
    shares: 0,
    bookmarks: 0,
    author_username: 'someone',
    author_display_name: null,
    author_avatar: null,
    author_followers: 0,
    hashtags: [],
    duration_seconds: null,
    publish_date: null,
    outlier_score: 1.0,
    hook_text: null,
    ...overrides,
  }) as ScoredVideo;

describe('extractHookFromText — null/empty inputs', () => {
  it('returns null for null input', () => {
    expect(extractHookFromText(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractHookFromText('')).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    expect(extractHookFromText('   \n\n  ')).toBeNull();
  });
});

describe('extractHookFromText — happy path', () => {
  it('returns the first line trimmed when it is long enough', () => {
    expect(extractHookFromText('This is a real hook\n#fitness #fyp')).toBe(
      'This is a real hook',
    );
  });

  it('strips trailing hashtags from the first line', () => {
    expect(extractHookFromText('Real opening line #fitness #fyp')).toBe('Real opening line');
  });

  it('caps the hook at 200 characters', () => {
    const longLine = 'a'.repeat(500);
    const out = extractHookFromText(longLine);
    expect(out).toBeTruthy();
    expect(out!.length).toBe(200);
  });
});

describe('extractHookFromText — short / hashtag-only first line', () => {
  it('falls through to the substring when first line is shorter than 5 chars and the rest is on a new line', () => {
    // The sentence-match regex uses `.` which does NOT cross newlines, so the
    // fallback effectively only triggers in single-line inputs. With a newline
    // gating the fallback, the substring branch returns the whole cleaned text.
    expect(extractHookFromText('hi\nThis is the actual hook of the video.')).toBe(
      'hi\nThis is the actual hook of the video.',
    );
  });

  it('falls through to the substring when the first line starts with # and the rest is on a new line', () => {
    expect(
      extractHookFromText('#fitness #fyp\nThe real hook is here. More body text.'),
    ).toBe('#fitness #fyp\nThe real hook is here. More body text.');
  });

  it('returns the first sentence when first line is short AND the sentence punct is at the line break', () => {
    // firstLine 'ok.' is 3 chars (< 5) -> fallback triggers. Regex finds the
    // first `[.!?]` followed by `\s` (the `\n`) -> returns 'ok.'.
    expect(extractHookFromText('ok.\nmore body text after the line break')).toBe('ok.');
  });
});

describe('extractHooksFromVideos', () => {
  it('preserves an existing hook_text rather than re-deriving it', () => {
    const out = extractHooksFromVideos([
      makeVideo({
        hook_text: 'Manually curated hook',
        description: 'A different opening line',
      }),
    ]);
    expect(out[0].hook_text).toBe('Manually curated hook');
  });

  it('derives hook_text from description when missing', () => {
    const out = extractHooksFromVideos([
      makeVideo({ hook_text: null, description: 'Auto-derived hook here' }),
    ]);
    expect(out[0].hook_text).toBe('Auto-derived hook here');
  });

  it('falls back to title when description is null', () => {
    const out = extractHooksFromVideos([
      makeVideo({ hook_text: null, description: null, title: 'Title-based hook' }),
    ]);
    expect(out[0].hook_text).toBe('Title-based hook');
  });

  it('does not mutate the input array', () => {
    const original = makeVideo({ hook_text: null, description: 'Hook' });
    const input = [original];
    extractHooksFromVideos(input);
    expect(input[0].hook_text).toBeNull();
  });
});

describe('clusterHookPatterns', () => {
  beforeEach(() => {
    vi.mocked(createCompletion).mockReset();
  });

  it('returns empty array when fewer than 3 videos have hooks (early-exit)', async () => {
    const out = await clusterHookPatterns([
      makeVideo({ hook_text: 'one' }),
      makeVideo({ hook_text: 'two' }),
    ]);
    expect(out).toEqual([]);
    expect(createCompletion).not.toHaveBeenCalled();
  });

  it('drops videos whose hook is 5 chars or shorter from the eligibility check', async () => {
    const out = await clusterHookPatterns([
      makeVideo({ hook_text: 'longer hook one' }),
      makeVideo({ hook_text: 'hi' }),
      makeVideo({ hook_text: 'no' }),
    ]);
    expect(out).toEqual([]);
    expect(createCompletion).not.toHaveBeenCalled();
  });

  it('returns [] when JSON parsing fails (LLM returned junk)', async () => {
    vi.mocked(createCompletion).mockResolvedValue({
      text: 'not even close to JSON',
    } as never);
    const videos = [
      makeVideo({ hook_text: 'hook one is long enough', platform_id: '1' }),
      makeVideo({ hook_text: 'hook two is long enough', platform_id: '2' }),
      makeVideo({ hook_text: 'hook three is long enough', platform_id: '3' }),
    ];
    const out = await clusterHookPatterns(videos);
    expect(out).toEqual([]);
  });

  it('strips ```json fences before parsing', async () => {
    vi.mocked(createCompletion).mockResolvedValue({
      text: '```json\n{"patterns":[]}\n```',
    } as never);
    const videos = [
      makeVideo({ hook_text: 'hook one is long enough', platform_id: '1' }),
      makeVideo({ hook_text: 'hook two is long enough', platform_id: '2' }),
      makeVideo({ hook_text: 'hook three is long enough', platform_id: '3' }),
    ];
    const out = await clusterHookPatterns(videos);
    expect(out).toEqual([]);
  });

  it('maps video_indices back to platform:platform_id using the views-desc sort', async () => {
    vi.mocked(createCompletion).mockResolvedValue({
      text: JSON.stringify({
        patterns: [
          {
            pattern: 'POV: you {x}',
            description: 'pov hooks',
            video_indices: [0, 1],
            avg_views: 100_000,
            avg_outlier: 8.5,
          },
        ],
      }),
    } as never);

    const videos = [
      makeVideo({ hook_text: 'low view hook here', views: 100, platform: 'tiktok', platform_id: 'low' }),
      makeVideo({ hook_text: 'mid view hook here', views: 5_000, platform: 'tiktok', platform_id: 'mid' }),
      makeVideo({ hook_text: 'high view hook here', views: 1_000_000, platform: 'youtube', platform_id: 'high' }),
    ];

    const out = await clusterHookPatterns(videos);
    expect(out).toHaveLength(1);
    // Sorted desc by views: [high, mid, low]; indices [0,1] -> high, mid.
    expect(out[0].example_video_ids).toEqual(['youtube:high', 'tiktok:mid']);
    expect(out[0].video_count).toBe(2);
    expect(out[0].avg_views).toBe(100_000);
    expect(out[0].avg_outlier_score).toBe(8.5);
  });

  it('caps example_video_ids at 5 even when the LLM returns more indices', async () => {
    vi.mocked(createCompletion).mockResolvedValue({
      text: JSON.stringify({
        patterns: [
          {
            pattern: 'p',
            video_indices: [0, 1, 2, 3, 4, 5, 6],
            avg_views: 1,
            avg_outlier: 1,
          },
        ],
      }),
    } as never);
    const videos = Array.from({ length: 7 }, (_, i) =>
      makeVideo({
        hook_text: `hook ${i} is long enough`,
        views: 1000 - i,
        platform_id: `id-${i}`,
      }),
    );
    const out = await clusterHookPatterns(videos);
    expect(out[0].example_video_ids).toHaveLength(5);
  });

  it('drops out-of-range indices instead of crashing', async () => {
    vi.mocked(createCompletion).mockResolvedValue({
      text: JSON.stringify({
        patterns: [
          {
            pattern: 'p',
            video_indices: [0, 999, 1],
            avg_views: 1,
            avg_outlier: 1,
          },
        ],
      }),
    } as never);
    const videos = [
      makeVideo({ hook_text: 'one is long enough', views: 100, platform_id: 'a' }),
      makeVideo({ hook_text: 'two is long enough', views: 50, platform_id: 'b' }),
      makeVideo({ hook_text: 'three is long enough', views: 10, platform_id: 'c' }),
    ];
    const out = await clusterHookPatterns(videos);
    expect(out[0].example_video_ids).toEqual(['tiktok:a', 'tiktok:b']);
    // video_count uses raw indices length (3), not the filtered length.
    expect(out[0].video_count).toBe(3);
  });

  it('rounds avg_views to nearest integer and avg_outlier_score to 2 decimal places', async () => {
    vi.mocked(createCompletion).mockResolvedValue({
      text: JSON.stringify({
        patterns: [
          {
            pattern: 'p',
            video_indices: [0],
            avg_views: 12345.78,
            avg_outlier: 8.5678,
          },
        ],
      }),
    } as never);
    const videos = [
      makeVideo({ hook_text: 'one is long enough' }),
      makeVideo({ hook_text: 'two is long enough' }),
      makeVideo({ hook_text: 'three is long enough' }),
    ];
    const out = await clusterHookPatterns(videos);
    expect(out[0].avg_views).toBe(12346);
    expect(out[0].avg_outlier_score).toBe(8.57);
  });

  it('treats missing patterns array (parsed.patterns ?? []) as empty', async () => {
    vi.mocked(createCompletion).mockResolvedValue({
      text: JSON.stringify({ unrelated: 'shape' }),
    } as never);
    const videos = [
      makeVideo({ hook_text: 'one is long enough' }),
      makeVideo({ hook_text: 'two is long enough' }),
      makeVideo({ hook_text: 'three is long enough' }),
    ];
    const out = await clusterHookPatterns(videos);
    expect(out).toEqual([]);
  });
});
