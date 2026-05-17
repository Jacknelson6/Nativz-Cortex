-- Migration 322 — schema for the Profile redesign + onboarding rewrite.
--
-- Pre-reqs the new chrome (tasks/profile/03, 09, 10) leans on:
--   * client_products             — structured product list with thumbnails,
--                                   replaces the unstructured clients.products text[].
--   * client_social_accounts      — real table for per-platform social handles,
--                                   replaces step_state.social_handles.connections[].
--   * client_brand_assets.source  — provenance check so onboarding-scraped
--                                   uploads can be distinguished from admin uploads.
--   * clients.drop_reminder_email_enabled — third email toggle (PRD 08).

begin;

create table if not exists client_products (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  title text not null,
  url text,
  price_cents integer,
  currency text,
  thumbnail_url text,
  source text not null default 'manual'
    check (source in ('manual','onboarding_scrape','onboarding_upload')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_products_client_id_idx on client_products(client_id);

create table if not exists client_social_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  platform text not null
    check (platform in ('instagram','tiktok','youtube','facebook','linkedin','x')),
  handle text,
  external_account_id text,
  connection_status text not null default 'pending'
    check (connection_status in ('pending','connected','disconnected','error')),
  connected_via text not null default 'manual'
    check (connected_via in ('zernio','manual','meta_business_suite')),
  metadata jsonb,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, platform)
);
create index if not exists client_social_accounts_client_id_idx on client_social_accounts(client_id);

alter table client_brand_assets
  add column if not exists source text not null default 'admin_upload';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'client_brand_assets_source_chk'
  ) then
    alter table client_brand_assets
      add constraint client_brand_assets_source_chk
      check (source in ('admin_upload','onboarding_scrape','onboarding_upload'));
  end if;
end $$;

alter table clients
  add column if not exists drop_reminder_email_enabled boolean not null default true;

-- RLS — service-role bypasses these, so the policies just keep viewer reads
-- scoped to clients they have access to via user_client_access.
alter table client_products enable row level security;
alter table client_social_accounts enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='client_products' and policyname='admins_all') then
    create policy admins_all on client_products
      for all to authenticated
      using (exists (select 1 from users where users.id = auth.uid() and users.role in ('admin','super_admin')))
      with check (exists (select 1 from users where users.id = auth.uid() and users.role in ('admin','super_admin')));
  end if;

  if not exists (select 1 from pg_policies where tablename='client_products' and policyname='viewers_read_own_client') then
    create policy viewers_read_own_client on client_products
      for select to authenticated
      using (
        client_id in (select uca.client_id from user_client_access uca where uca.user_id = auth.uid())
      );
  end if;

  if not exists (select 1 from pg_policies where tablename='client_social_accounts' and policyname='admins_all') then
    create policy admins_all on client_social_accounts
      for all to authenticated
      using (exists (select 1 from users where users.id = auth.uid() and users.role in ('admin','super_admin')))
      with check (exists (select 1 from users where users.id = auth.uid() and users.role in ('admin','super_admin')));
  end if;

  if not exists (select 1 from pg_policies where tablename='client_social_accounts' and policyname='viewers_read_own_client') then
    create policy viewers_read_own_client on client_social_accounts
      for select to authenticated
      using (
        client_id in (select uca.client_id from user_client_access uca where uca.user_id = auth.uid())
      );
  end if;
end $$;

commit;
