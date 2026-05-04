import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getLlmTopicPipelineLimits } from './limits';

/**
 * limits owns env parsing for the llm_v1 pipeline. Two contracts to pin:
 *
 *   1. maxParallel is hard-capped at 8 even if the env asks for more.
 *      OpenRouter rate-limit headroom and the Promise.all wall-clock
 *      math both assume the cap; lifting it via env would silently
 *      blow through provider quotas mid-search.
 *
 *   2. Invalid env values (empty, NaN, zero, negative) silently fall
 *      back to defaults rather than throwing or yielding 0. A 0 here
 *      would deadlock the whole pipeline (no parallel slots, no search
 *      iterations, no merger budget) — the safer behaviour is to
 *      ignore the typo.
 */

const ENV_KEYS = [
  'TOPIC_SEARCH_MAX_PARALLEL',
  'TOPIC_SEARCH_MAX_SEARCHES_PER_SUBTOPIC',
  'TOPIC_SEARCH_MAX_FETCHES_PER_SUBTOPIC',
  'TOPIC_SEARCH_MAX_MERGER_TOKENS',
  'TOPIC_SEARCH_MAX_RESEARCH_TOKENS',
] as const;

const original: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    original[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe('getLlmTopicPipelineLimits — defaults', () => {
  it('returns the documented defaults when no env vars are set', () => {
    expect(getLlmTopicPipelineLimits()).toEqual({
      maxParallel: 8,
      maxSearchesPerSubtopic: 10,
      maxFetchesPerSubtopic: 3,
      maxMergerTokens: 10000,
      maxResearchTokens: 2500,
    });
  });
});

describe('getLlmTopicPipelineLimits — invalid input falls back to defaults', () => {
  it('falls back when env value is empty string', () => {
    process.env.TOPIC_SEARCH_MAX_SEARCHES_PER_SUBTOPIC = '';
    expect(getLlmTopicPipelineLimits().maxSearchesPerSubtopic).toBe(10);
  });

  it('falls back when env value is non-numeric junk', () => {
    process.env.TOPIC_SEARCH_MAX_FETCHES_PER_SUBTOPIC = 'abc';
    expect(getLlmTopicPipelineLimits().maxFetchesPerSubtopic).toBe(3);
  });

  it('falls back when env value is 0', () => {
    process.env.TOPIC_SEARCH_MAX_MERGER_TOKENS = '0';
    expect(getLlmTopicPipelineLimits().maxMergerTokens).toBe(10000);
  });

  it('falls back when env value is negative', () => {
    process.env.TOPIC_SEARCH_MAX_RESEARCH_TOKENS = '-5';
    expect(getLlmTopicPipelineLimits().maxResearchTokens).toBe(2500);
  });
});

describe('getLlmTopicPipelineLimits — maxParallel cap', () => {
  it('honours a value below the hard cap', () => {
    process.env.TOPIC_SEARCH_MAX_PARALLEL = '4';
    expect(getLlmTopicPipelineLimits().maxParallel).toBe(4);
  });

  it('honours the cap exactly', () => {
    process.env.TOPIC_SEARCH_MAX_PARALLEL = '8';
    expect(getLlmTopicPipelineLimits().maxParallel).toBe(8);
  });

  it('clamps to 8 even if the env asks for more', () => {
    process.env.TOPIC_SEARCH_MAX_PARALLEL = '32';
    expect(getLlmTopicPipelineLimits().maxParallel).toBe(8);
  });

  it('falls back to default 8 (then clamped, still 8) on invalid input', () => {
    process.env.TOPIC_SEARCH_MAX_PARALLEL = 'oops';
    expect(getLlmTopicPipelineLimits().maxParallel).toBe(8);
  });
});

describe('getLlmTopicPipelineLimits — partial env override', () => {
  it('only overrides the specified key, leaves others at default', () => {
    process.env.TOPIC_SEARCH_MAX_FETCHES_PER_SUBTOPIC = '5';
    const out = getLlmTopicPipelineLimits();
    expect(out.maxFetchesPerSubtopic).toBe(5);
    expect(out.maxParallel).toBe(8);
    expect(out.maxSearchesPerSubtopic).toBe(10);
    expect(out.maxMergerTokens).toBe(10000);
    expect(out.maxResearchTokens).toBe(2500);
  });

  it('parses int (drops fractional part) — Number.parseInt semantics', () => {
    process.env.TOPIC_SEARCH_MAX_SEARCHES_PER_SUBTOPIC = '7.9';
    expect(getLlmTopicPipelineLimits().maxSearchesPerSubtopic).toBe(7);
  });
});
