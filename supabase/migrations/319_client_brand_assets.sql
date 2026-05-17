-- 319_client_brand_assets.sql — brand assets / previous footage per client
-- ----------------------------------------------------------------------------
-- When SMM or editing clients onboard, they hand over brand assets: logos,
-- brand guidelines, past footage, photo libraries. Until now the only place
-- these landed was `onboarding_uploads` (tracker-scoped, intake-only). This
-- table is the long-lived home for those files plus anything an admin
-- uploads ad-hoc later. Surfaced on /admin/clients/[slug]/settings/info.
--
-- Files live in a private `brand-assets` bucket; access goes through signed
-- URLs only. Admin-only RLS — portal users never touch this table.

begin;

create table if not exists client_brand_assets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  label text,
  category text not null default 'other'
    check (category in ('footage', 'logo', 'guideline', 'photo', 'font', 'other')),
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  note text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists client_brand_assets_client_id_idx
  on client_brand_assets (client_id, created_at desc);

alter table client_brand_assets enable row level security;

drop policy if exists client_brand_assets_admin_all on client_brand_assets;
create policy client_brand_assets_admin_all on client_brand_assets
  for all to authenticated
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('admin', 'super_admin')
    )
  );

insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', false)
on conflict (id) do nothing;

drop policy if exists brand_assets_storage_admin_rw on storage.objects;
create policy brand_assets_storage_admin_rw on storage.objects
  for all to authenticated
  using (
    bucket_id = 'brand-assets'
    and exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('admin', 'super_admin')
    )
  )
  with check (
    bucket_id = 'brand-assets'
    and exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('admin', 'super_admin')
    )
  );

commit;
