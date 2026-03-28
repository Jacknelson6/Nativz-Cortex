-- llm_v1 pipeline starts in pending_subtopics (subtopic plan step before processing).
-- 071 added columns but did not extend status CHECK.

-- Drop any existing CHECK on status (name may differ across DBs / restores).
DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'topic_searches'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE topic_searches DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

ALTER TABLE topic_searches
  ADD CONSTRAINT topic_searches_status_check
  CHECK (status IN ('pending', 'pending_subtopics', 'processing', 'completed', 'failed'));
