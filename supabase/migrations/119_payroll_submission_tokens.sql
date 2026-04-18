-- Per-(period, team_member) submission tokens. Admins mint these and
-- share the link with an editor / SMM / affiliate partner so they can
-- enter their own numbers without needing an admin login.

create table if not exists payroll_submission_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  period_id uuid not null references payroll_periods(id) on delete cascade,
  team_member_id uuid not null references team_members(id) on delete cascade,
  default_entry_type text check (default_entry_type in ('editing', 'smm', 'affiliate', 'blogging')),
  expires_at timestamptz not null default (now() + interval '21 days'),
  last_used_at timestamptz,
  use_count int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (period_id, team_member_id)
);

create index if not exists payroll_submission_tokens_period_idx
  on payroll_submission_tokens(period_id);

alter table payroll_submission_tokens enable row level security;

drop policy if exists payroll_submission_tokens_admin_all on payroll_submission_tokens;
create policy payroll_submission_tokens_admin_all on payroll_submission_tokens for all using (
  exists (select 1 from users where users.id = auth.uid() and users.role = 'admin')
);
