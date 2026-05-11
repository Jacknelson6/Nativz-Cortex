-- ============================================================
-- VFF-04: Reject reason + gate metadata on viral_videos
-- Idempotent: VFF-01 already added reject_reason. We re-declare
-- with IF NOT EXISTS so re-running this migration is safe.
-- ============================================================

ALTER TABLE viral_videos
  ADD COLUMN IF NOT EXISTS reject_reason TEXT,
  ADD COLUMN IF NOT EXISTS gate_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS gated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_viral_videos_reject_reason
  ON viral_videos(reject_reason)
  WHERE reject_reason IS NOT NULL;
