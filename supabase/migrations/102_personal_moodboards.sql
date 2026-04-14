-- 102_personal_moodboards.sql
-- Personal (per-user) moodboards. Every Cortex user can have their own
-- board for pasting TikTok/Reel/Short URLs and getting auto-analysis.
--
-- Design notes:
-- - Client boards (existing) have client_id set and is_personal=false.
-- - Personal boards have user_id set, client_id null, and is_personal=true.
-- - The CHECK constraint prevents mixed-state rows.
-- - Existing admin-full-access policies stay in place (admins still see
--   everything across the system — nothing here tightens their access).
-- - New owner policies let non-admin users (future portal viewers) read
--   and mutate their own personal boards without admin uplift.

alter table public.moodboard_boards
  add column if not exists user_id uuid references public.users(id) on delete cascade,
  add column if not exists is_personal boolean not null default false;

create index if not exists moodboard_boards_personal_user_idx
  on public.moodboard_boards (user_id) where is_personal = true;

-- State integrity: personal boards must have user_id; non-personal boards must not
alter table public.moodboard_boards
  drop constraint if exists moodboard_boards_personal_ownership_chk;

alter table public.moodboard_boards
  add constraint moodboard_boards_personal_ownership_chk
  check (
    (is_personal = true  and user_id is not null and client_id is null)
    or
    (is_personal = false and user_id is null)
  );

-- Owner policies on moodboard_boards (additive — does not remove admin policies)
drop policy if exists moodboard_boards_personal_owner on public.moodboard_boards;
create policy moodboard_boards_personal_owner on public.moodboard_boards
  for all
  using (is_personal = true and user_id = auth.uid())
  with check (is_personal = true and user_id = auth.uid());

-- Owner policies on moodboard_items (access via parent board ownership)
drop policy if exists moodboard_items_personal_owner on public.moodboard_items;
create policy moodboard_items_personal_owner on public.moodboard_items
  for all
  using (
    exists (
      select 1 from public.moodboard_boards b
      where b.id = moodboard_items.board_id
        and b.is_personal = true
        and b.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.moodboard_boards b
      where b.id = moodboard_items.board_id
        and b.is_personal = true
        and b.user_id = auth.uid()
    )
  );

-- Owner policies on moodboard_notes
drop policy if exists moodboard_notes_personal_owner on public.moodboard_notes;
create policy moodboard_notes_personal_owner on public.moodboard_notes
  for all
  using (
    exists (
      select 1 from public.moodboard_boards b
      where b.id = moodboard_notes.board_id
        and b.is_personal = true
        and b.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.moodboard_boards b
      where b.id = moodboard_notes.board_id
        and b.is_personal = true
        and b.user_id = auth.uid()
    )
  );

-- Owner policies on moodboard_comments (joins via item → board)
drop policy if exists moodboard_comments_personal_owner on public.moodboard_comments;
create policy moodboard_comments_personal_owner on public.moodboard_comments
  for all
  using (
    exists (
      select 1
      from public.moodboard_items i
      join public.moodboard_boards b on b.id = i.board_id
      where i.id = moodboard_comments.item_id
        and b.is_personal = true
        and b.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.moodboard_items i
      join public.moodboard_boards b on b.id = i.board_id
      where i.id = moodboard_comments.item_id
        and b.is_personal = true
        and b.user_id = auth.uid()
    )
  );

-- Owner policies on moodboard_edges
drop policy if exists moodboard_edges_personal_owner on public.moodboard_edges;
create policy moodboard_edges_personal_owner on public.moodboard_edges
  for all
  using (
    exists (
      select 1 from public.moodboard_boards b
      where b.id = moodboard_edges.board_id
        and b.is_personal = true
        and b.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.moodboard_boards b
      where b.id = moodboard_edges.board_id
        and b.is_personal = true
        and b.user_id = auth.uid()
    )
  );
