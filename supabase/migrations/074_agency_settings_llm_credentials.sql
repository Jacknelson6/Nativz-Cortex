-- Per-feature LLM API keys (OpenRouter + optional direct OpenAI) and default models for Nerd / ideas
ALTER TABLE agency_settings
  ADD COLUMN IF NOT EXISTS llm_provider_keys jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE agency_settings
  ADD COLUMN IF NOT EXISTS nerd_model text;

ALTER TABLE agency_settings
  ADD COLUMN IF NOT EXISTS ideas_model text;

COMMENT ON COLUMN agency_settings.llm_provider_keys IS
  'JSON: { "openrouter"?: { "default"|"topic_search"|"nerd"|"ideas": string }, "openai"?: { same buckets } } — overrides OPENROUTER_API_KEY / OPENAI_API_KEY per workload';
COMMENT ON COLUMN agency_settings.nerd_model IS 'Model id for The Nerd chat (e.g. anthropic/…, openai/gpt-4o-mini); empty = openrouter/hunter-alpha';
COMMENT ON COLUMN agency_settings.ideas_model IS 'Model id for /api/ideas/generate; empty = platform primary + fallbacks';
