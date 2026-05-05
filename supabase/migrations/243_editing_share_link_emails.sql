-- Migration 243: Editing share-link email body archive
--
-- Mirrors share_link_emails (migration 241) for the editing-projects
-- side. SMM share links live in content_drop_share_links and write to
-- share_link_emails; editing share links live in
-- editing_project_share_links and write here. Two tables instead of a
-- polymorphic FK so deletes cascade cleanly when a share link is
-- archived without needing a polymorphic check constraint.
--
-- The unified review modal reads from both surfaces and renders them
-- through the same EmailArchiveDialog component so the SMM and Editing
-- modals stay 1:1 from the user's perspective.

create table if not exists public.editing_share_link_emails (
  id uuid primary key default gen_random_uuid(),
  share_link_id uuid not null references public.editing_project_share_links(id) on delete cascade,

  -- Editing today writes 'delivery' (first send) and 'rereview'
  -- (subsequent send after revised cuts). The remaining kinds are
  -- carried forward from the SMM enum so future automation paths
  -- (manual followups, auto followups, all_approved, revisions_complete
  -- notifications) can write here without a schema change.
  kind text not null check (kind in (
    'delivery',
    'rereview',
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

  recipients jsonb not null default '[]'::jsonb,

  sent_by uuid references public.users(id) on delete set null,

  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists editing_share_link_emails_share_link_id_sent_at_idx
  on public.editing_share_link_emails (share_link_id, sent_at desc);

create index if not exists editing_share_link_emails_kind_idx
  on public.editing_share_link_emails (kind);

alter table public.editing_share_link_emails enable row level security;

create policy "editing_share_link_emails_admin_all"
  on public.editing_share_link_emails
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
