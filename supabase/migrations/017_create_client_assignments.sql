-- Create client_assignments table linking team members to clients

create table client_assignments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  team_member_id uuid not null references team_members(id) on delete cascade,
  role text,
  is_lead bool default false,
  created_at timestamptz default now(),

  unique (client_id, team_member_id)
);

create index idx_client_assignments_client_id on client_assignments(client_id);
create index idx_client_assignments_team_member_id on client_assignments(team_member_id);

alter table client_assignments enable row level security;

create policy "Admins can manage client assignments"
  on client_assignments for all
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
      and users.role = 'admin'
    )
  );
