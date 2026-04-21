-- 129_app_secrets.sql — encrypted runtime-config secrets
--
-- Lets admins rotate env-backed secrets (RESEND_API_KEY, RESEND_WEBHOOK_SECRET,
-- CRON_SECRET, …) from the Notifications → Setup UI without a Vercel redeploy.
-- Values are encrypted at rest with AES-256-GCM using SECRETS_ENCRYPTION_KEY
-- (held only in the Vercel env, never in the DB). The runtime resolver in
-- lib/secrets/store.ts reads a DB override first and falls back to the raw
-- env var if no override exists — so existing callers keep working.
--
-- Row-level security: RLS enabled with NO policies for authenticated users.
-- Only the service-role client (createAdminClient) can read or write. This
-- makes the table invisible to a compromised portal session even if a future
-- API route accidentally exposes it to RLS-backed queries.

create table if not exists public.app_secrets (
  key text primary key,
  ciphertext bytea not null,
  iv bytea not null,
  auth_tag bytea not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.app_secrets is
  'Encrypted secret overrides for runtime config (Resend keys, cron secret, etc.). Values encrypted at rest with SECRETS_ENCRYPTION_KEY via AES-256-GCM; the key itself never touches this table. Read + write only via service-role client.';

alter table public.app_secrets enable row level security;
