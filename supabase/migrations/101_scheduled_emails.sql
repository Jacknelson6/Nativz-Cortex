-- 101_scheduled_emails.sql
-- Pending + historical scheduled email sends drained by a 1-minute Vercel cron.

create table if not exists scheduled_emails (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users(id) on delete cascade,
  template_id uuid references email_templates(id) on delete set null,
  subject text not null,
  body_markdown text not null,
  send_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  sent_at timestamptz,
  resend_id text,
  failure_reason text,
  scheduled_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists scheduled_emails_pending_idx on scheduled_emails (send_at) where status = 'pending';
create index if not exists scheduled_emails_recipient_idx on scheduled_emails (recipient_id);

alter table scheduled_emails enable row level security;

create policy scheduled_emails_admin_all on scheduled_emails for all
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
