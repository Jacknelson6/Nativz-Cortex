-- LLM-native topic search (v3): subtopics, pipeline kind, structured sources

ALTER TABLE topic_searches
  ADD COLUMN IF NOT EXISTS topic_pipeline TEXT NOT NULL DEFAULT 'legacy';

ALTER TABLE topic_searches
  ADD COLUMN IF NOT EXISTS subtopics JSONB;

ALTER TABLE topic_searches
  ADD COLUMN IF NOT EXISTS research_sources JSONB;

ALTER TABLE topic_searches
  ADD COLUMN IF NOT EXISTS pipeline_state JSONB;

COMMENT ON COLUMN topic_searches.topic_pipeline IS 'legacy | llm_v1 — which backend pipeline runs on POST /process';
COMMENT ON COLUMN topic_searches.subtopics IS 'Confirmed subtopic strings (1–5) for llm_v1 before processing';
COMMENT ON COLUMN topic_searches.research_sources IS 'Deduped tool-backed sources for llm_v1 reports';
COMMENT ON COLUMN topic_searches.pipeline_state IS 'Optional debug: per-stage timings, token totals';
