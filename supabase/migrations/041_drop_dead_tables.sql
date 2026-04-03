-- ============================================================
-- Migration: Drop dead/scrapped tables
-- Date: 2026-04-03
-- 
-- Tables confirmed to have ZERO app code references.
-- These are old features that were built and scrapped,
-- or Postara artifacts that leaked into this project.
--
-- Tables intentionally KEPT (even if flagged):
--   - submissions / matchups: public voting/submission features
--   - content_ideas: used by app/api/concepts/
--   - competitors: referenced in prompt templates
--   - listening_reports, sentiment_snapshots, meta_page_snapshots,
--     meta_posts: original schema.sql tables, may be used by
--     background jobs — leaving these for manual review
-- ============================================================

-- Ad generation suite (Postara remnant — full ad creative pipeline)
DROP TABLE IF EXISTS public.ad_creatives CASCADE;
DROP TABLE IF EXISTS public.ad_generation_batches CASCADE;
DROP TABLE IF EXISTS public.ad_library_scrape_jobs CASCADE;
DROP TABLE IF EXISTS public.ad_prompt_templates CASCADE;
DROP TABLE IF EXISTS public.client_ad_generation_settings CASCADE;
DROP TABLE IF EXISTS public.brand_dna_jobs CASCADE;

-- AI nerd chat (scrapped feature)
DROP TABLE IF EXISTS public.nerd_conversations CASCADE;
DROP TABLE IF EXISTS public.nerd_messages CASCADE;

-- Idea generations (scrapped AI idea pipeline — different from idea_submissions which is live)
DROP TABLE IF EXISTS public.idea_generations CASCADE;

-- Topic search extensions (no app code, never shipped)
DROP TABLE IF EXISTS public.topic_search_videos CASCADE;
DROP TABLE IF EXISTS public.topic_search_hooks CASCADE;

-- Internal dev/seed tooling
DROP TABLE IF EXISTS public.workspace_seed_suppressions CASCADE;

-- Fix Postara function that leaked into this project
DROP FUNCTION IF EXISTS public.update_postara_updated_at() CASCADE;

-- Also fix the security migration's function search_path for is_admin
-- (already defined in 040 but let's ensure it's locked down)
ALTER FUNCTION public.is_admin() SET search_path = public;
