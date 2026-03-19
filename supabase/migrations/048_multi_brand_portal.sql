-- ============================================================================
-- 048: Multi-brand portal support
-- Allows portal users to belong to multiple client organizations and switch
-- between them. Junction table replaces the 1:1 user→organization mapping.
-- ============================================================================

-- Junction table: users can belong to multiple client orgs
CREATE TABLE IF NOT EXISTS user_client_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, client_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_client_access_user ON user_client_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_client_access_client ON user_client_access(client_id);

-- Migrate existing portal users: create user_client_access rows from users.organization_id
INSERT INTO user_client_access (user_id, client_id, organization_id)
SELECT u.id, c.id, c.organization_id
FROM users u
JOIN clients c ON c.organization_id = u.organization_id AND c.is_active = true
WHERE u.role = 'viewer' AND u.organization_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE user_client_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_access" ON user_client_access
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "admin_manage_access" ON user_client_access
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
