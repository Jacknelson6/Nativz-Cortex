# Topic Search — LLM pipeline

Read when working on `app/api/topic-search/**`, the topic-search pipeline (`lib/topic-search/**`), or anything that touches SearXNG / OpenRouter / OpenAI research models.

## Pipeline

Two pipelines exist. Default is **`llm_v1`**. Set `TOPIC_SEARCH_PIPELINE=legacy` for the old multi-platform scrape path.

## Recommended setup (self-hosted SearXNG)

- `SEARXNG_URL` — defaults to `http://localhost:8888`
- `SEARXNG_WEB_ENGINES` — defaults to `duckduckgo`
- General web SERP runs through SearXNG → DuckDuckGo
- **OpenAI** runs synthesis (and optional query shaping when `TOPIC_SEARCH_REFINE_SERP_QUERY=1`)
- Pick OpenAI research models via `openai/…` in admin or `TOPIC_SEARCH_*_MODEL` env

## Fallback (no SearXNG)

If `SEARXNG_URL` is unset, default **openrouter** web search uses the OpenRouter API (not OpenAI) for retrieval.

## Toggles

- `TOPIC_SEARCH_WEB_RESEARCH=llm_only` — findings only, no live SERP
- `TOPIC_SEARCH_REFINE_QUERY_MODEL` — refine-only model override
- `TOPIC_SEARCH_PIPELINE=legacy` — old multi-platform scrape path (else `llm_v1`)
- `TOPIC_SEARCH_PLANNER_MODEL` / `TOPIC_SEARCH_RESEARCH_MODEL` / `TOPIC_SEARCH_MERGER_MODEL` — per-stage model overrides

## Migration

Apply `supabase/migrations/071_topic_search_llm_pipeline.sql` before relying on `llm_v1` columns in production.
