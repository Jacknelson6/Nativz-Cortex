-- 154_revenue_hub.sql — Revenue Hub tables + ALTERs for Stripe + ContractKit + lifecycle events.
-- See docs/superpowers/specs/2026-04-23-revenue-hub-design.md for design.
--
-- Idempotent: uses IF NOT EXISTS and DROP POLICY IF EXISTS throughout.
-- Money columns are integer cents (matches payroll_entries convention).

begin;

create extension if not exists pgcrypto;

-- Stripe customers ---------------------------------------------------------
create table if not exists stripe_customers (
  id text primary key,
  client_id uuid references clients(id) on delete set null,
  email text,
  name text,
  metadata jsonb not null default '{}'::jsonb,
  livemode boolean not null default false,
  created_at timestamptz,
  synced_at timestamptz not null default now(),
  deleted boolean not null default false
);
create index if not exists stripe_customers_client_idx on stripe_customers(client_id);
create index if not exists stripe_customers_email_idx on stripe_customers(lower(email));

-- Stripe invoices ----------------------------------------------------------
create table if not exists stripe_invoices (
  id text primary key,
  customer_id text references stripe_customers(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  number text,
  status text not null,
  amount_due_cents integer not null default 0,
  amount_paid_cents integer not null default 0,
  amount_remaining_cents integer not null default 0,
  currency text not null default 'usd',
  subscription_id text,
  hosted_invoice_url text,
  invoice_pdf text,
  due_date timestamptz,
  finalized_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  attempt_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  livemode boolean not null default false,
  created_at timestamptz,
  synced_at timestamptz not null default now()
);
create index if not exists stripe_invoices_client_created_idx on stripe_invoices(client_id, created_at desc);
create index if not exists stripe_invoices_status_idx on stripe_invoices(status);
create index if not exists stripe_invoices_customer_idx on stripe_invoices(customer_id);
create index if not exists stripe_invoices_subscription_idx on stripe_invoices(subscription_id);

-- Stripe subscriptions -----------------------------------------------------
create table if not exists stripe_subscriptions (
  id text primary key,
  customer_id text references stripe_customers(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  started_at timestamptz,
  price_id text,
  product_id text,
  product_name text,
  price_nickname text,
  unit_amount_cents integer,
  interval text,
  interval_count integer,
  quantity integer,
  items jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  livemode boolean not null default false,
  synced_at timestamptz not null default now()
);
create index if not exists stripe_subscriptions_client_idx on stripe_subscriptions(client_id);
create index if not exists stripe_subscriptions_status_idx on stripe_subscriptions(status);
create index if not exists stripe_subscriptions_customer_idx on stripe_subscriptions(customer_id);

-- Stripe charges -----------------------------------------------------------
create table if not exists stripe_charges (
  id text primary key,
  customer_id text references stripe_customers(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  invoice_id text references stripe_invoices(id) on delete set null,
  amount_cents integer not null default 0,
  amount_refunded_cents integer not null default 0,
  currency text not null default 'usd',
  status text not null,
  paid boolean not null default false,
  refunded boolean not null default false,
  failure_code text,
  failure_message text,
  metadata jsonb not null default '{}'::jsonb,
  livemode boolean not null default false,
  created_at timestamptz,
  synced_at timestamptz not null default now()
);
create index if not exists stripe_charges_client_created_idx on stripe_charges(client_id, created_at desc);
create index if not exists stripe_charges_invoice_idx on stripe_charges(invoice_id);

-- Stripe raw event log -----------------------------------------------------
create table if not exists stripe_events (
  id text primary key,
  type text not null,
  api_version text,
  livemode boolean not null default false,
  payload jsonb not null,
  processed_at timestamptz,
  processing_error text,
  received_at timestamptz not null default now()
);
create index if not exists stripe_events_type_idx on stripe_events(type);
create index if not exists stripe_events_received_idx on stripe_events(received_at desc);

-- Ad spend ledger ----------------------------------------------------------
create table if not exists client_ad_spend (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  platform text not null check (platform in ('meta', 'google', 'tiktok', 'youtube', 'other')),
  campaign_label text,
  period_month date not null,
  spend_cents integer not null default 0,
  source text not null default 'manual' check (source in ('manual', 'meta_api', 'google_api', 'tiktok_api', 'import')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, platform, campaign_label, period_month)
);
create index if not exists client_ad_spend_client_period_idx on client_ad_spend(client_id, period_month desc);

-- Lifecycle event log ------------------------------------------------------
create table if not exists client_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  type text not null,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  stripe_event_id text,
  actor_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now()
);
create index if not exists client_lifecycle_events_client_occurred_idx on client_lifecycle_events(client_id, occurred_at desc);
create index if not exists client_lifecycle_events_type_idx on client_lifecycle_events(type);

-- Client ALTERs ------------------------------------------------------------
alter table clients
  add column if not exists stripe_customer_id text,
  add column if not exists lifecycle_state text not null default 'lead',
  add column if not exists mrr_cents integer not null default 0,
  add column if not exists boosting_budget_cents integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_lifecycle_state_check') then
    alter table clients
      add constraint clients_lifecycle_state_check
      check (lifecycle_state in ('lead','contracted','paid_deposit','active','churned'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clients_stripe_customer_id_unique') then
    alter table clients
      add constraint clients_stripe_customer_id_unique unique (stripe_customer_id);
  end if;
end $$;

create index if not exists clients_stripe_customer_idx on clients(stripe_customer_id);
create index if not exists clients_lifecycle_state_idx on clients(lifecycle_state);

-- Client contracts ALTERs (ContractKit-aware) ------------------------------
alter table client_contracts
  add column if not exists external_provider text,
  add column if not exists external_id text,
  add column if not exists external_url text,
  add column if not exists sent_at timestamptz,
  add column if not exists signed_at timestamptz,
  add column if not exists deposit_invoice_id text,
  add column if not exists total_cents integer,
  add column if not exists deposit_cents integer;

-- Attach FK to stripe_invoices only if the column exists (defensive for older envs)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'client_contracts' and column_name = 'deposit_invoice_id'
  ) and not exists (
    select 1 from pg_constraint where conname = 'client_contracts_deposit_invoice_fk'
  ) then
    alter table client_contracts
      add constraint client_contracts_deposit_invoice_fk
      foreign key (deposit_invoice_id) references stripe_invoices(id) on delete set null;
  end if;
end $$;

-- Notifications enum extension -- add 'payment_received' --------------------
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type = any (array[
  'report_published', 'concepts_ready', 'idea_submitted', 'feedback_received',
  'preferences_updated', 'weekly_digest', 'footage_pending',
  'task_assigned', 'task_due_tomorrow', 'task_overdue', 'task_completed',
  'post_top_performer', 'engagement_spike', 'follower_milestone',
  'sync_failed', 'post_published', 'post_failed', 'post_trending',
  'account_disconnected',
  'search_completed',
  'topic_search_failed',
  'topic_search_stuck',
  'payment_received',
  'invoice_overdue',
  'contract_signed',
  'subscription_created',
  'subscription_canceled'
]));

-- Seed a kickoff-invitation onboarding email template if missing -----------
insert into onboarding_email_templates (service, name, subject, body, sort_order)
select 'general', 'kickoff_invitation',
  'Welcome to Nativz — let''s schedule your kickoff',
  '<p>Hi {{contact_first_name}},</p>'
  || '<p>We''ve received your first payment for <strong>{{client_name}}</strong> — thank you! '
  || 'The next step is a short kickoff call so we can align on timelines, access, and first deliverables.</p>'
  || '<p>Please pick a time that works for you: <a href="{{kickoff_url}}">schedule kickoff</a></p>'
  || '<p>Looking forward to getting started,<br/>The Nativz team</p>',
  0
where not exists (
  select 1 from onboarding_email_templates where name = 'kickoff_invitation'
);

-- RLS ----------------------------------------------------------------------
alter table stripe_customers       enable row level security;
alter table stripe_invoices        enable row level security;
alter table stripe_subscriptions   enable row level security;
alter table stripe_charges         enable row level security;
alter table stripe_events          enable row level security;
alter table client_ad_spend        enable row level security;
alter table client_lifecycle_events enable row level security;

-- Admin policies (match payroll_periods pattern from 116)
drop policy if exists stripe_customers_admin_all on stripe_customers;
create policy stripe_customers_admin_all on stripe_customers for all using (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
) with check (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
);

drop policy if exists stripe_invoices_admin_all on stripe_invoices;
create policy stripe_invoices_admin_all on stripe_invoices for all using (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
) with check (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
);

drop policy if exists stripe_subscriptions_admin_all on stripe_subscriptions;
create policy stripe_subscriptions_admin_all on stripe_subscriptions for all using (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
) with check (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
);

drop policy if exists stripe_charges_admin_all on stripe_charges;
create policy stripe_charges_admin_all on stripe_charges for all using (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
) with check (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
);

drop policy if exists stripe_events_admin_all on stripe_events;
create policy stripe_events_admin_all on stripe_events for all using (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
) with check (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
);

drop policy if exists client_ad_spend_admin_all on client_ad_spend;
create policy client_ad_spend_admin_all on client_ad_spend for all using (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
) with check (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
);

drop policy if exists client_lifecycle_events_admin_all on client_lifecycle_events;
create policy client_lifecycle_events_admin_all on client_lifecycle_events for all using (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
) with check (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
);

-- updated_at trigger on client_ad_spend ------------------------------------
create or replace function set_updated_at_client_ad_spend() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_client_ad_spend_updated_at on client_ad_spend;
create trigger trg_client_ad_spend_updated_at
  before update on client_ad_spend
  for each row execute function set_updated_at_client_ad_spend();

commit;
