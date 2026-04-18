-- Accounting module: bi-monthly payroll periods + polymorphic payroll entries.
--
-- Periods cover 1st-15th ("first-half") and 16th-end-of-month ("second-half").
-- Entries are a single ledger with a discriminator (`entry_type`) so editing
-- payouts, SMM retainers, affiliate payouts, blogging, and Jack's override
-- margin all live in one table.

create extension if not exists "pgcrypto";

-- Periods ------------------------------------------------------------------

create table if not exists payroll_periods (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  -- 'first-half' = 1-15, 'second-half' = 16-EOM
  half text not null check (half in ('first-half', 'second-half')),
  status text not null default 'draft' check (status in ('draft', 'locked', 'paid')),
  notes text,
  locked_at timestamptz,
  paid_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (start_date, end_date)
);

create index if not exists payroll_periods_start_idx on payroll_periods(start_date desc);
create index if not exists payroll_periods_status_idx on payroll_periods(status);

-- Entries ------------------------------------------------------------------

create table if not exists payroll_entries (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references payroll_periods(id) on delete cascade,
  -- What kind of work this row represents.
  --   editing     = per-video edit payout to a team member
  --   smm         = monthly social-media-management retainer slice
  --   affiliate   = affiliate payout for a client engagement
  --   blogging    = blog-post payout
  --   override    = Jack's cut on top of an editor's work (margin)
  --   misc        = one-off adjustments / reimbursements
  entry_type text not null check (entry_type in ('editing', 'smm', 'affiliate', 'blogging', 'override', 'misc')),
  -- Who gets paid (nullable because affiliate/misc may not map to a team member)
  team_member_id uuid references team_members(id) on delete set null,
  -- Freeform label for payouts to non-team people (affiliates, freelancers)
  payee_label text,
  -- Related client (nullable for misc)
  client_id uuid references clients(id) on delete set null,
  video_count int not null default 0,
  -- All money stored in integer cents to dodge floating point drift.
  rate_cents int not null default 0,
  amount_cents int not null default 0,
  -- Jack's margin (for editing rows: my markup on top of what the editor gets)
  margin_cents int not null default 0,
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payroll_entries_period_idx on payroll_entries(period_id);
create index if not exists payroll_entries_team_member_idx on payroll_entries(team_member_id);
create index if not exists payroll_entries_client_idx on payroll_entries(client_id);
create index if not exists payroll_entries_type_idx on payroll_entries(entry_type);

-- Keep updated_at fresh.
create or replace function payroll_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists payroll_periods_touch on payroll_periods;
create trigger payroll_periods_touch before update on payroll_periods
  for each row execute function payroll_touch_updated_at();

drop trigger if exists payroll_entries_touch on payroll_entries;
create trigger payroll_entries_touch before update on payroll_entries
  for each row execute function payroll_touch_updated_at();

-- RLS: admin-only. Payroll is internal; portal viewers never touch it.
alter table payroll_periods enable row level security;
alter table payroll_entries enable row level security;

drop policy if exists payroll_periods_admin_all on payroll_periods;
create policy payroll_periods_admin_all on payroll_periods for all using (
  exists (select 1 from users where users.id = auth.uid() and users.role = 'admin')
);

drop policy if exists payroll_entries_admin_all on payroll_entries;
create policy payroll_entries_admin_all on payroll_entries for all using (
  exists (select 1 from users where users.id = auth.uid() and users.role = 'admin')
);
