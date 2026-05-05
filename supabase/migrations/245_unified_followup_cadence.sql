-- Unified follow-up cadence + auto-approve columns for both surfaces.
--
-- Replaces the calendar's three separate "no_open" / "no_action" / "final_call"
-- nudges with a single 3-stage cadence that fires when the client has left no
-- comments / approvals / change requests since the last share-link send:
--
--   T+72h  → followup_1
--   T+120h → followup_2
--   T+168h → followup_3 (final call before publishing / before we mark approved)
--   T+216h → auto_approved (every pending post on the link gets approved)
--
-- Anchor for the cadence is the most recent client-facing send:
--   • calendar : content_drop_share_links.last_sent_at
--   • editing  : editing_project_share_links.last_review_email_sent_at
--
-- We add identical columns to both tables so the cron handlers can share shape.
-- The legacy calendar columns (no_open_nudge_sent_at, no_action_nudge_sent_at,
-- final_call_sent_at) stay in place so the old cron stays runnable until the
-- new cadence ships, but they are no longer the source of truth.

ALTER TABLE content_drop_share_links
  ADD COLUMN IF NOT EXISTS followup_1_sent_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS followup_2_sent_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS followup_3_sent_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS auto_approved_at   TIMESTAMPTZ NULL;

ALTER TABLE editing_project_share_links
  ADD COLUMN IF NOT EXISTS followup_1_sent_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS followup_2_sent_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS followup_3_sent_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS auto_approved_at   TIMESTAMPTZ NULL;

COMMENT ON COLUMN content_drop_share_links.followup_1_sent_at IS
  'Timestamp the 1st cadence follow-up email fired (T+72h after last_sent_at, no client activity).';
COMMENT ON COLUMN content_drop_share_links.followup_2_sent_at IS
  'Timestamp the 2nd cadence follow-up email fired (T+120h after last_sent_at, no client activity).';
COMMENT ON COLUMN content_drop_share_links.followup_3_sent_at IS
  'Timestamp the 3rd cadence follow-up email fired (T+168h, "final call before publishing").';
COMMENT ON COLUMN content_drop_share_links.auto_approved_at IS
  'Timestamp the cron auto-approved every pending post on this link (T+216h, no activity since last send).';

COMMENT ON COLUMN editing_project_share_links.followup_1_sent_at IS
  'Timestamp the 1st cadence follow-up email fired (T+72h after last_review_email_sent_at, no client activity).';
COMMENT ON COLUMN editing_project_share_links.followup_2_sent_at IS
  'Timestamp the 2nd cadence follow-up email fired (T+120h after last_review_email_sent_at, no client activity).';
COMMENT ON COLUMN editing_project_share_links.followup_3_sent_at IS
  'Timestamp the 3rd cadence follow-up email fired (T+168h, "last check before we mark as approved").';
COMMENT ON COLUMN editing_project_share_links.auto_approved_at IS
  'Timestamp the cron auto-approved every pending video on this link (T+216h, no activity since last send).';

CREATE INDEX IF NOT EXISTS idx_content_drop_share_links_cadence_pending
  ON content_drop_share_links (last_sent_at)
  WHERE auto_approved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_editing_project_share_links_cadence_pending
  ON editing_project_share_links (last_review_email_sent_at)
  WHERE auto_approved_at IS NULL;
