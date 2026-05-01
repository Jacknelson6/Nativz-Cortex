-- Per-period, per-payee payout record. Aggregates the underlying
-- payroll_entries (which can span editing/smm/affiliate/blogging for the
-- same person) and tracks the Wise invoice link the payee submitted plus
-- the controller payout status.
--
-- Key shape: (period_id, team_member_id | payee_label) — exactly one of
-- those identities per row. The unique indexes below enforce it.

create table payroll_payouts (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references payroll_periods(id) on delete cascade,
  team_member_id uuid references team_members(id) on delete set null,
  payee_label text,
  wise_url text,
  status text not null default 'pending'
    check (status in ('pending', 'link_received', 'paid')),
  notes text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payee_identity_required
    check (team_member_id is not null or (payee_label is not null and length(trim(payee_label)) > 0))
);

create unique index payroll_payouts_member_uniq
  on payroll_payouts (period_id, team_member_id)
  where team_member_id is not null;

create unique index payroll_payouts_label_uniq
  on payroll_payouts (period_id, lower(trim(payee_label)))
  where team_member_id is null and payee_label is not null;

create index payroll_payouts_period_idx on payroll_payouts (period_id);

create trigger payroll_payouts_set_updated_at
  before update on payroll_payouts
  for each row execute function set_updated_at();

comment on table payroll_payouts is
  'One row per (period × payee) aggregating payroll_entries. Stores the Wise invoice URL the payee submitted and the controller payout status.';
comment on column payroll_payouts.status is
  'pending = no Wise link yet; link_received = payee sent invoice URL; paid = controller paid via Wise';
