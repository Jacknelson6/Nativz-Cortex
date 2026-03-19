-- ============================================================================
-- Migration 044: Portal RLS Hardening
--
-- Secures all client-facing tables with proper Row Level Security so portal
-- users (role='viewer') can only access their own organization's data.
-- ============================================================================

-- ── Helper: reusable check for admin role ────────────────────────────────────
-- (Used in policy expressions below)

-- ── 1. users table ──────────────────────────────────────────────────────────

-- Add is_active column for portal user deactivation
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Admins: full access
CREATE POLICY "admin_all_users" ON users
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- Viewers: read own record only
CREATE POLICY "viewer_read_own_user" ON users
  FOR SELECT USING (id = auth.uid());

-- Viewers: update own record (name, avatar, etc.)
CREATE POLICY "viewer_update_own_user" ON users
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ── 2. organizations table ──────────────────────────────────────────────────

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Admins: full access
CREATE POLICY "admin_all_organizations" ON organizations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- Viewers: read own org only
CREATE POLICY "viewer_read_own_org" ON organizations
  FOR SELECT USING (
    id = (SELECT organization_id FROM users WHERE users.id = auth.uid())
  );

-- ── 3. contacts table — add viewer read policy ─────────────────────────────

-- (Already has admin policy, just add viewer read)
CREATE POLICY "viewer_read_own_contacts" ON contacts
  FOR SELECT USING (
    client_id IN (
      SELECT c.id FROM clients c
      WHERE c.organization_id = (
        SELECT organization_id FROM users WHERE users.id = auth.uid()
      )
    )
  );

-- ── 4. scheduled_posts — replace overly permissive policy ───────────────────

-- Drop the existing too-permissive policy
DROP POLICY IF EXISTS "Authenticated users can manage scheduled_posts" ON scheduled_posts;

-- Admins: full access
CREATE POLICY "admin_all_scheduled_posts" ON scheduled_posts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- Viewers: read own client's posts only
CREATE POLICY "viewer_read_own_scheduled_posts" ON scheduled_posts
  FOR SELECT USING (
    client_id IN (
      SELECT c.id FROM clients c
      WHERE c.organization_id = (
        SELECT organization_id FROM users WHERE users.id = auth.uid()
      )
    )
  );

-- ── 5. invite_tokens — add viewer read policy ──────────────────────────────

-- Viewers can see invites for their own org (status visibility in portal)
CREATE POLICY "viewer_read_own_invites" ON invite_tokens
  FOR SELECT USING (
    organization_id = (
      SELECT organization_id FROM users WHERE users.id = auth.uid()
    )
  );

-- ── 6. client_assignments — add viewer read policy ──────────────────────────

-- Viewers can see who's assigned to their client
CREATE POLICY "viewer_read_own_assignments" ON client_assignments
  FOR SELECT USING (
    client_id IN (
      SELECT c.id FROM clients c
      WHERE c.organization_id = (
        SELECT organization_id FROM users WHERE users.id = auth.uid()
      )
    )
  );
