-- Migration 240: Unified review modal assignment fields
--
-- Both row types in the unified review surface (SMM share-link drops +
-- one-off editing projects) need a strategist + editor pair, with
-- client-level defaults so new work pre-populates without manual
-- per-project assignment. editing_projects already had a generic
-- `assignee_id` (the editor); rename for clarity.

-- 1) editing_projects: rename assignee_id -> editor_id (and the FK
--    constraint, since Postgres keeps the old name otherwise).
alter table public.editing_projects rename column assignee_id to editor_id;
alter table public.editing_projects
  rename constraint editing_projects_assignee_id_fkey to editing_projects_editor_id_fkey;

-- 2) content_drops: add strategist + editor (FKs to team_members).
alter table public.content_drops
  add column if not exists strategist_id uuid references public.team_members(id) on delete set null,
  add column if not exists editor_id uuid references public.team_members(id) on delete set null;

-- 3) clients: per-client defaults that prefill new projects/drops.
alter table public.clients
  add column if not exists default_strategist_id uuid references public.team_members(id) on delete set null,
  add column if not exists default_editor_id uuid references public.team_members(id) on delete set null;

-- 4) Indexes for "my queue" filters.
create index if not exists editing_projects_editor_id_idx
  on public.editing_projects (editor_id) where editor_id is not null;
create index if not exists editing_projects_strategist_id_idx
  on public.editing_projects (strategist_id) where strategist_id is not null;
create index if not exists content_drops_editor_id_idx
  on public.content_drops (editor_id) where editor_id is not null;
create index if not exists content_drops_strategist_id_idx
  on public.content_drops (strategist_id) where strategist_id is not null;
