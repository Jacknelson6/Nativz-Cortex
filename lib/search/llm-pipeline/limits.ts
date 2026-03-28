/**
 * Env-configurable caps for llm_v1 topic search (US-011).
 * Invalid or negative values fall back to defaults.
 */

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

const MAX_PARALLEL_HARD_CAP = 8;

export function getLlmTopicPipelineLimits() {
  const rawParallel = parsePositiveInt(process.env.TOPIC_SEARCH_MAX_PARALLEL, 4);
  return {
    maxParallel: Math.min(rawParallel, MAX_PARALLEL_HARD_CAP),
    maxSearchesPerSubtopic: parsePositiveInt(process.env.TOPIC_SEARCH_MAX_SEARCHES_PER_SUBTOPIC, 10),
    maxFetchesPerSubtopic: parsePositiveInt(process.env.TOPIC_SEARCH_MAX_FETCHES_PER_SUBTOPIC, 3),
    maxMergerTokens: parsePositiveInt(process.env.TOPIC_SEARCH_MAX_MERGER_TOKENS, 10000),
    maxResearchTokens: parsePositiveInt(process.env.TOPIC_SEARCH_MAX_RESEARCH_TOKENS, 2500),
  };
}
