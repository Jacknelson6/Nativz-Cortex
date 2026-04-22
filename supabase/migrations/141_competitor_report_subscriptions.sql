-- Recurring competitor reports — subscription + delivery log.
-- Daily cron at /api/cron/competitor-reports walks `competitor_report_subscriptions`
-- rows whose `next_run_at` has passed, generates the report from
-- `benchmark_snapshots`, emails it via Resend, and writes a row to
-- `competitor_reports`.

create table if not exists competitor_report_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  created_by uuid references users(id),
  cadence text not null check (cadence in ('weekly', 'biweekly', 'monthly')),
  recipients text[] not null default '{}',
  include_portal_users boolean not null default false,
  enabled boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cr_subs_due
  on competitor_report_subscriptions (next_run_at)
  where enabled = true;

create index if not exists idx_cr_subs_client
  on competitor_report_subscriptions (client_id);

alter table competitor_report_subscriptions enable row level security;

drop policy if exists cr_subs_admin_all on competitor_report_subscriptions;
create policy cr_subs_admin_all on competitor_report_subscriptions for all using (
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

drop policy if exists cr_subs_portal_read on competitor_report_subscriptions;
create policy cr_subs_portal_read on competitor_report_subscriptions for select using (
  exists (
    select 1 from users
    where users.id = auth.uid()
      and users.organization_id = competitor_report_subscriptions.organization_id
  )
);

create table if not exists competitor_reports (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references competitor_report_subscriptions(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  generated_at timestamptz not null default now(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  report_html text,
  report_json jsonb not null,
  pdf_storage_path text,
  email_resend_id text,
  email_status text not null default 'pending'
    check (email_status in ('pending', 'sent', 'failed')),
  email_error text
);

create index if not exists idx_competitor_reports_subscription
  on competitor_reports (subscription_id, generated_at desc);

create index if not exists idx_competitor_reports_client
  on competitor_reports (client_id, generated_at desc);

alter table competitor_reports enable row level security;

drop policy if exists cr_reports_admin_all on competitor_reports;
create policy cr_reports_admin_all on competitor_reports for all using (
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

drop policy if exists cr_reports_portal_read on competitor_reports;
create policy cr_reports_portal_read on competitor_reports for select using (
  exists (
    select 1 from users
    where users.id = auth.uid()
      and users.organization_id = competitor_reports.organization_id
  )
);
