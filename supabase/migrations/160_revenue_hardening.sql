-- 160_revenue_hardening.sql — bug fixes + anomaly detector table.
-- See docs/superpowers/specs/2026-04-24-revenue-hardening-design.md

begin;

-- 2.1 kickoff-once guard: set when queueKickoffEmail fires successfully so
-- subsequent invoice.paid events for the same client don't re-send.
alter table clients
  add column if not exists kickoff_email_sent_at timestamptz;

-- 2.4 store the deposit amount the Payment Link was minted against so /send
-- can detect drift and invalidate the old link.
alter table proposals
  add column if not exists payment_link_deposit_cents integer;

-- 3.2 anomaly detector table
create table if not exists revenue_anomalies (
  id uuid primary key default gen_random_uuid(),
  detector text not null,
  severity text not null check (severity in ('info','warning','error')),
  entity_type text,
  entity_id text,
  client_id uuid references clients(id) on delete cascade,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  dismissed_at timestamptz,
  dismissed_by uuid references auth.users(id) on delete set null,
  dismissed_reason text,
  unique (detector, entity_type, entity_id)
);

create index if not exists revenue_anomalies_open_idx
  on revenue_anomalies (severity, last_detected_at desc)
  where resolved_at is null and dismissed_at is null;

create index if not exists revenue_anomalies_client_idx
  on revenue_anomalies (client_id)
  where resolved_at is null and dismissed_at is null;

alter table revenue_anomalies enable row level security;

drop policy if exists revenue_anomalies_admin_all on revenue_anomalies;
create policy revenue_anomalies_admin_all on revenue_anomalies for all using (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
) with check (
  exists (select 1 from users where users.id = auth.uid() and (users.role in ('admin','super_admin') or users.is_super_admin = true))
);

-- 2.5 new notification type for two-day pre-expiry warning
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type = any (array[
  'report_published', 'concepts_ready', 'idea_submitted', 'feedback_received',
  'preferences_updated', 'weekly_digest', 'footage_pending',
  'task_assigned', 'task_due_tomorrow', 'task_overdue', 'task_completed',
  'post_top_performer', 'engagement_spike', 'follower_milestone',
  'sync_failed', 'post_published', 'post_failed', 'post_trending',
  'account_disconnected',
  'search_completed',
  'topic_search_failed',
  'topic_search_stuck',
  'payment_received',
  'invoice_overdue',
  'invoice_sent',
  'invoice_due_soon',
  'contract_signed',
  'subscription_created',
  'subscription_canceled',
  'subscription_paused',
  'subscription_resumed',
  'subscription_updated',
  'proposal_expiring',
  'revenue_anomaly'
]));

commit;
