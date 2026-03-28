import { describe, expect, it } from 'vitest';
import { normalizeMergerPayload, parseMergerOutput } from './merge-normalize';

const topic = {
  name: 'Moving tips',
  why_trending: 'Seasonal demand',
  platforms_seen: ['web'],
  posts_overview: 'Overview',
  comments_overview: 'Comments',
};

describe('normalizeMergerPayload', () => {
  it('unwraps nested report', () => {
    const n = normalizeMergerPayload({
      report: {
        summary: 'Exec summary.',
        overall_sentiment: '0.3',
        conversation_intensity: 'High',
        topics: [topic],
      },
    }) as { overall_sentiment: number; conversation_intensity: string };
    expect(n.overall_sentiment).toBeCloseTo(0.3);
    expect(n.conversation_intensity).toBe('high');
  });

  it('maps trending_topics to topics', () => {
    const n = normalizeMergerPayload({
      summary: 'S',
      overall_sentiment: 0,
      conversation_intensity: 'low',
      trending_topics: [topic],
    }) as { topics: unknown[] };
    expect(n.topics).toHaveLength(1);
  });

  it('wraps single topic object in array', () => {
    const n = normalizeMergerPayload({
      summary: 'S',
      overall_sentiment: 0,
      conversation_intensity: 'moderate',
      topics: topic,
    }) as { topics: unknown[] };
    expect(n.topics).toHaveLength(1);
  });

  it('accepts root array of topic-shaped objects', () => {
    const n = normalizeMergerPayload([topic]) as { summary: string; topics: unknown[] };
    expect(n.topics).toHaveLength(1);
    expect(n.summary.length).toBeGreaterThan(0);
  });
});

describe('parseMergerOutput', () => {
  it('parses fenced JSON end-to-end', () => {
    const body = {
      summary: 'S',
      overall_sentiment: -0.2,
      conversation_intensity: 'very_high',
      topics: [topic],
    };
    const text = `\`\`\`json\n${JSON.stringify(body)}\n\`\`\``;
    const out = parseMergerOutput(text, () => {});
    expect(out.summary).toBe('S');
    expect(out.conversation_intensity).toBe('very_high');
    expect(out.topics[0].name).toBe('Moving tips');
  });

  it('drops invalid video_ideas virality', () => {
    const body = {
      summary: 'S',
      overall_sentiment: 0,
      conversation_intensity: 'moderate',
      topics: [
        {
          ...topic,
          video_ideas: [{ title: 'V', virality: 'not_an_enum' as unknown as string }],
        },
      ],
    };
    const out = parseMergerOutput(JSON.stringify(body), () => {});
    expect(out.topics[0].video_ideas?.[0].virality).toBeUndefined();
  });

  it('coerces numeric hook and conversation_intensity scale', () => {
    const body = {
      summary: 'S',
      overall_sentiment: 0,
      conversation_intensity: 4,
      topics: [
        {
          ...topic,
          video_ideas: [{ title: 'T', hook: 42 as unknown as string }],
        },
      ],
    };
    const out = parseMergerOutput(JSON.stringify(body), () => {});
    expect(out.conversation_intensity).toBe('very_high');
    expect(out.topics[0].video_ideas?.[0].hook).toBe('42');
  });
});
