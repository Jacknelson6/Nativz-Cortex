-- Create team_members table for Nativz internal team

create table team_members (
  id uuid primary key references auth.users(id),
  full_name text,
  email text,
  role text,
  avatar_url text,
  is_active bool default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table team_members enable row level security;

create policy "Admins can manage team members"
  on team_members for all
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
      and users.role = 'admin'
    )
  );
