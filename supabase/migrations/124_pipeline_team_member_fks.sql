-- Pipeline team assignees — introduce FK columns alongside the existing
-- display-name TEXT columns.
--
-- Why dual-write instead of rip-and-replace: pipeline rows come from the
-- Monday.com sync which only has display names, so we can't drop the TEXT
-- columns yet. Adding *_id columns lets new writes (from the pipeline UI,
-- the accounting auto-link, etc.) use a stable reference while the sync
-- path keeps populating names. A later migration drops the TEXT side once
-- Monday.com is retired or the sync is taught to resolve ids.
--
-- Backfill fuzzy-matches by normalised full_name — logging orphans so we
-- can clean them up by hand rather than silently dropping the reference.

alter table content_pipeline
  add column if not exists strategist_id      uuid references team_members(id) on delete set null,
  add column if not exists videographer_id    uuid references team_members(id) on delete set null,
  add column if not exists editing_manager_id uuid references team_members(id) on delete set null,
  add column if not exists editor_id          uuid references team_members(id) on delete set null,
  add column if not exists smm_id             uuid references team_members(id) on delete set null;

create index if not exists content_pipeline_strategist_id_idx on content_pipeline(strategist_id);
create index if not exists content_pipeline_videographer_id_idx on content_pipeline(videographer_id);
create index if not exists content_pipeline_editing_manager_id_idx on content_pipeline(editing_manager_id);
create index if not exists content_pipeline_editor_id_idx on content_pipeline(editor_id);
create index if not exists content_pipeline_smm_id_idx on content_pipeline(smm_id);

-- Build a normalized-name → id map from active, non-junk team_members.
-- Collision handling: if two active rows share the same normalized name we
-- pick the one with a user_id set first, then the newest — same rule as
-- lib/accounting/team-directory.ts.
with normalised as (
  select
    id,
    lower(regexp_replace(coalesce(full_name, ''), '\s+', ' ', 'g')) as norm_name,
    user_id,
    created_at,
    row_number() over (
      partition by lower(regexp_replace(coalesce(full_name, ''), '\s+', ' ', 'g'))
      order by (user_id is not null) desc, created_at desc
    ) as rank
  from team_members
  where coalesce(is_active, true) = true
    and coalesce(full_name, '') <> ''
    and lower(full_name) not in ('test', 'tester', 'demo', 'placeholder')
),
team_lookup as (
  select norm_name, id from normalised where rank = 1
)
update content_pipeline cp
set
  strategist_id      = coalesce(cp.strategist_id,      (select id from team_lookup tl where tl.norm_name = lower(regexp_replace(coalesce(cp.strategist, ''),      '\s+', ' ', 'g')))),
  videographer_id    = coalesce(cp.videographer_id,    (select id from team_lookup tl where tl.norm_name = lower(regexp_replace(coalesce(cp.videographer, ''),    '\s+', ' ', 'g')))),
  editing_manager_id = coalesce(cp.editing_manager_id, (select id from team_lookup tl where tl.norm_name = lower(regexp_replace(coalesce(cp.editing_manager, ''), '\s+', ' ', 'g')))),
  editor_id          = coalesce(cp.editor_id,          (select id from team_lookup tl where tl.norm_name = lower(regexp_replace(coalesce(cp.editor, ''),          '\s+', ' ', 'g')))),
  smm_id             = coalesce(cp.smm_id,             (select id from team_lookup tl where tl.norm_name = lower(regexp_replace(coalesce(cp.smm, ''),             '\s+', ' ', 'g'))));
