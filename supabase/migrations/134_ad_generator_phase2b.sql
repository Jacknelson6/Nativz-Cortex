-- 134_ad_generator_phase2b.sql — Share tokens, comments, and chat history
-- ----------------------------------------------------------------------------
-- Phase 2b of the Ad Generator rebuild adds:
--   1. ad_concept_share_tokens — per-batch share links for client review
--   2. ad_concept_comments     — per-concept comments clients leave via the
--                                share link; admin sweeps them via chat
--                                commands or the detail dialog
--   3. ad_generator_messages   — multi-turn conversation history for the
--                                chat intake; each batch is an assistant
--                                turn, slash commands are their own turns

-- ----------------------------------------------------------------------------
-- 1. Share tokens
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ad_concept_share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Opaque URL-safe token. Generated application-side (32 bytes of randomness
  -- base64url-encoded) so there's no way to enumerate tokens by guessing
  -- UUIDs. Stored hashed would be even stronger but gets in the way of
  -- admins who want to regenerate a share URL — hashing is a later hardening.
  token TEXT NOT NULL UNIQUE,

  -- Scope: either a single batch (the common case — "here's today's drop")
  -- or an all-client gallery if the admin wants to share the full concept
  -- library. batch_id nullable to allow the second case.
  batch_id UUID REFERENCES ad_generation_batches(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Optional admin-facing label shown in the Share tab ("Q2 Testimonial drop",
  -- etc.). The client-facing page shows the client/batch context, not this.
  label TEXT,

  -- Lifecycle controls. expires_at lets admins set short-lived review
  -- windows; revoked_at is a manual kill switch.
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_share_tokens_client ON ad_concept_share_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_share_tokens_batch ON ad_concept_share_tokens(batch_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_share_tokens_token ON ad_concept_share_tokens(token);

ALTER TABLE ad_concept_share_tokens ENABLE ROW LEVEL SECURITY;

-- Admin-only read/write. The public shared page uses the service role via
-- createAdminClient() in a dedicated public API route, so no anon policy here.
CREATE POLICY "admins full access on share tokens"
  ON ad_concept_share_tokens FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = TRUE)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = TRUE)
    )
  );

-- ----------------------------------------------------------------------------
-- 2. Concept comments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ad_concept_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  concept_id UUID NOT NULL REFERENCES ad_concepts(id) ON DELETE CASCADE,

  -- When a comment arrives via the share link, we record which token it came
  -- through. When an admin leaves a comment from the admin UI, this is null
  -- and author_user_id is populated instead. Exactly one of these two is set.
  share_token_id UUID REFERENCES ad_concept_share_tokens(id) ON DELETE SET NULL,
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Client commenters type their own name. Stored plain — this is the name
  -- the admin sees next to the comment, nothing security-sensitive.
  author_name TEXT NOT NULL,

  body TEXT NOT NULL,

  -- Typed reactions so the client can thumbs-up without typing. 'comment'
  -- is the default for typed replies.
  kind TEXT NOT NULL DEFAULT 'comment'
    CHECK (kind IN ('comment', 'approval', 'rejection')),

  -- Admin marks when they've actioned the comment (regen'd, approved, etc.)
  -- so the shared page can show "acknowledged".
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_concept_comments_concept ON ad_concept_comments(concept_id);
CREATE INDEX IF NOT EXISTS idx_concept_comments_token ON ad_concept_comments(share_token_id);
CREATE INDEX IF NOT EXISTS idx_concept_comments_concept_created
  ON ad_concept_comments(concept_id, created_at DESC);

ALTER TABLE ad_concept_comments ENABLE ROW LEVEL SECURITY;

-- Admin full access. Public submissions via share-token route use the
-- service role, so no anon policy.
CREATE POLICY "admins full access on concept comments"
  ON ad_concept_comments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = TRUE)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = TRUE)
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Chat history for the Ad Generator intake
-- ----------------------------------------------------------------------------
-- Keeps the multi-turn conversation so admins can see what they asked for
-- across a session. Each batch generation is an assistant turn; slash
-- commands ("/regen concept-03 without product photo") are their own
-- user+assistant pair. Storing as messages instead of replaying from
-- batches alone lets us show revision commands in context.
CREATE TABLE IF NOT EXISTS ad_generator_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),

  -- Plain-text content. The assistant turn for a generation contains a
  -- short summary (e.g. "Generated 20 concepts"); the actual concepts
  -- live in ad_concepts and are joined by batch_id for rendering.
  content TEXT NOT NULL,

  -- Optional batch reference — populated when the message spawned a
  -- generation batch. UI uses this to render the inline concept
  -- preview under the assistant bubble.
  batch_id UUID REFERENCES ad_generation_batches(id) ON DELETE SET NULL,

  -- Slash command that drove the message (regen, approve, reject,
  -- delete, bulk_approve, etc.). Null for plain free-text prompts.
  command TEXT,

  -- Structured metadata for commands: { conceptIds: [...], pattern: 'testimonial-stack' }
  -- Kept as jsonb so the UI can render "Approved 7 testimonial-stacks"
  -- without another round-trip.
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_gen_messages_client_created
  ON ad_generator_messages(client_id, created_at DESC);

ALTER TABLE ad_generator_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins full access on ad_generator_messages"
  ON ad_generator_messages FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = TRUE)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = TRUE)
    )
  );