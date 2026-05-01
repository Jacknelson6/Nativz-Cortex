-- 214_connection_invites.sql
-- Self-serve connection invite tokens for the Connections matrix.
-- An admin picks platforms + recipients on /admin/content-tools, we mint
-- a token, email the client, and they land on /connect/invite/{token} to
-- one-tap reconnect each account through Zernio.
--
-- Also adds Zernio token-expiry columns to social_profiles so the matrix
-- can badge accounts whose token is about to expire (Zernio reports a
-- 60-day rolling expiry on most platforms).

create table if not exists connection_invites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  token text not null unique,
  platforms text[] not null,
  recipient_emails text[] not null,
  notify_chat boolean not null default true,
  notify_email boolean not null default true,
  completed_platforms text[] not null default '{}',
  expires_at timestamptz not null default (now() + interval '30 days'),
  last_opened_at timestamptz,
  completed_at timestamptz,
  sent_at timestamptz default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create index if not exists connection_invites_client_idx on connection_invites (client_id);
create index if not exists connection_invites_token_idx on connection_invites (token);
create index if not exists connection_invites_expires_idx on connection_invites (expires_at);

alter table connection_invites enable row level security;

drop policy if exists connection_invites_admin_all on connection_invites;
create policy connection_invites_admin_all on connection_invites
  for all using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role in ('admin', 'super_admin')
    )
  );

-- Token-expiry surfacing on the matrix.
alter table social_profiles
  add column if not exists token_expires_at timestamptz,
  add column if not exists token_status text;

comment on column social_profiles.token_expires_at is
  'Zernio-reported token expiry. Populated by the matrix re-check action via /accounts/{id}/health.';
comment on column social_profiles.token_status is
  'valid | needs_refresh | expired | unknown — last seen state from Zernio health.';
