-- 230_misc_catchall_webhook.sql
--
-- Adds the "miscellaneous catchall" flag to clients. A single client per
-- agency may be marked as the catchall; its `chat_webhook_url` is used as
-- the team-notification fallback whenever another client in the same agency
-- has no webhook of its own.
--
-- Why: ~4 active Nativz clients have no `chat_webhook_url`, which means the
-- team-side notify-revisions / caption / comment / reminder paths silently
-- no-op. Jack wants those to land in a catchall Google Chat space instead.
--
-- The resolver is a one-liner: client.chat_webhook_url ?? catchall.chat_webhook_url.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS is_misc_catchall BOOLEAN NOT NULL DEFAULT false;

-- At most one catchall per agency. NULL agencies are allowed to have one too
-- (rare, but we shouldn't crash on legacy unsigned clients).
CREATE UNIQUE INDEX IF NOT EXISTS clients_misc_catchall_per_agency
  ON public.clients (agency)
  WHERE is_misc_catchall = true;

COMMENT ON COLUMN public.clients.is_misc_catchall IS
  'When true, this client''s chat_webhook_url is the team-notification catchall '
  'for every other client in the same agency that has no webhook of its own. '
  'Enforced unique per agency by clients_misc_catchall_per_agency.';
