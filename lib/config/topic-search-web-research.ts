export type TopicSearchWebResearchMode = 'searxng' | 'openrouter' | 'llm_only';

/**
 * How llm_v1 gathers material for each subtopic:
 * - `searxng` — SearXNG SERP + URL fetch (self-hosted, needs `SEARXNG_URL` or defaults to localhost:8888). General web uses the DuckDuckGo engine by default (`SEARXNG_WEB_ENGINES`, default `duckduckgo`).
 * - `openrouter` — OpenRouter web plugin on `TOPIC_SEARCH_OPENROUTER_WEB_MODEL` (default `google/gemini-2.0-flash-001`) + URL fetch
 * - `llm_only` — no live SERP; **sources list is empty** (no fabricated URLs)
 *
 * Env:
 * - `TOPIC_SEARCH_WEB_RESEARCH=llm_only` — never call SearXNG or OpenRouter web
 * - `TOPIC_SEARCH_WEB_RESEARCH=searxng` — always SearXNG when the pipeline runs
 * - `TOPIC_SEARCH_WEB_RESEARCH=openrouter` — always OpenRouter web search
 * - **Unset** → **searxng** (SearXNG is always running locally)
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

  // Auto-detect: in production (Vercel), the SearXNG default of localhost:8888
  // never resolves — every subtopic ends up throwing ENOTFOUND and falling
  // back to llm_only, which silently produces 0 research sources. So if no
  // explicit mode is set AND SEARXNG_URL points at localhost (or is unset),
  // default to OpenRouter's web plugin instead. Local dev still gets searxng
  // since it actually runs there.
  const isProd = !!process.env.VERCEL || process.env.NODE_ENV === 'production';
  if (isProd) {
    const url = process.env.SEARXNG_URL?.trim() ?? '';
    const isLocalUrl = !url || url.includes('localhost') || url.includes('127.0.0.1');
    if (isLocalUrl) return 'openrouter';
  }

  return 'searxng';
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
