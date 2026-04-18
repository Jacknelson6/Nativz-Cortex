-- Daily follower counts per social account.
--
-- Zernio may or may not expose a follower time-series endpoint depending on
-- the plan / platform. This table is a dual-purpose store:
--   - filled from Zernio's `/accounts/{id}/followers` when it works
--   - filled by rolling up existing `platform_snapshots` otherwise
--
-- A single canonical table lets the analytics UI render one chart code-path
-- instead of branching on data source.

create table if not exists platform_follower_daily (
  id uuid primary key default gen_random_uuid(),
  social_profile_id uuid not null references social_profiles(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  platform text not null,
  day date not null,
  followers int not null default 0,
  source text not null default 'zernio' check (source in ('zernio', 'snapshot-rollup')),
  created_at timestamptz not null default now(),
  unique (social_profile_id, day)
);

create index if not exists platform_follower_daily_client_day_idx
  on platform_follower_daily(client_id, day desc);
create index if not exists platform_follower_daily_profile_day_idx
  on platform_follower_daily(social_profile_id, day desc);

alter table platform_follower_daily enable row level security;

drop policy if exists platform_follower_daily_admin_all on platform_follower_daily;
create policy platform_follower_daily_admin_all on platform_follower_daily for all using (
  exists (select 1 from users where users.id = auth.uid() and users.role = 'admin')
);

drop policy if exists platform_follower_daily_portal_read on platform_follower_daily;
create policy platform_follower_daily_portal_read on platform_follower_daily for select using (
  exists (
    select 1 from users u
    where u.id = auth.uid()
      and u.organization_id = (
        select organization_id from clients c where c.id = platform_follower_daily.client_id
      )
  )
);
