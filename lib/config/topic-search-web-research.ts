export type TopicSearchWebResearchMode = 'searxng' | 'openrouter' | 'llm_only';

/**
 * How llm_v1 gathers material for each subtopic:
 * - `searxng` — SearXNG SERP + URL fetch (self-hosted, needs `SEARXNG_URL` or defaults to localhost:8888)
 * - `openrouter` — OpenRouter web plugin on `TOPIC_SEARCH_OPENROUTER_WEB_MODEL` (default `google/gemini-2.0-flash-001`) + URL fetch
 * - `llm_only` — no live SERP; **sources list is empty** (no fabricated URLs)
 *
 * Env:
 * - `TOPIC_SEARCH_WEB_RESEARCH=llm_only` — never call SearXNG or OpenRouter web
 * - `TOPIC_SEARCH_WEB_RESEARCH=searxng` — always SearXNG when the pipeline runs
 * - `TOPIC_SEARCH_WEB_RESEARCH=openrouter` — always OpenRouter web search
 * - **Unset** — if `SEARXNG_URL` is set → **searxng**; else → **openrouter**
 *
 * **Recommended stack:** SearXNG SERP (`searxng`) + OpenAI research models in admin (`openai/…`) — synthesis uses your OpenAI key; web retrieval uses SearXNG. OpenRouter's web plugin (`openrouter`) is an alternative SERP path and does not use the OpenAI API for search.
 *
 * **Optional:** `TOPIC_SEARCH_REFINE_SERP_QUERY=1` — one short LLM call before SERP to shape the query (uses `TOPIC_SEARCH_REFINE_QUERY_MODEL` or the research model). Pairs with SearXNG or OpenRouter web.
 */
export function getTopicSearchWebResearchMode(): TopicSearchWebResearchMode {
  const v = process.env.TOPIC_SEARCH_WEB_RESEARCH?.trim().toLowerCase();
  if (v === 'llm_only') return 'llm_only';
  if (v === 'searxng') return 'searxng';
  if (v === 'openrouter') return 'openrouter';
  // Legacy compat: treat 'brave' as 'searxng'
  if (v === 'brave') return 'searxng';
  return process.env.SEARXNG_URL?.trim() ? 'searxng' : 'openrouter';
}

/**
 * When true, run one short LLM call to shape an optimal SERP query before SearXNG / OpenRouter web search.
 * Env: `TOPIC_SEARCH_REFINE_SERP_QUERY=1` or `true`.
 */
export function getTopicSearchRefineSerpQueryEnabled(): boolean {
  const v = process.env.TOPIC_SEARCH_REFINE_SERP_QUERY?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Optional model id for refine only (e.g. `openai/gpt-4o-mini`). Falls back to research model. */
export function getTopicSearchRefineQueryModel(): string | undefined {
  const m = process.env.TOPIC_SEARCH_REFINE_QUERY_MODEL?.trim();
  return m || undefined;
}
