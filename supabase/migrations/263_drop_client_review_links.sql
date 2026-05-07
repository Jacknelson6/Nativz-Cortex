-- Migration 263: Retire the OLD calendar share-link flow.
--
-- The calendar Share button (POST /api/scheduler/share) now mints rich
-- /c/{token} links via content_drop_share_links + a synthetic
-- content_drops row (migration 262). The legacy /shared/calendar/{token}
-- viewer + its feedback API + the share resolver entry have been
-- removed in the same commit, so nothing reads or writes
-- client_review_links anymore.
--
-- Dropping the table is safe: existing share URLs that pointed at
-- /shared/calendar/{token} will now 404, which is the intended
-- "retired" behavior. New share links go through the rich viewer.
--
-- post_review_links + post_review_comments stay; those are the comment
-- substrate the new flow keeps using.

DROP TABLE IF EXISTS public.client_review_links CASCADE;
