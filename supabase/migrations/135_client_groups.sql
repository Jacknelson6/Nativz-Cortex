-- 135_client_groups.sql — HubSpot-style CRM pipeline groups for clients
-- ----------------------------------------------------------------------------
-- Admins wanted a way to slice the clients roster into their own buckets
-- (onboarding / active / pause / churn / prospecting / etc.) with colored
-- section headers — the way a CRM pipeline looks. Each client lives in
-- at most one group; clients without a group fall into an implicit
-- "Unassigned" section.
--
-- Groups are global across the Nativz admin surface (not per-organization)
-- because the admin team is running one roster across all client orgs.
-- RLS lets admins read/write; viewers (portal users) cannot see groups.

-- ----------------------------------------------------------------------------
-- 1. Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Display label, sentence-case (app UX convention).
  name TEXT NOT NULL,

  -- Curated color key — see GROUP_COLORS in the client grid. We store
  -- the key (e.g. 'cyan', 'purple', 'emerald') rather than a hex so the
  -- palette can evolve without a data migration. Defaulting to 'slate'
  -- keeps new groups visually neutral until the creator picks a color.
  color TEXT NOT NULL DEFAULT 'slate',

  -- Pipeline order. Lower numbers render first. Using integers (not
  -- floats) because we reorder by rewriting the whole sequence on drag,
  -- not by interleaving fractional indexes.
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_groups_sort_order_idx
  ON client_groups (sort_order);

-- ----------------------------------------------------------------------------
-- 2. FK on clients — single-group membership (Kanban column model)
-- ----------------------------------------------------------------------------
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES client_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS clients_group_id_idx ON clients (group_id);

-- ----------------------------------------------------------------------------
-- 3. RLS — admin full access; viewers have no access
-- ----------------------------------------------------------------------------
ALTER TABLE client_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_groups admin all" ON client_groups;
CREATE POLICY "client_groups admin all"
  ON client_groups
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

-- ----------------------------------------------------------------------------
-- 4. updated_at trigger (standard pattern)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_client_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS client_groups_set_updated_at ON client_groups;
CREATE TRIGGER client_groups_set_updated_at
  BEFORE UPDATE ON client_groups
  FOR EACH ROW
  EXECUTE FUNCTION set_client_groups_updated_at();
