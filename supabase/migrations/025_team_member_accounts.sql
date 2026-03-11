-- Add user_id column to team_members to link to auth accounts
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_user_id
  ON team_members(user_id) WHERE user_id IS NOT NULL;

-- Team invite tokens for inviting team members to create admin accounts
CREATE TABLE IF NOT EXISTS team_invite_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  email text NOT NULL,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_invite_tokens_token ON team_invite_tokens(token);
CREATE INDEX IF NOT EXISTS idx_team_invite_tokens_team_member ON team_invite_tokens(team_member_id);

-- RLS
ALTER TABLE team_invite_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage team invites"
  ON team_invite_tokens FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- Public read for token validation (via service role in API, but policy for safety)
CREATE POLICY "Anyone can read invite by token"
  ON team_invite_tokens FOR SELECT
  USING (true);
