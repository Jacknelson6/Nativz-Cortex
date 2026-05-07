-- 262_email_messages_no_click_escalated_at.sql
--
-- Per-message dedup flag for the "no click after 72h" escalation cron
-- (`/api/cron/calendar-no-click-escalation`). Stamped the moment the
-- chat ping fires for a given calendar-share send so re-runs of the
-- cron don't double-alert. We could have stamped a column on
-- `content_drop_share_links` instead, but a single share link can
-- generate multiple emails over its lifetime (initial send, revised
-- videos, manual resend) and each one deserves its own 72h clock.
--
-- The index is partial on `no_click_escalated_at IS NULL` because the
-- cron only ever queries the not-yet-escalated subset; no point
-- maintaining a B-tree over rows that already fired.

ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS no_click_escalated_at timestamptz;

CREATE INDEX IF NOT EXISTS email_messages_no_click_pending_idx
  ON public.email_messages (sent_at)
  WHERE no_click_escalated_at IS NULL
    AND clicked_at IS NULL
    AND delivered_at IS NOT NULL;

COMMENT ON COLUMN public.email_messages.no_click_escalated_at IS
  'Stamped by /api/cron/calendar-no-click-escalation when a calendar-share send has been delivered + unclicked for 72+ hours and an ops-channel chat ping has been posted. Per-message dedup so re-runs do not double-alert.';
