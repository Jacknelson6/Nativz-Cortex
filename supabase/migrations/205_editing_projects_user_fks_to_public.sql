-- Migration 205: Repoint editing_projects user FKs at public.users
--
-- Migrations 201 + 203 declared assignee_id / videographer_id /
-- strategist_id / created_by as FKs to auth.users(id). That's
-- structurally valid but PostgREST builds its embedded-resource cache
-- from FKs in the exposed `public` schema only, so the embed
--
--   assignee:users!editing_projects_assignee_id_fkey(email)
--
-- returns PGRST200 ("no relationship found"). The whole /admin/editing
-- list endpoint 500s as a result.
--
-- public.users.id is 1:1 with auth.users.id in this app (the standard
-- Supabase pattern, populated by the auth trigger), so re-targeting the
-- FK at public.users keeps the same integrity guarantee while making
-- the relationship visible to PostgREST.
--
-- We keep the constraint names so the API route's `!fk_name` hint
-- continues to resolve.

ALTER TABLE editing_projects
  DROP CONSTRAINT IF EXISTS editing_projects_assignee_id_fkey,
  DROP CONSTRAINT IF EXISTS editing_projects_videographer_id_fkey,
  DROP CONSTRAINT IF EXISTS editing_projects_strategist_id_fkey,
  DROP CONSTRAINT IF EXISTS editing_projects_created_by_fkey;

ALTER TABLE editing_projects
  ADD CONSTRAINT editing_projects_assignee_id_fkey
    FOREIGN KEY (assignee_id) REFERENCES public.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT editing_projects_videographer_id_fkey
    FOREIGN KEY (videographer_id) REFERENCES public.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT editing_projects_strategist_id_fkey
    FOREIGN KEY (strategist_id) REFERENCES public.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT editing_projects_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
