-- 161_proposal_self_host.sql
-- Cortex now self-hosts proposals at /proposals/<slug> instead of generating
-- folders into external docs repos. Adds the columns we capture at sign time
-- (tier picked, cadence, IP/UA, PDF hash) and the counter-sign columns we
-- write after the deposit clears on Stripe.
--
-- Storage: a private `proposal-pdfs` bucket holds the canonical PDFs.
-- Signed URLs (1h TTL) are minted server-side when admins or signers need
-- to download a copy.
--
-- Idempotent — safe to re-run.

begin;

alter table proposals
  -- Tier the signer chose on the sign page (one of the keys in template
  -- tiers_preview / proposalConfig.tiers).
  add column if not exists tier_id text,
  add column if not exists tier_label text,
  add column if not exists cadence text check (cadence in ('month','year','week')),
  add column if not exists is_subscription boolean not null default false,
  -- Sign-time capture.
  add column if not exists signed_ip text,
  add column if not exists signed_user_agent text,
  add column if not exists pdf_sha256 text,
  add column if not exists pdf_bytes integer,
  -- Counter-sign (after deposit clears via Stripe).
  add column if not exists counter_signed_at timestamptz,
  add column if not exists counter_signed_pdf_path text,
  add column if not exists stripe_checkout_session_id text;

create index if not exists proposals_stripe_session_idx
  on proposals(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

-- Private bucket for signed contract PDFs. 5MB cap, PDFs only. RLS via the
-- standard storage.objects policies — admin role + the proposal's signer can
-- read; nobody else.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proposal-pdfs', 'proposal-pdfs', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

-- Admin: full access (matches the per-table admin policies elsewhere).
drop policy if exists proposal_pdfs_admin_all on storage.objects;
create policy proposal_pdfs_admin_all on storage.objects
  for all
  using (
    bucket_id = 'proposal-pdfs'
    and exists (
      select 1 from users u
      where u.id = auth.uid()
        and (u.role in ('admin','super_admin') or u.is_super_admin = true)
    )
  )
  with check (
    bucket_id = 'proposal-pdfs'
    and exists (
      select 1 from users u
      where u.id = auth.uid()
        and (u.role in ('admin','super_admin') or u.is_super_admin = true)
    )
  );

commit;
