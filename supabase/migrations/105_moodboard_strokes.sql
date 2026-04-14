-- 105_moodboard_strokes.sql
-- Per-board freeform drawing persistence. The pen tool added in 1015dec
-- was session-only — strokes were lost on refresh. This adds a table so
-- strokes persist across sessions, with RLS mirroring the board ownership
-- rules from migrations 010 + 102.

create table if not exists public.moodboard_strokes (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.moodboard_boards(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  color text not null default '#ffffff',
  width numeric not null default 2,
  /**
   * Points are stored as a JSONB array of {x, y} objects in canvas-local
   * coordinates. Kept as a single row per stroke (not point-per-row) so
   * writes are one insert and reads are one select per board.
   */
  points jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists moodboard_strokes_board_idx
  on public.moodboard_strokes (board_id, created_at);

alter table public.moodboard_strokes enable row level security;

-- Admins see everything (mirrors existing moodboard_items admin policy).
drop policy if exists moodboard_strokes_admin_all on public.moodboard_strokes;
create policy moodboard_strokes_admin_all on public.moodboard_strokes
  for all
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- Personal-board owners can manage strokes on their own personal boards.
drop policy if exists moodboard_strokes_personal_owner on public.moodboard_strokes;
create policy moodboard_strokes_personal_owner on public.moodboard_strokes
  for all
  using (
    exists (
      select 1 from public.moodboard_boards b
      where b.id = moodboard_strokes.board_id
        and b.is_personal = true
        and b.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.moodboard_boards b
      where b.id = moodboard_strokes.board_id
        and b.is_personal = true
        and b.user_id = auth.uid()
    )
  );
