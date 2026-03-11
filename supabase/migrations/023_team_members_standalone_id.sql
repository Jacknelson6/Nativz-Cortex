-- Allow team members to exist without an auth.users row
-- Drop the FK constraint so we can add members by name/email/role
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_id_fkey;
ALTER TABLE team_members ALTER COLUMN id SET DEFAULT gen_random_uuid();
