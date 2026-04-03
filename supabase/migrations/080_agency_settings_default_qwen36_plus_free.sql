-- Align DB defaults and existing agency_settings with platform OpenRouter default (Qwen 3.6 Plus Preview free).

ALTER TABLE agency_settings
  ALTER COLUMN ai_model SET DEFAULT 'qwen/qwen3.6-plus-preview:free';

UPDATE agency_settings
SET
  ai_model = 'qwen/qwen3.6-plus-preview:free',
  topic_search_planner_model = 'qwen/qwen3.6-plus-preview:free',
  topic_search_research_model = 'qwen/qwen3.6-plus-preview:free',
  topic_search_merger_model = 'qwen/qwen3.6-plus-preview:free',
  nerd_model = 'qwen/qwen3.6-plus-preview:free',
  ideas_model = 'qwen/qwen3.6-plus-preview:free';
