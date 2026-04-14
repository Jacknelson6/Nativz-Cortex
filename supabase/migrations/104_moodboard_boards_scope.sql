-- 104_moodboard_boards_scope.sql
-- Multi-board Notes dashboard — each board now has an explicit scope so
-- the dashboard can group/filter them, and /admin/notes can list all
-- boards a user has access to instead of auto-opening a single personal
-- board.
--
-- Scope rules:
--   - 'personal' — owned by one user (user_id set, client_id null, is_personal=true)
--   - 'client'   — scoped to a client workspace (client_id set, user_id null)
--   - 'team'     — agency-wide, no client/user owner (both null)
--
-- Existing rows get backfilled based on is_personal + client_id. Once
-- backfilled the column is NOT NULL so the app can rely on it.

alter table public.moodboard_boards
  add column if not exists scope text;

update public.moodboard_boards
set scope = case
  when is_personal = true then 'personal'
  when client_id is not null then 'client'
  else 'team'
end
where scope is null;

alter table public.moodboard_boards
  alter column scope set not null;

alter table public.moodboard_boards
  drop constraint if exists moodboard_boards_scope_chk;

alter table public.moodboard_boards
  add constraint moodboard_boards_scope_chk
  check (scope in ('personal', 'client', 'team'));

-- Keep ownership flags and scope in sync so nothing gets into a bad state.
alter table public.moodboard_boards
  drop constraint if exists moodboard_boards_scope_ownership_chk;

alter table public.moodboard_boards
  add constraint moodboard_boards_scope_ownership_chk
  check (
    (scope = 'personal' and user_id is not null   and client_id is null)
    or
    (scope = 'client'   and user_id is null       and client_id is not null)
    or
    (scope = 'team'     and user_id is null       and client_id is null)
  );

create index if not exists moodboard_boards_scope_idx
  on public.moodboard_boards (scope, updated_at desc);

-- Personal-owner policies were added in 102; they key on is_personal.
-- The new scope column doesn't change that — those policies still work.
-- Team/client boards keep riding the existing admin-all-access policies.
