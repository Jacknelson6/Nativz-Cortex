-- Topic search (llm_v1) model overrides — OpenRouter ids, editable from admin AI models page
ALTER TABLE agency_settings
  ADD COLUMN IF NOT EXISTS topic_search_planner_model text,
  ADD COLUMN IF NOT EXISTS topic_search_research_model text,
  ADD COLUMN IF NOT EXISTS topic_search_merger_model text;

COMMENT ON COLUMN agency_settings.topic_search_planner_model IS 'OpenRouter id for POST /plan-subtopics (subtopic suggestions)';
COMMENT ON COLUMN agency_settings.topic_search_research_model IS 'OpenRouter id for per-subtopic research in llm_v1';
COMMENT ON COLUMN agency_settings.topic_search_merger_model IS 'OpenRouter id for final merge; empty = use platform primary + fallbacks';
