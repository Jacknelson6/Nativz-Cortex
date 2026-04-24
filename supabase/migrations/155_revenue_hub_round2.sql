-- 155_revenue_hub_round2.sql — proposals system scaffold + Meta Ads link +
-- Stripe refunds mirror + portal read access for billing.
--
-- Idempotent throughout.

begin;

-- Meta Ads link on clients ------------------------------------------------
-- Agency-partner flow: single agency app token + per-client ad-account id.
-- Value is the numeric id WITHOUT the `act_` prefix (we prepend at call time).
alter table clients
  add column if not exists meta_ad_account_id text,
  add column if not exists meta_ad_spend_synced_at timestamptz;

create index if not exists clients_meta_ad_account_idx on clients(meta_ad_account_id);

-- Stripe refunds mirror ---------------------------------------------------
create table if not exists stripe_refunds (
  id text primary key,
  charge_id text references stripe_charges(id) on delete set null,
  invoice_id text references stripe_invoices(id) on delete set null,
  customer_id text references stripe_customers(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  amount_cents integer not null default 0,
  currency text not null default 'usd',
  reason text,
  status text not null,
  created_at timestamptz,
  synced_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  livemode boolean not null default false
);
create index if not exists stripe_refunds_client_created_idx on stripe_refunds(client_id, created_at desc);
create index if not exists stripe_refunds_charge_idx on stripe_refunds(charge_id);

alter table stripe_refunds enable row level security;
drop policy if exists stripe_refunds_admin_all on stripe_refunds;
create policy stripe_refunds_admin_all on stripe_refunds for all using (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
) with check (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
);

-- Proposals system (Cortex-native doc flow replacing ContractKit) ---------
create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  slug text not null unique,
  title text not null,
  status text not null default 'draft' check (status in ('draft','sent','viewed','signed','paid','expired','canceled')),
  signer_name text,
  signer_title text,
  signer_email text,
  total_cents integer,
  deposit_cents integer,
  currency text not null default 'usd',
  body_markdown text,
  scope_statement text,
  terms_markdown text,
  expires_at timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  paid_at timestamptz,
  signature_method text,
  signature_image text,
  signed_pdf_path text,
  stripe_payment_link_id text,
  stripe_payment_link_url text,
  stripe_invoice_id text references stripe_invoices(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists proposals_client_idx on proposals(client_id);
create index if not exists proposals_status_idx on proposals(status);
create index if not exists proposals_slug_idx on proposals(slug);

create table if not exists proposal_packages (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  name text not null,
  description text,
  tier text,
  monthly_cents integer,
  annual_cents integer,
  setup_cents integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists proposal_packages_proposal_idx on proposal_packages(proposal_id);

create table if not exists proposal_deliverables (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references proposal_packages(id) on delete cascade,
  name text not null,
  quantity text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists proposal_deliverables_package_idx on proposal_deliverables(package_id);

create table if not exists proposal_events (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  type text not null,
  ip text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists proposal_events_proposal_occurred_idx on proposal_events(proposal_id, occurred_at desc);

-- Reusable package templates ----------------------------------------------
create table if not exists proposal_package_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  tier text,
  monthly_cents integer,
  annual_cents integer,
  setup_cents integer,
  deliverables jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS for proposal tables (admin-only by default; signed tokens for public page)
alter table proposals                    enable row level security;
alter table proposal_packages            enable row level security;
alter table proposal_deliverables        enable row level security;
alter table proposal_events              enable row level security;
alter table proposal_package_templates   enable row level security;

drop policy if exists proposals_admin_all on proposals;
create policy proposals_admin_all on proposals for all using (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
) with check (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
);

drop policy if exists proposal_packages_admin_all on proposal_packages;
create policy proposal_packages_admin_all on proposal_packages for all using (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
) with check (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
);

drop policy if exists proposal_deliverables_admin_all on proposal_deliverables;
create policy proposal_deliverables_admin_all on proposal_deliverables for all using (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
) with check (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
);

drop policy if exists proposal_events_admin_all on proposal_events;
create policy proposal_events_admin_all on proposal_events for all using (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
) with check (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
);

drop policy if exists proposal_package_templates_admin_all on proposal_package_templates;
create policy proposal_package_templates_admin_all on proposal_package_templates for all using (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
) with check (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
);

-- Portal read access for billing tables (viewer-scoped via user_client_access)
drop policy if exists stripe_invoices_portal_read on stripe_invoices;
create policy stripe_invoices_portal_read on stripe_invoices for select using (
  exists (
    select 1 from user_client_access
    where user_client_access.user_id = auth.uid()
    and user_client_access.client_id = stripe_invoices.client_id
  )
);

drop policy if exists stripe_subscriptions_portal_read on stripe_subscriptions;
create policy stripe_subscriptions_portal_read on stripe_subscriptions for select using (
  exists (
    select 1 from user_client_access
    where user_client_access.user_id = auth.uid()
    and user_client_access.client_id = stripe_subscriptions.client_id
  )
);

drop policy if exists stripe_charges_portal_read on stripe_charges;
create policy stripe_charges_portal_read on stripe_charges for select using (
  exists (
    select 1 from user_client_access
    where user_client_access.user_id = auth.uid()
    and user_client_access.client_id = stripe_charges.client_id
  )
);

drop policy if exists client_lifecycle_events_portal_read on client_lifecycle_events;
create policy client_lifecycle_events_portal_read on client_lifecycle_events for select using (
  exists (
    select 1 from user_client_access
    where user_client_access.user_id = auth.uid()
    and user_client_access.client_id = client_lifecycle_events.client_id
  )
);

-- Updated-at triggers for proposals and templates -------------------------
create or replace function set_updated_at_proposal() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_proposals_updated_at on proposals;
create trigger trg_proposals_updated_at before update on proposals
  for each row execute function set_updated_at_proposal();

drop trigger if exists trg_proposal_package_templates_updated_at on proposal_package_templates;
create trigger trg_proposal_package_templates_updated_at before update on proposal_package_templates
  for each row execute function set_updated_at_proposal();

commit;
