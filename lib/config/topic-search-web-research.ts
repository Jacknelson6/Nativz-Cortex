export type TopicSearchWebResearchMode = 'brave' | 'openrouter' | 'llm_only';

/**
 * How llm_v1 gathers material for each subtopic:
 * - `brave` — Brave SERP + URL fetch (needs `BRAVE_SEARCH_API_KEY`)
 * - `openrouter` — OpenRouter web plugin on `TOPIC_SEARCH_OPENROUTER_WEB_MODEL` (default `google/gemini-2.0-flash-001`) + URL fetch
 * - `llm_only` — no live SERP; **sources list is empty** (no fabricated URLs)
 *
 * Env:
 * - `TOPIC_SEARCH_WEB_RESEARCH=llm_only` — never call Brave or OpenRouter web
 * - `TOPIC_SEARCH_WEB_RESEARCH=brave` — always Brave when the pipeline runs
 * - `TOPIC_SEARCH_WEB_RESEARCH=openrouter` — always OpenRouter web search
 * - **Unset** — if `BRAVE_SEARCH_API_KEY` is set → **brave**; else → **openrouter** (no Brave key required)
 *
 * **Recommended stack:** Brave SERP (`brave`) + OpenAI research models in admin (`openai/…`) — synthesis uses your OpenAI key; web retrieval uses Brave. OpenRouter’s web plugin (`openrouter`) is an alternative SERP path and does not use the OpenAI API for search.
 *
 * **Optional:** `TOPIC_SEARCH_REFINE_SERP_QUERY=1` — one short LLM call before SERP to shape the query (uses `TOPIC_SEARCH_REFINE_QUERY_MODEL` or the research model). Pairs with Brave or OpenRouter web.
 */
export function getTopicSearchWebResearchMode(): TopicSearchWebResearchMode {
  const v = process.env.TOPIC_SEARCH_WEB_RESEARCH?.trim().toLowerCase();
  if (v === 'llm_only') return 'llm_only';
  if (v === 'brave') return 'brave';
  if (v === 'openrouter') return 'openrouter';
  return process.env.BRAVE_SEARCH_API_KEY?.trim() ? 'brave' : 'openrouter';
}

/** True when Brave returned 429 / rate limit (string body from our client). */
export function isBraveRateLimitError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /429|rate.?limit|RATE_LIMITED/i.test(msg);
}

/**
 * When true, run one short LLM call to shape an optimal SERP query before Brave / OpenRouter web search.
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
