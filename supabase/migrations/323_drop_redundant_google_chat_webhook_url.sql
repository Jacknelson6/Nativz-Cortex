-- Migration 323: drop the redundant clients.google_chat_webhook_url
-- column that migration 322 added in error.
--
-- Background. Migration 322 added a new per-client Google Chat webhook
-- column to route phase-change events. It turned out the existing
-- clients.chat_webhook_url column was already populated for every
-- active client and is the canonical per-client Chat target. The new
-- column was never written to in any code path, so drop it.

ALTER TABLE clients DROP COLUMN IF EXISTS google_chat_webhook_url;
