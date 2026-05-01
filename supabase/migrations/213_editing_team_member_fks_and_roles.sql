-- Migration 213: Repoint editing_projects role FKs (assignee/videographer/strategist)
-- (Originally applied via Supabase MCP under name 212_editing_team_member_fks_and_roles;
--  renamed to 213 on disk because a parallel branch claimed 212_payroll_payouts.)
-- from public.users to public.team_members and add a structured `editing_roles`
-- tag column on team_members so the assignee picker can filter by role.
--
-- Rationale: the picker has been blocked because public.users only contains
-- people with auth accounts (Jaime, Jashan, Jed, Kiet, Khen-no-auth, etc.
-- have no auth.users row). team_members already exists as the agency roster
-- and is what client_assignments uses, so editing_projects should match.
--
-- Backfill maps existing user_id-based assignments to the corresponding
-- team_members row via team_members.user_id.

BEGIN;

-- 1. Tag column for which editing roles a team_member can fill.
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS editing_roles text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_team_members_editing_roles
  ON team_members USING gin (editing_roles);

COMMENT ON COLUMN team_members.editing_roles IS
  'Editing pipeline roles this team member can fill. Values: strategist, editor, videographer.';

-- 2. Drop old FKs (still pointing at users).
ALTER TABLE editing_projects
  DROP CONSTRAINT IF EXISTS editing_projects_assignee_id_fkey,
  DROP CONSTRAINT IF EXISTS editing_projects_videographer_id_fkey,
  DROP CONSTRAINT IF EXISTS editing_projects_strategist_id_fkey;

-- 3. Backfill: translate user_id -> team_member_id via team_members.user_id.
--    Pick the oldest matching row to be deterministic if duplicates exist.
UPDATE editing_projects ep
SET assignee_id = (
  SELECT tm.id FROM team_members tm
  WHERE tm.user_id = ep.assignee_id
  ORDER BY tm.created_at ASC
  LIMIT 1
)
WHERE assignee_id IS NOT NULL;

UPDATE editing_projects ep
SET videographer_id = (
  SELECT tm.id FROM team_members tm
  WHERE tm.user_id = ep.videographer_id
  ORDER BY tm.created_at ASC
  LIMIT 1
)
WHERE videographer_id IS NOT NULL;

UPDATE editing_projects ep
SET strategist_id = (
  SELECT tm.id FROM team_members tm
  WHERE tm.user_id = ep.strategist_id
  ORDER BY tm.created_at ASC
  LIMIT 1
)
WHERE strategist_id IS NOT NULL;

-- 4. Add new FKs against team_members.
ALTER TABLE editing_projects
  ADD CONSTRAINT editing_projects_assignee_id_fkey
    FOREIGN KEY (assignee_id) REFERENCES team_members(id) ON DELETE SET NULL,
  ADD CONSTRAINT editing_projects_videographer_id_fkey
    FOREIGN KEY (videographer_id) REFERENCES team_members(id) ON DELETE SET NULL,
  ADD CONSTRAINT editing_projects_strategist_id_fkey
    FOREIGN KEY (strategist_id) REFERENCES team_members(id) ON DELETE SET NULL;

-- 5. Seed editing_roles based on existing free-text `role` so the picker has
--    immediate population. Jack explicitly named Jake, Claiborne, and Jaime
--    as strategists; tag them too even though their role text doesn't say
--    "Strategist".
UPDATE team_members
SET editing_roles = array_append(editing_roles, 'editor')
WHERE role ILIKE '%editor%' AND NOT 'editor' = ANY(editing_roles);

UPDATE team_members
SET editing_roles = array_append(editing_roles, 'videographer')
WHERE role ILIKE '%videographer%' AND NOT 'videographer' = ANY(editing_roles);

UPDATE team_members
SET editing_roles = array_append(editing_roles, 'strategist')
WHERE role ILIKE '%strategist%' AND NOT 'strategist' = ANY(editing_roles);

UPDATE team_members
SET editing_roles = array_append(editing_roles, 'strategist')
WHERE id IN (
  '0d809c56-b5d7-409a-87aa-de0492e9bac2', -- Jacob Pak
  '20c833c7-6bb0-490b-902a-a8ecd3a3fce4'  -- Jaime Maldonado
)
AND NOT 'strategist' = ANY(editing_roles);

-- Tag Jack (super-admin / CCO) so he can self-assign as editor or
-- strategist on existing/new projects.
UPDATE team_members
SET editing_roles = ARRAY['editor', 'strategist']
WHERE id = 'd22a1c4e-6fea-4f54-b9e9-22138ee5041f' -- Jack Nelson
  AND editing_roles = '{}';

COMMIT;
