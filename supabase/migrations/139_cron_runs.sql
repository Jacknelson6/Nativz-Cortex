-- Telemetry for every cron execution. Lets the Infrastructure v2 page
-- surface "last run + status + duration" per cron without scraping logs.
-- Written to by a small helper in lib/observability/cron-runs.ts.

create table if not exists cron_runs (
  id uuid primary key default gen_random_uuid(),
  route text not null,
  status text not null check (status in ('ok', 'error', 'partial')),
  started_at timestamptz not null,
  finished_at timestamptz,
  duration_ms integer,
  rows_processed integer,
  error text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_cron_runs_route_started
  on cron_runs (route, started_at desc);

create index if not exists idx_cron_runs_status
  on cron_runs (status) where status <> 'ok';

alter table cron_runs enable row level security;

drop policy if exists cron_runs_admin_all on cron_runs;
create policy cron_runs_admin_all on cron_runs for all using (
  exists (
    select 1 from users
    where users.id = auth.uid()
      and (users.role in ('admin', 'super_admin') or users.is_super_admin = true)
  )
) with check (
  exists (
    select 1 from users
    where users.id = auth.uid()
      and (users.role in ('admin', 'super_admin') or users.is_super_admin = true)
  )
);
