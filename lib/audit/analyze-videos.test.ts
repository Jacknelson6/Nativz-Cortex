import { describe, expect, it, vi } from 'vitest';
import type { ProspectVideo } from './types';

// Mock the OpenRouter helper BEFORE importing the module under test.
vi.mock('@/lib/ai/openrouter-rich', () => ({
  createOpenRouterRichCompletion: vi.fn(async () => ({
    text: JSON.stringify({
      hook_type: 'question',
      hook_strength: 4,
      format: 'talking-head',
      quality_grade: 'high',
      visual_elements: ['text-overlay', 'on-camera'],
    }),
    modelUsed: 'google/gemini-2.0-flash-001',
    estimatedCost: 0,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  })),
}));

import { analyzeVideoForAudit, analyzeVideosForBrand } from './analyze-videos';

const mkVideo = (id: string, views = 1000): ProspectVideo => ({
  id,
  platform: 'tiktok',
  description: 'a question hook here',
  views,
  likes: 0,
  comments: 0,
  shares: 0,
  bookmarks: 0,
  duration: 30,
  publishDate: null,
  hashtags: [],
  url: `https://x.com/${id}`,
  thumbnailUrl: `https://x.com/${id}.jpg`,
  authorUsername: 'x',
  authorDisplayName: null,
  authorAvatar: null,
  authorFollowers: 0,
});

describe('analyzeVideoForAudit', () => {
  it('returns a VideoAudit with normalised fields', async () => {
    const r = await analyzeVideoForAudit(mkVideo('a'));
    expect(r.hook_type).toBe('question');
    expect(r.quality_grade).toBe('high');
    expect(r.format).toBe('talking-head');
  });
});

describe('analyzeVideosForBrand', () => {
  it('skips platforms with fewer than 3 videos (returns empty array)', async () => {
    const videosByPlatform = {
      tiktok: [mkVideo('a'), mkVideo('b')], // 2 — skipped
      instagram: [mkVideo('c'), mkVideo('d'), mkVideo('e'), mkVideo('f')],
    };
    const r = await analyzeVideosForBrand(videosByPlatform as any);
    expect(r.tiktok).toEqual([]);
    expect(r.instagram.length).toBe(4);
  });
  it('caps at top 5 by view count per platform', async () => {
    const videos = Array.from({ length: 10 }, (_, i) => mkVideo(`v${i}`, i * 100));
    const r = await analyzeVideosForBrand({ tiktok: videos } as any);
    expect(r.tiktok.length).toBe(5);
  });
});
