-- 106_nerd_skills_slash_commands.sql
-- Promotes nerd_skills rows to user-invokable slash commands. Previously
-- skills were keyword-matched at request time and silently injected into
-- the system prompt — invisible to users. Now a skill can declare a slug
-- (e.g. "cold-email") and an optional prompt template; when set, it shows
-- up in the slash command menu and fires like any built-in command.

alter table public.nerd_skills
  add column if not exists command_slug text,
  add column if not exists prompt_template text;

-- Slugs must be unique across active skills so /cold-email always resolves
-- to one skill. Empty / null slugs are allowed (the skill stays keyword-
-- matched only, no command listing).
create unique index if not exists nerd_skills_command_slug_active_idx
  on public.nerd_skills (command_slug)
  where command_slug is not null and is_active = true;

-- Cheap format check — lowercase letters, digits, dashes. Keeps slugs
-- URL-safe and consistent with Claude Code's skill naming convention.
alter table public.nerd_skills
  drop constraint if exists nerd_skills_command_slug_format_chk;

alter table public.nerd_skills
  add constraint nerd_skills_command_slug_format_chk
  check (command_slug is null or command_slug ~ '^[a-z][a-z0-9-]{1,39}$');
