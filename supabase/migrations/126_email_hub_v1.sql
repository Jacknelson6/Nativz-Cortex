-- Migration 126: Email Hub v1
--
-- Admin-only correspondence surface at /admin/tools/email. Sits alongside
-- existing email_templates (mig 100), scheduled_emails (101), and
-- production_updates (113). Adds:
--   - email_contacts: recipient profiles independent of auth.users
--   - email_lists + email_list_members: reusable audiences
--   - email_campaigns: broadcast correspondence runs
--   - email_messages: per-recipient send record + delivery events
--   - email_sequences + email_sequence_steps + email_sequence_enrollments: drips
--
-- All tables RLS-locked to role='admin' / 'super_admin'. Portal viewers
-- MUST NOT reach any of these. The webhook endpoint uses service-role so
-- RLS doesn't gate ingestion.

-- ───────────────────────────────────────────────────────────────────────────
-- email_contacts
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists email_contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  first_name text,
  last_name text,
  title text,
  company text,
  role text,                                -- e.g. "decision_maker", "contact"
  client_id uuid references clients(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  notes text,
  tags text[] not null default '{}',
  subscribed boolean not null default true,
  unsubscribed_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists email_contacts_email_unique
  on email_contacts (lower(email));
create index if not exists email_contacts_client_idx
  on email_contacts (client_id) where client_id is not null;
create index if not exists email_contacts_user_idx
  on email_contacts (user_id) where user_id is not null;

alter table email_contacts enable row level security;

create policy email_contacts_admin_all on email_contacts for all
  using (exists (select 1 from users u where u.id = auth.uid() and u.role in ('admin', 'super_admin')))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.role in ('admin', 'super_admin')));

-- ───────────────────────────────────────────────────────────────────────────
-- email_lists
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists email_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  tags text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table email_lists enable row level security;

create policy email_lists_admin_all on email_lists for all
  using (exists (select 1 from users u where u.id = auth.uid() and u.role in ('admin', 'super_admin')))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.role in ('admin', 'super_admin')));

create table if not exists email_list_members (
  list_id uuid not null references email_lists(id) on delete cascade,
  contact_id uuid not null references email_contacts(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (list_id, contact_id)
);

create index if not exists email_list_members_contact_idx
  on email_list_members (contact_id);

alter table email_list_members enable row level security;

create policy email_list_members_admin_all on email_list_members for all
  using (exists (select 1 from users u where u.id = auth.uid() and u.role in ('admin', 'super_admin')))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.role in ('admin', 'super_admin')));

-- ───────────────────────────────────────────────────────────────────────────
-- email_campaigns
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  subject text,
  body_markdown text,
  template_id uuid references email_templates(id) on delete set null,
  agency text check (agency in ('nativz', 'anderson')),
  client_id uuid references clients(id) on delete set null,
  -- Audience: at most one of these is set (list OR portal agency scope OR
  -- ad-hoc contact selection via email_messages rows directly). The UI
  -- records what the admin chose so we can re-run later.
  audience_list_id uuid references email_lists(id) on delete set null,
  audience_portal_only boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  total_recipients integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_campaigns_status_idx
  on email_campaigns (status);
create index if not exists email_campaigns_client_idx
  on email_campaigns (client_id) where client_id is not null;
create index if not exists email_campaigns_scheduled_idx
  on email_campaigns (scheduled_for) where status = 'scheduled';

alter table email_campaigns enable row level security;

create policy email_campaigns_admin_all on email_campaigns for all
  using (exists (select 1 from users u where u.id = auth.uid() and u.role in ('admin', 'super_admin')))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.role in ('admin', 'super_admin')));

-- ───────────────────────────────────────────────────────────────────────────
-- email_messages — per-recipient send row (source of truth for stats)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists email_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references email_campaigns(id) on delete cascade,
  sequence_enrollment_id uuid,  -- set fk after enrollments table exists below
  sequence_step_id uuid,
  contact_id uuid references email_contacts(id) on delete set null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_email text not null,
  agency text check (agency in ('nativz', 'anderson')),
  from_address text,
  subject text not null,
  body_markdown text,
  resend_id text,
  status text not null default 'draft' check (
    status in ('draft', 'scheduled', 'sending', 'sent', 'delivered', 'bounced', 'failed', 'complained')
  ),
  scheduled_for timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer not null default 0,
  clicked_at timestamptz,
  last_clicked_at timestamptz,
  click_count integer not null default 0,
  replied_at timestamptz,
  bounced_at timestamptz,
  failed_at timestamptz,
  unsubscribed_at timestamptz,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_messages_campaign_idx
  on email_messages (campaign_id) where campaign_id is not null;
create index if not exists email_messages_contact_idx
  on email_messages (contact_id) where contact_id is not null;
create index if not exists email_messages_resend_idx
  on email_messages (resend_id) where resend_id is not null;
create index if not exists email_messages_status_idx
  on email_messages (status);
create index if not exists email_messages_recipient_email_idx
  on email_messages (lower(recipient_email));

alter table email_messages enable row level security;

create policy email_messages_admin_all on email_messages for all
  using (exists (select 1 from users u where u.id = auth.uid() and u.role in ('admin', 'super_admin')))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.role in ('admin', 'super_admin')));

-- ───────────────────────────────────────────────────────────────────────────
-- email_sequences + steps + enrollments
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists email_sequences (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  agency text check (agency in ('nativz', 'anderson')),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table email_sequences enable row level security;
create policy email_sequences_admin_all on email_sequences for all
  using (exists (select 1 from users u where u.id = auth.uid() and u.role in ('admin', 'super_admin')))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.role in ('admin', 'super_admin')));

create table if not exists email_sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references email_sequences(id) on delete cascade,
  step_order integer not null,
  delay_days integer not null default 0,
  subject text not null,
  body_markdown text not null,
  template_id uuid references email_templates(id) on delete set null,
  stop_on_reply boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists email_sequence_steps_sequence_idx
  on email_sequence_steps (sequence_id, step_order);

alter table email_sequence_steps enable row level security;
create policy email_sequence_steps_admin_all on email_sequence_steps for all
  using (exists (select 1 from users u where u.id = auth.uid() and u.role in ('admin', 'super_admin')))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.role in ('admin', 'super_admin')));

create table if not exists email_sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references email_sequences(id) on delete cascade,
  contact_id uuid not null references email_contacts(id) on delete cascade,
  current_step integer not null default 0,
  next_send_at timestamptz,
  status text not null default 'active' check (status in ('active', 'completed', 'stopped', 'paused')),
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  stopped_reason text,
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists email_sequence_enrollments_next_idx
  on email_sequence_enrollments (next_send_at) where status = 'active';
create index if not exists email_sequence_enrollments_contact_idx
  on email_sequence_enrollments (contact_id);
create unique index if not exists email_sequence_enrollments_one_active
  on email_sequence_enrollments (sequence_id, contact_id) where status = 'active';

alter table email_sequence_enrollments enable row level security;
create policy email_sequence_enrollments_admin_all on email_sequence_enrollments for all
  using (exists (select 1 from users u where u.id = auth.uid() and u.role in ('admin', 'super_admin')))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.role in ('admin', 'super_admin')));

-- Wire the deferred FKs on email_messages now that enrollments + steps exist
alter table email_messages
  add constraint email_messages_sequence_enrollment_fk
  foreign key (sequence_enrollment_id) references email_sequence_enrollments(id) on delete set null;

alter table email_messages
  add constraint email_messages_sequence_step_fk
  foreign key (sequence_step_id) references email_sequence_steps(id) on delete set null;

-- ───────────────────────────────────────────────────────────────────────────
-- Resend webhook raw events (debug trail)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists email_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  resend_id text,
  email_message_id uuid references email_messages(id) on delete set null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

create index if not exists email_webhook_events_resend_idx
  on email_webhook_events (resend_id) where resend_id is not null;
create index if not exists email_webhook_events_received_idx
  on email_webhook_events (received_at desc);

alter table email_webhook_events enable row level security;
create policy email_webhook_events_admin_read on email_webhook_events for select
  using (exists (select 1 from users u where u.id = auth.uid() and u.role in ('admin', 'super_admin')));
