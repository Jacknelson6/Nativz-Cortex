-- 149_drop_quora_threads.sql
--
-- Quora is no longer a supported search platform (Jack, 2026-04-23).
-- Drop the `quora_threads` column from `scraper_settings`. The
-- application-side code paths (lib/quora/, platform-router branch,
-- scraper-volumes UI row, source-enum entries, etc.) were removed in
-- the same commit — this migration is the DB half of that change.
--
-- Safe to rerun: `IF EXISTS` handles already-dropped state.

ALTER TABLE IF EXISTS public.scraper_settings
  DROP COLUMN IF EXISTS quora_threads;
