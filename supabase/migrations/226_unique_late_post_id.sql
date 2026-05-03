-- Migration 226: enforce uniqueness of scheduled_posts.late_post_id
--
-- WHY
-- The publish cron and the share-link approval handler both call
-- `publishScheduledPost`, which posts the row to Zernio and stamps
-- `late_post_id` with the returned MongoDB ObjectId. Until migration 226
-- the only guard against double-publish was the application-level
-- `status='draft'` precondition + an in-app CAS we shipped alongside this
-- migration. Both close the racy window, but neither is enforced at the
-- DB level. If a future code path stamps `late_post_id` outside that
-- guard (e.g. backfill scripts, manual ops) we want Postgres to refuse
-- the insert/update, not silently accept a duplicate that cancels the
-- prior Zernio post into orbit (the SafeStop incident).
--
-- This is a partial unique index — NULL values are allowed because
-- `late_post_id` is null for drafts and unpublished rows, which is the
-- normal state for ~half the table. A standard unique constraint would
-- forbid more than one NULL, breaking everything.
--
-- Verified before applying:
--   SELECT COUNT(*), COUNT(*) FILTER (WHERE late_post_id IS NOT NULL),
--          COUNT(DISTINCT late_post_id) FILTER (WHERE late_post_id IS NOT NULL)
--   FROM scheduled_posts;
--   → 231 / 123 / 123. No collisions to repair.
--
-- Drops the existing non-unique index to avoid carrying duplicate index
-- machinery; the unique partial index serves both lookup + uniqueness.

DROP INDEX IF EXISTS public.idx_scheduled_posts_late_post_id;

CREATE UNIQUE INDEX IF NOT EXISTS scheduled_posts_late_post_id_unique
  ON public.scheduled_posts (late_post_id)
  WHERE late_post_id IS NOT NULL;
