-- 271_clients_paid_media_webhook.sql
--
-- NAT-66: per-client paid-media group-chat webhook. When all creatives
-- in a calendar drop or editing project are approved, fire a Cortex link
-- into the ads team's group chat so they know the assets are live.
--
-- Distinct from `clients.chat_webhook_url` (= the editing/strategy team
-- chat, where revisions and project updates land). This column is the
-- ads/paid-media surface — different room, different audience.
--
-- Source of truth lives in the AC ops sheet today; this column lets us
-- migrate the hard-coded map in `lib/chat/calendar-team-webhooks.ts` to
-- a per-client value editable from the brand settings UI. Sync from the
-- sheet stays a follow-up.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS paid_media_webhook_url TEXT NULL;

COMMENT ON COLUMN clients.paid_media_webhook_url IS
  'Google Chat (or compatible) webhook for the client''s paid-media / ads team. Fires on all-approved on calendar drops and editing projects. NULL = no ping.';
