-- Structured topic plan artifacts produced by the Nerd's create_topic_plan tool.
-- The Nerd calls the tool with a structured body (series + per-idea stats);
-- we persist the JSON verbatim and regenerate the .docx on download. Keeping
-- plan_json as a single JSONB column instead of normalizing avoids a schema
-- change every time we tune the deliverable shape.

CREATE TABLE IF NOT EXISTS topic_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),
  title TEXT NOT NULL,
  subtitle TEXT,
  plan_json JSONB NOT NULL,
  topic_search_ids UUID[] DEFAULT ARRAY[]::UUID[],
  created_by UUID REFERENCES auth.users(id),
  conversation_id UUID REFERENCES nerd_conversations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_topic_plans_client ON topic_plans(client_id);
CREATE INDEX IF NOT EXISTS idx_topic_plans_created_at ON topic_plans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_topic_plans_conversation ON topic_plans(conversation_id);

ALTER TABLE topic_plans ENABLE ROW LEVEL SECURITY;

-- Admins see everything. Portal viewers only see plans for clients in their org.
CREATE POLICY topic_plans_admin_all ON topic_plans
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );

CREATE POLICY topic_plans_viewer_read ON topic_plans
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'viewer'
        AND users.organization_id = topic_plans.organization_id
    )
  );
