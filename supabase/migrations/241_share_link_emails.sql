-- Migration 241: Share-link email body archive
--
-- The unified review modal surfaces "last email sent (auto or manual)
-- and what it said" for both SMM and Editing share links. The existing
-- timestamp columns on content_drop_share_links record *that* a send
-- happened; this table records *what was sent* so the modal can show
-- the actual subject/body, who it went to, and which kind of touch it
-- was.

create table if not exists public.share_link_emails (
  id uuid primary key default gen_random_uuid(),
  share_link_id uuid not null references public.content_drop_share_links(id) on delete cascade,

  -- What kind of email this was. Mirrors the existing timestamp
  -- columns on the share link so cron + manual paths converge here:
  --   initial               first send (admin clicks Send)
  --   resend                manual resend by admin
  --   manual_followup       manual followup by admin
  --   auto_followup_open    cron, not yet opened
  --   auto_followup_action  cron, opened but no action
  --   auto_followup_final   cron, last-call ping
  --   all_approved          notification when client approved everything
  --   revisions_complete    notification when admin finishes revisions
  kind text not null check (kind in (
    'initial',
    'resend',
    'manual_followup',
    'auto_followup_open',
    'auto_followup_action',
    'auto_followup_final',
    'all_approved',
    'revisions_complete'
  )),

  subject text not null,
  html_body text not null,
  plain_body text,

  -- Snapshot of recipients at send time. Stored as jsonb so the modal
  -- can show "sent to <names>" without re-deriving from the contacts
  -- table (which may have changed since).
  recipients jsonb not null default '[]'::jsonb,

  -- Who triggered this. Null when cron-driven.
  sent_by uuid references public.users(id) on delete set null,

  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists share_link_emails_share_link_id_sent_at_idx
  on public.share_link_emails (share_link_id, sent_at desc);

create index if not exists share_link_emails_kind_idx
  on public.share_link_emails (kind);

alter table public.share_link_emails enable row level security;

create policy "share_link_emails_admin_all"
  on public.share_link_emails
  for all
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
        and (users.role = any (array['admin','super_admin'])
             or users.is_super_admin = true)
    )
  )
  with check (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
        and (users.role = any (array['admin','super_admin'])
             or users.is_super_admin = true)
    )
  );
