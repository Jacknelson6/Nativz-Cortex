-- supabase/migrations/125_client_contracts.sql
-- Client contract deliverables: two tables + private storage bucket + RLS.

begin;

create table if not exists client_contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  label text not null default 'Contract',
  file_path text,
  file_name text,
  file_size integer,
  file_mime text,
  status text not null default 'draft' check (status in ('draft','active','ended')),
  effective_start date,
  effective_end date,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  notes text,
  parse_meta jsonb
);

create index if not exists idx_client_contracts_client_status
  on client_contracts (client_id, status);

create table if not exists client_contract_deliverables (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references client_contracts(id) on delete cascade,
  service_tag text not null,
  name text not null,
  quantity_per_month integer not null check (quantity_per_month >= 0),
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_contract_deliverables_contract
  on client_contract_deliverables (contract_id);

alter table client_contracts enable row level security;
alter table client_contract_deliverables enable row level security;

drop policy if exists client_contracts_admin_all on client_contracts;
create policy client_contracts_admin_all on client_contracts
  for all to authenticated
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('admin','super_admin')
    )
  )
  with check (
    exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('admin','super_admin')
    )
  );

drop policy if exists client_contract_deliverables_admin_all on client_contract_deliverables;
create policy client_contract_deliverables_admin_all on client_contract_deliverables
  for all to authenticated
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('admin','super_admin')
    )
  )
  with check (
    exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('admin','super_admin')
    )
  );

insert into storage.buckets (id, name, public)
values ('client-contracts', 'client-contracts', false)
on conflict (id) do nothing;

drop policy if exists client_contracts_storage_admin_rw on storage.objects;
create policy client_contracts_storage_admin_rw on storage.objects
  for all to authenticated
  using (
    bucket_id = 'client-contracts'
    and exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('admin','super_admin')
    )
  )
  with check (
    bucket_id = 'client-contracts'
    and exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('admin','super_admin')
    )
  );

commit;
