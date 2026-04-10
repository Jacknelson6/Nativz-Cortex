-- Migration 096: link nerd_conversations to clients so the Strategy Lab Nerd
-- conversation picker can list threads per client.
--
-- `client_id` is nullable on purpose — admin Nerd conversations that aren't
-- tied to a specific client continue to work the same way they did before
-- this migration. Only new conversations that start with a client @mention
-- get tagged (see app/api/nerd/chat/route.ts, new-conversation branch).
--
-- Additive only: new nullable column + a partial index scoped to rows with
-- a client. Backfill for existing conversations is intentionally skipped —
-- historical admin Nerd threads stay unlinked.

ALTER TABLE nerd_conversations
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nerd_conversations_user_client_updated
  ON nerd_conversations (user_id, client_id, updated_at DESC)
  WHERE client_id IS NOT NULL;

COMMENT ON COLUMN nerd_conversations.client_id IS
  'Optional client pinned to this conversation. Set at creation time from the first `client` @mention in the first user message. NULL for admin Nerd conversations started without a client context. Used by the Strategy Lab conversation picker to scope per-client thread history.';
