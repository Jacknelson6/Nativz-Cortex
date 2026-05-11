-- Dedup column for the missing-core-platforms cron at
-- /api/cron/missing-core-platforms. The cron walks every active, non-paused
-- client that has posted in the last 30 days and pings Google Chat when one
-- of the core four (Facebook, Instagram, TikTok, YouTube) has no
-- social_profiles row. Without this column we would re-ping every run.
--
-- The cron resets this stamp whenever a missing platform is filled or the
-- gap set changes, so a new gap (e.g. a previously-connected IG account
-- gets removed) re-alerts even within the dedup window.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS missing_platforms_alerted_at TIMESTAMPTZ;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS missing_platforms_last_set TEXT;

COMMENT ON COLUMN public.clients.missing_platforms_alerted_at IS
  'Last time the missing-core-platforms cron pinged Google Chat about this client. Used to throttle repeat alerts to once per 7 days unless the gap set changes.';

COMMENT ON COLUMN public.clients.missing_platforms_last_set IS
  'Comma-joined sorted list of missing core platforms the last alert covered (e.g. "instagram,tiktok"). If the current gap set differs we re-alert immediately, bypassing the 7-day throttle.';
