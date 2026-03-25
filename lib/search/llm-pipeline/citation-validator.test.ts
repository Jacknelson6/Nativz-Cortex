import { describe, expect, it } from 'vitest';
import { filterTopicSourcesByAllowlist, toAllowlistSet } from '@/lib/search/llm-pipeline/citation-validator';
import type { TopicSearchAIResponse } from '@/lib/types/search';

function baseResponse(): TopicSearchAIResponse {
  return {
    summary: 's',
    overall_sentiment: 0,
    conversation_intensity: 'moderate',
    emotions: [],
    content_breakdown: {
      intentions: [],
      categories: [],
      formats: [],
    },
    trending_topics: [
      {
        name: 't1',
        resonance: 'high',
        sentiment: 0,
        total_engagement: 1,
        posts_overview: '',
        comments_overview: '',
        sources: [
          {
            url: 'https://allowed.com/a',
            title: 'A',
            type: 'web',
            relevance: 'r',
          },
          {
            url: 'https://blocked.com/',
            title: 'B',
            type: 'web',
            relevance: 'r',
          },
        ],
        video_ideas: [],
      },
    ],
    platform_breakdown: [],
    conversation_themes: [],
  };
}

describe('toAllowlistSet', () => {
  it('normalizes and dedupes', () => {
    const s = toAllowlistSet(['https://allowed.com/a/', 'https://allowed.com/a#x']);
    expect(s.size).toBe(1);
    expect(s.has('https://allowed.com/a')).toBe(true);
  });
});

describe('filterTopicSourcesByAllowlist', () => {
  it('strips sources not in allowlist', () => {
    const allow = toAllowlistSet(['https://allowed.com/a']);
    const out = filterTopicSourcesByAllowlist(baseResponse(), allow);
    expect(out.trending_topics?.[0]?.sources).toHaveLength(1);
    expect(out.trending_topics?.[0]?.sources?.[0]?.url).toContain('allowed.com');
  });

  it('keeps nothing when allowlist is empty', () => {
    const out = filterTopicSourcesByAllowlist(baseResponse(), new Set());
    expect(out.trending_topics?.[0]?.sources).toHaveLength(0);
  });

  it('matches normalized URL when allowlist uses different trailing slash', () => {
    const allow = toAllowlistSet(['https://allowed.com/a/']);
    const out = filterTopicSourcesByAllowlist(baseResponse(), allow);
    expect(out.trending_topics?.[0]?.sources).toHaveLength(1);
  });
});
