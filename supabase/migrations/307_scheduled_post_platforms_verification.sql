-- 307_scheduled_post_platforms_verification.sql
--
-- Post-publish round-trip verify (PUB-02).
--
-- Today `scheduled_post_platforms.status = 'published'` means "Zernio said
-- success." That's the floor, not the ceiling. The platform itself can
-- silently reject a post (IG content-type mismatch, TikTok shadow-removal,
-- YT processing failure) and Zernio's view never updates. We want an
-- independent confirmation pass that re-asks Zernio (which polls each
-- platform) after the post has had time to propagate, and pages Jack when
-- the platform says the post is gone or rejected.
--
-- Columns:
--   * published_at — stamped by the publish cron when a leg flips to
--     'published'. Verify cron uses this to scope its window
--     (`published_at > now() - 24h AND published_at < now() - 30 min`).
--     30-min floor is the IG indexing latency; 24h ceiling is the staleness
--     limit beyond which we'd act manually if at all.
--     Backfill: copy `scheduled_posts.published_at` for legs already in
--     'published' so the column isn't NULL for the in-flight backlog.
--   * last_verified_at / verification_status / verification_detail /
--     verification_attempts — per-leg verification state. 'pending' is the
--     starting state (set by default); 'confirmed' is the happy path;
--     'platform_reject' fires a chat ping with retry button; 'unverifiable'
--     is the polite shrug after N attempts when Zernio's API itself can't
--     answer reliably (no alert, just data for the ops dashboard).
--
-- Why an `_attempts` counter rather than just retrying forever: a leg that
-- Zernio's API can't answer for 6 hours is one of (a) a real reject the
-- platform won't surface via Zernio, (b) Zernio's polling pipeline stuck.
-- Either way it's not worth re-probing every 10 minutes — let it sit at
-- 'unverifiable' and bubble up into the dashboard's "ambiguous" pile.

ALTER TABLE public.scheduled_post_platforms
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE public.scheduled_post_platforms
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

ALTER TABLE public.scheduled_post_platforms
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE public.scheduled_post_platforms
  ADD COLUMN IF NOT EXISTS verification_detail TEXT;

ALTER TABLE public.scheduled_post_platforms
  ADD COLUMN IF NOT EXISTS verification_attempts INTEGER NOT NULL DEFAULT 0;

-- Constrain verification_status to the four documented states. The CHECK
-- is dropped/recreated defensively so re-runs are idempotent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scheduled_post_platforms_verification_status_check'
  ) THEN
    ALTER TABLE public.scheduled_post_platforms
      DROP CONSTRAINT scheduled_post_platforms_verification_status_check;
  END IF;
END $$;

ALTER TABLE public.scheduled_post_platforms
  ADD CONSTRAINT scheduled_post_platforms_verification_status_check
  CHECK (verification_status IN ('pending', 'confirmed', 'platform_reject', 'unverifiable'));

-- Backfill `published_at` for the in-flight backlog: copy the post-level
-- timestamp onto every leg that's already 'published'. Without this the
-- verify cron's window query would skip every existing row forever (NULL
-- never satisfies `published_at > now() - 24h`).
UPDATE public.scheduled_post_platforms spp
   SET published_at = sp.published_at
  FROM public.scheduled_posts sp
 WHERE spp.post_id = sp.id
   AND spp.status = 'published'
   AND spp.published_at IS NULL
   AND sp.published_at IS NOT NULL;

-- Already-shipped published legs should not get verified retroactively —
-- the platform has had days to indexing failures already, and we'd just
-- spam Jack with stale rejects we can no longer act on. Mark them
-- 'confirmed' so the verify cron's claim query (status='published' AND
-- verification_status='pending') excludes them.
UPDATE public.scheduled_post_platforms
   SET verification_status = 'confirmed',
       last_verified_at = now()
 WHERE status = 'published'
   AND verification_status = 'pending'
   AND (published_at IS NULL OR published_at < now() - interval '24 hours');

-- Hot index for the verify cron's claim query. Partial index keeps it
-- tiny — only legs currently in 'pending' state matter for the sweep.
CREATE INDEX IF NOT EXISTS idx_spp_verify_pending
  ON public.scheduled_post_platforms (published_at)
  WHERE status = 'published' AND verification_status = 'pending';

COMMENT ON COLUMN public.scheduled_post_platforms.published_at IS
  'Stamped by the publish cron when this leg first flips to status=published. Used by the verify cron to scope its 30min-24h window.';

COMMENT ON COLUMN public.scheduled_post_platforms.last_verified_at IS
  'Timestamp of the most recent verification probe (success or terminal). NULL while verification_status=pending.';

COMMENT ON COLUMN public.scheduled_post_platforms.verification_status IS
  'Independent post-publish verification state: pending (not yet checked), confirmed (Zernio re-probe agreed with platform), platform_reject (platform says post is gone/rejected -> chat ping fired), unverifiable (Zernio API never answered after N attempts -> no alert, just dashboard noise).';

COMMENT ON COLUMN public.scheduled_post_platforms.verification_detail IS
  'Free-form text written when verification_status flips to platform_reject or unverifiable. Becomes the body of the chat ping in the reject case.';

COMMENT ON COLUMN public.scheduled_post_platforms.verification_attempts IS
  'Count of probe attempts. The verify cron gives up at 6 attempts (~1h) and stamps unverifiable. Reset to 0 if a leg is re-published.';
