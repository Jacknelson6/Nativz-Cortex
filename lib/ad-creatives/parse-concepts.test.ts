import { describe, it, expect } from 'vitest';
import { parseConcepts } from './ad-agent';

describe('parseConcepts', () => {
  it('parses a top-level concepts array', () => {
    const raw = JSON.stringify({
      concepts: [
        { headline: 'A', image_prompt: 'p' },
        { headline: 'B', image_prompt: 'q' },
      ],
    });
    expect(parseConcepts(raw)).toHaveLength(2);
  });

  it('parses a bare array', () => {
    const raw = JSON.stringify([{ headline: 'A' }, { headline: 'B' }]);
    expect(parseConcepts(raw)).toHaveLength(2);
  });

  it('strips ```json fences', () => {
    const raw =
      '```json\n{"concepts": [{"headline": "Fenced"}]}\n```\n';
    expect(parseConcepts(raw)).toEqual([{ headline: 'Fenced' }]);
  });

  it('strips bare ``` fences', () => {
    const raw = '```\n[{"headline":"plain"}]\n```';
    expect(parseConcepts(raw)).toEqual([{ headline: 'plain' }]);
  });

  it('returns an empty array on invalid JSON', () => {
    expect(parseConcepts('definitely not json')).toEqual([]);
  });

  it('returns an empty array on a valid object without concepts', () => {
    expect(parseConcepts('{"unrelated": true}')).toEqual([]);
  });

  it('returns an empty array on whitespace input', () => {
    expect(parseConcepts('   \n  ')).toEqual([]);
  });
});
