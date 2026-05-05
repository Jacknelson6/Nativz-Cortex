-- 250_backfill_share_link_followups.sql
--
-- Backfill content_drop_share_links.{last_followup_at, followup_count} from
-- the email_messages source-of-truth.
--
-- Why:
-- The /admin/scheduler "Last followup" column reads these two columns off
-- the share-link row, but only the manual-followup route + the new
-- unified-cadence cron stamp them. Earlier nudges (legacy no-open / no-action
-- reminders, the final-call sender, the manual followup that bypasses the
-- in-app stamp, anything sent before migration 200 even existed) all landed
-- in email_messages with a recognizable type_key but never bumped the
-- counter. So the History tab on the share dialog correctly shows "Follow-up
-- email sent on Mar 4" while the table column shows blank for the same row.
--
-- This migration recomputes both fields from email_messages, scoped to
-- emails sent AFTER each link was minted (so re-mints don't inherit the
-- previous link's nudge count). GREATEST() guards against ever lowering a
-- value the live code path has already set since the migration was authored.

WITH followup_emails AS (
  SELECT
    em.drop_id,
    COALESCE(em.sent_at, em.created_at) AS at
  FROM email_messages em
  WHERE em.drop_id IS NOT NULL
    AND COALESCE(em.status, 'sent') NOT IN ('failed', 'bounced')
    AND (
      em.type_key IN (
        'calendar_followup',
        'calendar_final_call',
        'calendar_no_open_reminder',
        'calendar_no_action_reminder'
      )
      OR em.type_key LIKE 'calendar_cadence_followup_%'
    )
),
per_link AS (
  SELECT
    l.id AS link_id,
    COUNT(fe.at) AS sent_count,
    MAX(fe.at)   AS last_at
  FROM content_drop_share_links l
  JOIN followup_emails fe
    ON fe.drop_id = l.drop_id
   AND fe.at >= l.created_at
  GROUP BY l.id
)
UPDATE content_drop_share_links AS l
   SET followup_count   = GREATEST(COALESCE(l.followup_count, 0), pl.sent_count),
       last_followup_at = GREATEST(l.last_followup_at, pl.last_at)
  FROM per_link pl
 WHERE l.id = pl.link_id
   AND pl.sent_count > 0;
