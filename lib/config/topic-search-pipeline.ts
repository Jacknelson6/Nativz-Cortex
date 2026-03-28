import type { TopicPipeline } from '@/lib/types/search';

/**
 * Parse `TOPIC_SEARCH_PIPELINE` (for tests and call sites that need explicit values).
 * Only `legacy` opts out; everything else (including unset) selects `llm_v1`.
 */
export function topicPipelineFromEnvValue(raw: string | undefined): TopicPipeline {
  const v = raw?.trim().toLowerCase();
  if (v === 'legacy') return 'legacy';
  return 'llm_v1';
}

/**
 * Which topic search backend runs for **new** searches (`POST /api/search/start`) and process routing.
 *
 * **Default: `llm_v1`** — subtopic planning + LLM research (`TOPIC_SEARCH_WEB_RESEARCH=brave` adds Brave SERP; default is LLM-only).
 * Set `TOPIC_SEARCH_PIPELINE=legacy` to use the previous Brave + platform scrape pipeline.
 */
export function getTopicSearchPipelineFromEnv(): TopicPipeline {
  return topicPipelineFromEnvValue(process.env.TOPIC_SEARCH_PIPELINE);
}
