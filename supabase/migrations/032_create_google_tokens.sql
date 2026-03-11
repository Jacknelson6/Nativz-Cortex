-- Google OAuth token storage for native Google Workspace integration
create table if not exists google_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table google_tokens enable row level security;

-- Only the owning user can see their own tokens
create policy "Users can view own google tokens"
  on google_tokens for select
  using (auth.uid() = user_id);

-- Service role (admin client) handles insert/update/delete
