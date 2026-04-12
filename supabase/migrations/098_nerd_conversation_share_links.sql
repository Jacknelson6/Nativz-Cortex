-- Share links for Nerd conversations (public, no-login access)
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

-- RLS — admins manage, public reads via token (handled by API route, not RLS)
ALTER TABLE nerd_conversation_share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to nerd_conversation_share_links"
  ON nerd_conversation_share_links FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'super_admin')
    )
  );
