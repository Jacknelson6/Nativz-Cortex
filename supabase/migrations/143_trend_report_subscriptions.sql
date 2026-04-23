-- Trend Finder recurring reports — brand / topic monitoring.
-- Parallels the competitor_report_subscriptions pattern but for a topic
-- query + optional keyword / brand-name listening filters. Daily cron walks
-- due subscriptions, runs a lightweight SERP + LLM summary, emails the result.

create table if not exists trend_report_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  created_by uuid references users(id),
  name text not null,
  topic_query text not null,
  keywords text[] not null default '{}',
  brand_names text[] not null default '{}',
  platforms text[] not null default '{}',
  cadence text not null check (cadence in ('weekly', 'biweekly', 'monthly')),
  recipients text[] not null default '{}',
  include_portal_users boolean not null default false,
  enabled boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tr_subs_due
  on trend_report_subscriptions (next_run_at)
  where enabled = true;

create index if not exists idx_tr_subs_client
  on trend_report_subscriptions (client_id);

alter table trend_report_subscriptions enable row level security;

drop policy if exists tr_subs_admin_all on trend_report_subscriptions;
create policy tr_subs_admin_all on trend_report_subscriptions for all using (
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

drop policy if exists tr_subs_portal_read on trend_report_subscriptions;
create policy tr_subs_portal_read on trend_report_subscriptions for select using (
  exists (
    select 1 from users
    where users.id = auth.uid()
      and users.organization_id = trend_report_subscriptions.organization_id
  )
);

create table if not exists trend_reports (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references trend_report_subscriptions(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  generated_at timestamptz not null default now(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  summary text,
  findings jsonb not null,
  report_html text,
  report_json jsonb not null,
  email_resend_id text,
  email_status text not null default 'pending'
    check (email_status in ('pending', 'sent', 'failed')),
  email_error text
);

create index if not exists idx_trend_reports_subscription
  on trend_reports (subscription_id, generated_at desc);

create index if not exists idx_trend_reports_client
  on trend_reports (client_id, generated_at desc);

alter table trend_reports enable row level security;

drop policy if exists tr_reports_admin_all on trend_reports;
create policy tr_reports_admin_all on trend_reports for all using (
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

drop policy if exists tr_reports_portal_read on trend_reports;
create policy tr_reports_portal_read on trend_reports for select using (
  exists (
    select 1 from users
    where users.id = auth.uid()
      and users.organization_id = trend_reports.organization_id
  )
);
