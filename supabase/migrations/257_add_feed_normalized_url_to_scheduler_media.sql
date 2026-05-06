-- 257_add_feed_normalized_url_to_scheduler_media.sql
-- ----------------------------------------------------------------------------
-- Cache column for Instagram-feed-compatible (4:5 letterboxed) renders of
-- scheduler_media rows. Populated lazily at publish-time by
-- lib/calendar/normalize-image-for-feed.ts when the source image's aspect
-- ratio falls outside Instagram's feed-acceptable [0.8, 1.91] range.
--
-- Without this fix, vertical 9:16 source images (the Land Shark drop on
-- 2026-05-06 was 3072x5504) get auto-routed by Zernio/Instagram to Stories
-- instead of the feed grid. Normalizing once at publish-time and caching the
-- URL keeps retries fast and avoids per-platform divergence in the published
-- mediaItems payload.
-- ----------------------------------------------------------------------------

alter table public.scheduler_media
  add column if not exists feed_normalized_url text;

comment on column public.scheduler_media.feed_normalized_url is
  'Cached public URL of the 4:5 letterboxed render used for Instagram feed posts when the source aspect ratio is outside [0.8, 1.91]. NULL means either the source is already in-range or no normalization has been attempted yet.';
