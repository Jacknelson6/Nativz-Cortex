-- =============================================================================
-- PENDING MIGRATIONS — 2026-04-12
--
-- These migrations were never applied to production because the direct DB
-- host (db.phypsgxszrvwdaaqpxup.supabase.co) is unreachable from the
-- `npm run supabase:migrate` script. The Supabase REST OpenAPI schema
-- confirms all 5 target tables are missing.
--
-- HOW TO APPLY:
--   1. Open https://supabase.com/dashboard/project/phypsgxszrvwdaaqpxup/sql/new
--   2. Paste this entire file
--   3. Click "Run"
--
-- Safety: every statement uses IF NOT EXISTS / IF EXISTS guards so it's
-- idempotent — re-running is safe.
--
-- Migrations included:
--   039  nerd_conversations + nerd_messages  (core Nerd chat persistence)
--   095  audit_share_links                    (shareable audits)
--   096  nerd_conversations.client_id         (Strategy Lab per-client threads)
--   097  nerd_artifacts                       (artifact save/gallery)
--   098  nerd_conversation_share_links        (shareable Nerd chats)
-- =============================================================================

-- ── Migration 039: Nerd chat history ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nerd_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nerd_conversations_user
  ON nerd_conversations(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS nerd_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES nerd_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL DEFAULT '',
  tool_results JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nerd_messages_conversation
  ON nerd_messages(conversation_id, created_at ASC);

-- ── Migration 095: Audit share links ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES prospect_audits(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE audit_share_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can do everything on audit_share_links" ON audit_share_links;
CREATE POLICY "Admins can do everything on audit_share_links"
  ON audit_share_links FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS idx_audit_share_links_token ON audit_share_links(token);
CREATE INDEX IF NOT EXISTS idx_audit_share_links_audit ON audit_share_links(audit_id);

-- ── Migration 096: nerd_conversations.client_id ─────────────────────────────
ALTER TABLE nerd_conversations
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_nerd_conversations_user_client_updated
  ON nerd_conversations (user_id, client_id, updated_at DESC)
  WHERE client_id IS NOT NULL;
COMMENT ON COLUMN nerd_conversations.client_id IS
  'Optional client pinned to this conversation. Set at creation time from the first `client` @mention in the first user message. NULL for admin Nerd conversations started without a client context.';

-- ── Migration 097: Nerd artifacts ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nerd_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES nerd_conversations(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  content text NOT NULL,
  artifact_type text NOT NULL DEFAULT 'general'
    CHECK (artifact_type IN ('script', 'plan', 'diagram', 'ideas', 'hook', 'strategy', 'general')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nerd_artifacts_client_id ON nerd_artifacts(client_id);
CREATE INDEX IF NOT EXISTS idx_nerd_artifacts_created_by ON nerd_artifacts(created_by);
CREATE INDEX IF NOT EXISTS idx_nerd_artifacts_type ON nerd_artifacts(artifact_type);
CREATE INDEX IF NOT EXISTS idx_nerd_artifacts_created_at ON nerd_artifacts(created_at DESC);

ALTER TABLE nerd_artifacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins full access to nerd_artifacts" ON nerd_artifacts;
CREATE POLICY "Admins full access to nerd_artifacts"
  ON nerd_artifacts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Portal users read own org artifacts" ON nerd_artifacts;
CREATE POLICY "Portal users read own org artifacts"
  ON nerd_artifacts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN clients c ON c.organization_id = u.organization_id
      WHERE u.id = auth.uid()
      AND u.role = 'viewer'
      AND c.id = nerd_artifacts.client_id
    )
  );

-- ── Migration 098: Nerd conversation share links ────────────────────────────
CREATE TABLE IF NOT EXISTS nerd_conversation_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES nerd_conversations(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nerd_convo_share_token ON nerd_conversation_share_links(token);
CREATE INDEX IF NOT EXISTS idx_nerd_convo_share_convo_id ON nerd_conversation_share_links(conversation_id);

ALTER TABLE nerd_conversation_share_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins full access to nerd_conversation_share_links" ON nerd_conversation_share_links;
CREATE POLICY "Admins full access to nerd_conversation_share_links"
  ON nerd_conversation_share_links FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'super_admin')
    )
  );

-- ── Record in schema_migrations so the migrate script knows these ran ───────
INSERT INTO schema_migrations (filename, applied_at) VALUES
  ('039_create_nerd_chat_history.sql', now()),
  ('095_audit_share_links.sql', now()),
  ('096_nerd_conversations_client_id.sql', now()),
  ('097_nerd_artifacts.sql', now()),
  ('098_nerd_conversation_share_links.sql', now())
ON CONFLICT (filename) DO NOTHING;

-- Force PostgREST to reload the schema cache so new tables are exposed
NOTIFY pgrst, 'reload schema';
