-- Create contacts table for client points of contact

create table contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  role text,
  project_role text,
  avatar_url text,
  is_primary bool default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_contacts_client_id on contacts(client_id);

alter table contacts enable row level security;

create policy "Admins can manage contacts"
  on contacts for all
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
      and users.role = 'admin'
    )
  );
