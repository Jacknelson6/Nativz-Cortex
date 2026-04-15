-- Phase 2a — per-harness skill scoping + per-client targeting.
-- Extends the existing `nerd_skills` table (GitHub-synced) so direct-upload
-- admin skills + client-specific skills live in the same pipeline. The
-- loader filters by `harnesses` and `client_id` at match time.

ALTER TABLE nerd_skills
  ADD COLUMN IF NOT EXISTS harnesses TEXT[] NOT NULL DEFAULT ARRAY['admin_nerd','admin_content_lab']::text[],
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'github';

ALTER TABLE nerd_skills
  ALTER COLUMN github_repo DROP NOT NULL,
  ALTER COLUMN github_path DROP NOT NULL,
  ALTER COLUMN github_branch DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nerd_skills_harnesses
  ON nerd_skills USING GIN (harnesses);
CREATE INDEX IF NOT EXISTS idx_nerd_skills_client
  ON nerd_skills(client_id) WHERE client_id IS NOT NULL;

COMMENT ON COLUMN nerd_skills.harnesses IS
  'Which harnesses load this skill: admin_nerd, admin_content_lab, portal_content_lab. Array so a single skill can apply in multiple surfaces (e.g. admin skill enabled for the client too).';
COMMENT ON COLUMN nerd_skills.client_id IS
  'Optional. If set, this skill only loads when that client is pinned. Null = applies across all clients in the matching harness(es).';
COMMENT ON COLUMN nerd_skills.source IS
  'github | upload — where the markdown body comes from.';

-- Phase 2b placeholder: improvement proposals generated from bad sessions.
CREATE TABLE IF NOT EXISTS ai_skill_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID REFERENCES nerd_skills(id) ON DELETE CASCADE,
  conversation_id UUID,
  proposed_title TEXT,
  proposed_description TEXT,
  proposed_content TEXT NOT NULL,
  proposed_harnesses TEXT[],
  proposed_client_id UUID,
  rationale TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_skill_proposals_pending
  ON ai_skill_proposals(created_at DESC) WHERE status = 'pending';

ALTER TABLE ai_skill_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_skill_proposals_admin_all ON ai_skill_proposals;
CREATE POLICY ai_skill_proposals_admin_all ON ai_skill_proposals
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'));

COMMENT ON TABLE ai_skill_proposals IS
  'Phase 2b placeholder — LLM-proposed edits to nerd_skills rows from flagged sessions. Admin reviews + accepts before the change lands on the live skill.';
