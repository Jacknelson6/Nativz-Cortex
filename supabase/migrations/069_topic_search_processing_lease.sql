-- Lease for POST /api/search/[id]/process single-flight (avoids duplicate pipelines on refresh / multiple tabs).
ALTER TABLE topic_searches
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

COMMENT ON COLUMN topic_searches.processing_started_at IS 'Set when a worker claims the search; cleared on complete/fail. Stale after 15m allows reclaim if a run died.';
