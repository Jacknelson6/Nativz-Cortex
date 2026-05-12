-- 308_synthetic_publish_canaries.sql
--
-- Synthetic publish smoke-test trail (PUB-04).
--
-- One row per canary publish attempt (one per platform per tick, ticked
-- every 6h). Lets us prove the full pipeline (Cortex -> Zernio -> platform
-- -> verify) is alive without waiting for a real client post to fail.
--
-- Lifecycle:
--   1. Cron schedules the canary -> insert with publish_status='pending',
--      late_post_id stamped from Zernio's publishPost response.
--   2. Same-or-later tick reads back via Zernio getPostStatus. If platform
--      came back published, flip publish_status='published'. If failed,
--      flip 'failed' + alert if 2-in-a-row.
--   3. After 30 minutes, re-probe to verify (mirrors PUB-02). Stamp
--      verification_status accordingly.
--   4. Once verified, delete the post from the platform via Zernio. Stamp
--      deleted_at. If delete fails, leave it; the canary content is
--      innocuous and the test account is private anyway.
--
-- Two-strike alert: a single failed canary is noise (Zernio blip, brief
-- platform 5xx). Two consecutive failures on the same platform pages Jack.
-- Implemented at query time, not as a separate column, by reading the most
-- recent N rows for the platform.

CREATE TABLE IF NOT EXISTS public.synthetic_publish_canaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  late_account_id TEXT,
  late_post_id TEXT,
  publish_status TEXT NOT NULL DEFAULT 'pending',
  publish_error TEXT,
  published_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  verification_status TEXT,
  verification_detail TEXT,
  deleted_at TIMESTAMPTZ,
  alerted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Constrain to documented states for both columns.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'synthetic_publish_canaries_publish_status_check'
  ) THEN
    ALTER TABLE public.synthetic_publish_canaries
      DROP CONSTRAINT synthetic_publish_canaries_publish_status_check;
  END IF;
END $$;

ALTER TABLE public.synthetic_publish_canaries
  ADD CONSTRAINT synthetic_publish_canaries_publish_status_check
  CHECK (publish_status IN ('pending', 'published', 'failed'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'synthetic_publish_canaries_verification_status_check'
  ) THEN
    ALTER TABLE public.synthetic_publish_canaries
      DROP CONSTRAINT synthetic_publish_canaries_verification_status_check;
  END IF;
END $$;

ALTER TABLE public.synthetic_publish_canaries
  ADD CONSTRAINT synthetic_publish_canaries_verification_status_check
  CHECK (verification_status IS NULL OR verification_status IN ('pending', 'confirmed', 'platform_reject', 'unverifiable'));

-- Claim queries look up by (platform, status) and by recent runs for the
-- two-strike check. Both want platform-scoped recency.
CREATE INDEX IF NOT EXISTS idx_synthetic_canaries_platform_created
  ON public.synthetic_publish_canaries (platform, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_synthetic_canaries_pending
  ON public.synthetic_publish_canaries (publish_status, scheduled_at)
  WHERE publish_status = 'pending' OR (publish_status = 'published' AND verification_status = 'pending');

COMMENT ON TABLE public.synthetic_publish_canaries IS
  'PUB-04 smoke-test trail. One row per canary publish attempt; cron writes pending->published->verified->deleted.';

COMMENT ON COLUMN public.synthetic_publish_canaries.publish_status IS
  'pending = scheduled with Zernio, awaiting platform confirm; published = Zernio reports success; failed = Zernio or platform rejected.';

COMMENT ON COLUMN public.synthetic_publish_canaries.verification_status IS
  'Mirror of PUB-02 states. NULL until the 30-minute round-trip verify probe runs.';

COMMENT ON COLUMN public.synthetic_publish_canaries.alerted_at IS
  'Stamped when the two-strike chat alert fires for this row. Stops re-alerting on the same failure across cron ticks.';
