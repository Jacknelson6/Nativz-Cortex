-- 253_ad_concept_share_all_approved_stamp.sql
-- Atomic dedup for the "🎉 all concepts approved" celebration ping on the
-- static-ad share path. Mirrors `content_drop_share_links.all_approved_notified_at`
-- (the SMM calendar equivalent) so two concurrent approvals can't both win the
-- claim and fire the celebration twice. The notify path uses
--   UPDATE ... SET all_approved_notified_at = now()
--    WHERE id = $1 AND all_approved_notified_at IS NULL
-- to atomically claim the right to send the ping.

ALTER TABLE ad_concept_share_tokens
  ADD COLUMN IF NOT EXISTS all_approved_notified_at TIMESTAMPTZ;
