-- 128_email_webhook_signature_flag.sql — add signature_valid to webhook events
--
-- When Resend hits /api/webhooks/resend with an invalid Svix signature we
-- previously returned 401 and dropped the attempt on the floor, leaving the
-- Setup tab showing "no events received" even though Resend was connected.
-- Now we archive the attempt with signature_valid=false so admins can tell
-- "Resend is reaching us but the secret is stale" from "Resend isn't
-- configured yet." The 401 response is unchanged — Resend still retries.

alter table public.email_webhook_events
  add column if not exists signature_valid boolean not null default true;

create index if not exists email_webhook_events_signature_idx
  on public.email_webhook_events (signature_valid, received_at desc);

comment on column public.email_webhook_events.signature_valid is
  'False when the Svix signature check failed. We still log the attempt so admins can see Resend is reaching the endpoint even when secrets are misaligned.';
