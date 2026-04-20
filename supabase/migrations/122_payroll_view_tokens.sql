-- Comptroller / CEO read-only payroll view tokens.
--
-- Lets an admin mint a magic-link URL that renders a single period's totals
-- for someone who shouldn't have a full Supabase account. Tokens are
-- single-use per period and revocable; expiry defaults to 30 days.

create table if not exists payroll_view_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  period_id uuid not null references payroll_periods(id) on delete cascade,
  role text not null check (role in ('comptroller', 'ceo')),
  label text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  first_viewed_at timestamptz,
  viewer_name text,
  viewer_email text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists payroll_view_tokens_period_idx
  on payroll_view_tokens(period_id, revoked_at);
create index if not exists payroll_view_tokens_token_idx
  on payroll_view_tokens(token);

-- RLS: admin-only (the public viewer hits the endpoint with service-role
-- behind the scenes — RLS isn't the auth boundary for token reads).
alter table payroll_view_tokens enable row level security;

drop policy if exists payroll_view_tokens_admin_all on payroll_view_tokens;
create policy payroll_view_tokens_admin_all on payroll_view_tokens for all using (
  exists (select 1 from users where users.id = auth.uid() and users.role = 'admin')
);
