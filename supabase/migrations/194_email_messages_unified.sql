-- 194_email_messages_unified.sql
--
-- Make email_messages the single source of truth for every email Cortex sends.
-- Today most transactional emails (calendar deliveries, post-health alerts,
-- invites, share-link reminders, weekly reports, etc.) skip the table — Resend
-- sends them but no row gets logged, and the webhook updates dead-end into
-- email_webhook_events with nothing to attach to. This adds the columns the
-- centralized sendAndLog() wrapper needs to capture every send + its rendered
-- HTML so the Email Hub UI can render an inline preview for any email.

ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'campaign'
    CHECK (category IN ('campaign', 'transactional', 'system')),
  ADD COLUMN IF NOT EXISTS type_key text,
  ADD COLUMN IF NOT EXISTS body_html text,
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS from_name text,
  ADD COLUMN IF NOT EXISTS reply_to_address text,
  ADD COLUMN IF NOT EXISTS cc text[],
  ADD COLUMN IF NOT EXISTS bcc text[],
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS drop_id uuid REFERENCES content_drops(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS email_messages_category_idx
  ON email_messages (category, created_at DESC);

CREATE INDEX IF NOT EXISTS email_messages_type_key_idx
  ON email_messages (type_key, created_at DESC) WHERE type_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_messages_client_idx
  ON email_messages (client_id, created_at DESC) WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_messages_drop_idx
  ON email_messages (drop_id, created_at DESC) WHERE drop_id IS NOT NULL;
