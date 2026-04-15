-- 109_portal_notes_rls_viewer_client_access.sql
-- True Postgres RLS for the portal notes feature. Before this migration,
-- notes isolation lived only in the API route handlers (they read
-- user_client_access and filtered queries). That's fine for the routes we
-- wrote, but the admin Supabase client bypasses RLS — so any future code
-- path that hits the database with a viewer's JWT (client-side SDK, a
-- future server route that forgets to scope, a Studio query impersonating
-- a user, etc.) would not be protected.
--
-- After this migration, Postgres itself refuses to return a moodboard
-- board / item / note to a viewer whose user_client_access doesn't include
-- the board's client_id. Admin and personal-owner paths are unchanged.

-- ---------------------------------------------------------------------------
-- Helper: viewer-scoped client access check.
--
-- SECURITY DEFINER so the function bypasses RLS on user_client_access
-- itself. Marked STABLE because within a statement user_client_access
-- changes are rare and the planner can cache the result.
-- ---------------------------------------------------------------------------
create or replace function public.viewer_has_client_access(client_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_client_access uca
    where uca.user_id = auth.uid()
      and uca.client_id = client_uuid
  );
$$;

grant execute on function public.viewer_has_client_access(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- moodboard_boards — viewer can see/manage only client-scope boards whose
-- client_id is in their user_client_access list.
-- ---------------------------------------------------------------------------
drop policy if exists moodboard_boards_viewer_client_access on public.moodboard_boards;

create policy moodboard_boards_viewer_client_access
on public.moodboard_boards
for all
to authenticated
using (
  scope = 'client'
  and client_id is not null
  and public.viewer_has_client_access(client_id)
)
with check (
  scope = 'client'
  and client_id is not null
  and public.viewer_has_client_access(client_id)
);

-- ---------------------------------------------------------------------------
-- moodboard_items — viewers see items belonging to boards they can see.
-- ---------------------------------------------------------------------------
drop policy if exists moodboard_items_viewer_client_access on public.moodboard_items;

create policy moodboard_items_viewer_client_access
on public.moodboard_items
for all
to authenticated
using (
  exists (
    select 1
    from public.moodboard_boards b
    where b.id = moodboard_items.board_id
      and b.scope = 'client'
      and b.client_id is not null
      and public.viewer_has_client_access(b.client_id)
  )
)
with check (
  exists (
    select 1
    from public.moodboard_boards b
    where b.id = moodboard_items.board_id
      and b.scope = 'client'
      and b.client_id is not null
      and public.viewer_has_client_access(b.client_id)
  )
);

-- ---------------------------------------------------------------------------
-- moodboard_notes — same shape as items: scoped via the parent board.
-- ---------------------------------------------------------------------------
drop policy if exists moodboard_notes_viewer_client_access on public.moodboard_notes;

create policy moodboard_notes_viewer_client_access
on public.moodboard_notes
for all
to authenticated
using (
  exists (
    select 1
    from public.moodboard_boards b
    where b.id = moodboard_notes.board_id
      and b.scope = 'client'
      and b.client_id is not null
      and public.viewer_has_client_access(b.client_id)
  )
)
with check (
  exists (
    select 1
    from public.moodboard_boards b
    where b.id = moodboard_notes.board_id
      and b.scope = 'client'
      and b.client_id is not null
      and public.viewer_has_client_access(b.client_id)
  )
);
