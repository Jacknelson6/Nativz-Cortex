-- 174_drop_old_spy_system.sql
-- =============================================================================
-- Sunset the legacy spy stack now that /spying runs on the new
-- `client_benchmarks` + `benchmark_snapshots` model.
--
-- Drops, in dependency order:
--   * Views unified_competitors, unified_competitor_snapshots
--     (read-side compatibility shims from migration 129)
--   * Orphaned, empty Meta-scrape staging tables that only existed to
--     hang off the old `competitors` table:
--       meta_page_snapshots, meta_posts
--   * The whole idea-reaction system, also orphaned:
--       content_ideas (only consumer was the deleted VideoIdeaCard +
--       /api/concepts/react route, which were ripped this same pass)
--   * The old spy tables themselves:
--       competitor_reports, competitor_report_subscriptions,
--       client_competitors, competitor_snapshots, competitors,
--       listening_reports, trend_reports, trend_report_subscriptions,
--       sentiment_snapshots
--
-- Tracked competitors now live in client_benchmarks.competitors_snapshot
-- (JSONB) and the weekly cron writes new rows to benchmark_snapshots.
-- =============================================================================

BEGIN;

-- 1. Drop the read-side view compatibility shims first so their
--    underlying tables can be dropped cleanly.
DROP VIEW IF EXISTS public.unified_competitors CASCADE;
DROP VIEW IF EXISTS public.unified_competitor_snapshots CASCADE;

-- 2. Orphaned Meta-scrape staging tables (both empty, no code refs).
DROP TABLE IF EXISTS public.meta_page_snapshots CASCADE;
DROP TABLE IF EXISTS public.meta_posts CASCADE;

-- 3. Orphaned idea-reaction table. The only consumer was VideoIdeaCard +
--    /api/concepts/react, both deleted this pass.
DROP TABLE IF EXISTS public.content_ideas CASCADE;

-- 4. Old spy tables. Dependency-leaf tables first so CASCADE doesn't
--    do extra surprise work, but every drop is `IF EXISTS` so re-running
--    after a partial apply is safe.
DROP TABLE IF EXISTS public.competitor_report_subscriptions CASCADE;
DROP TABLE IF EXISTS public.competitor_reports CASCADE;
DROP TABLE IF EXISTS public.competitor_snapshots CASCADE;
DROP TABLE IF EXISTS public.client_competitors CASCADE;
DROP TABLE IF EXISTS public.competitors CASCADE;

DROP TABLE IF EXISTS public.trend_report_subscriptions CASCADE;
DROP TABLE IF EXISTS public.trend_reports CASCADE;

DROP TABLE IF EXISTS public.sentiment_snapshots CASCADE;
DROP TABLE IF EXISTS public.listening_reports CASCADE;

COMMIT;
