-- 263_clients_is_paused.sql
--
-- Adds a third lifecycle state to public.clients: paused. Distinct from
-- `is_active=false`, which marks a client as fully off (no work, no
-- publishing, no notifications). Paused = "still on the books, but we are
-- not actively working on them right now" — typically a brand that
-- temporarily hit pause on the contract but expects to resume.
--
-- Why a separate flag instead of a single status enum: keeps the existing
-- `is_active` semantics untouched (every active/inactive call site stays
-- correct without a backfill). Renders as its own section in
-- /admin/clients between Active buckets and Inactive.
--
-- Default false so every existing row keeps its current behavior.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clients.is_paused IS
  'Soft-pause flag. True when the client is still on the books but not actively being worked on (temporary contract pause, etc). Distinct from is_active=false which is a hard stop. Surfaced as a Paused section in /admin/clients.';
