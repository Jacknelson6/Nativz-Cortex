-- Artifact persistence for Nerd / Strategy Lab deliverables.
-- Stores saved outputs (scripts, video idea plans, content strategies,
-- mermaid diagrams, hook collections) so users can reference them later.

CREATE TABLE IF NOT EXISTS nerd_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES nerd_conversations(id) ON DELETE SET NULL,
  -- The user who saved the artifact
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  -- Full markdown content of the artifact
  content text NOT NULL,
  -- Categorization for filtering and display
  artifact_type text NOT NULL DEFAULT 'general'
    CHECK (artifact_type IN ('script', 'plan', 'diagram', 'ideas', 'hook', 'strategy', 'general')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_nerd_artifacts_client_id ON nerd_artifacts(client_id);
CREATE INDEX IF NOT EXISTS idx_nerd_artifacts_created_by ON nerd_artifacts(created_by);
CREATE INDEX IF NOT EXISTS idx_nerd_artifacts_type ON nerd_artifacts(artifact_type);
CREATE INDEX IF NOT EXISTS idx_nerd_artifacts_created_at ON nerd_artifacts(created_at DESC);

-- RLS
ALTER TABLE nerd_artifacts ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins full access to nerd_artifacts"
  ON nerd_artifacts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'super_admin')
    )
  );

-- Portal users can view artifacts for their org's clients
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
