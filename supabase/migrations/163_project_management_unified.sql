-- 163_project_management_unified.sql
-- Unified Project Management surface — extends `tasks` to absorb shoot + edit work items.
-- See docs/superpowers/specs/2026-04-25-project-management-design.md
--
-- Strictly additive: no DROPs, no column renames, no destructive backfills.
-- Existing /api/tasks/* clients keep working unchanged.

begin;

-- ──────────────────────────────────────────────────────────────────────
-- 1. Shoot-specific columns on `tasks`
-- ──────────────────────────────────────────────────────────────────────
-- Mirrors the schema of the legacy `shoot_events` table (0 rows in prod, no
-- migration ever created it — it was created out-of-band). Absorbing those
-- columns here lets us delete `shoot_events` once callers migrate, without
-- losing any of the shoot-planner or footage-upload workflows.

alter table tasks add column if not exists shoot_location text;
alter table tasks add column if not exists shoot_start_at timestamptz;
alter table tasks add column if not exists shoot_end_at timestamptz;
alter table tasks add column if not exists shoot_notes text;

-- Google Calendar integration (existing in /api/shoots POST flow)
alter table tasks add column if not exists calendar_connection_id uuid;
alter table tasks add column if not exists google_event_id text;
alter table tasks add column if not exists google_calendar_event_created boolean default false;
alter table tasks add column if not exists invitees jsonb default '[]'::jsonb;

-- Scheduled / draft state machine for shoots (independent of `tasks.status`,
-- which is the kanban pipeline). Values mirror the existing `shoot_events.scheduled_status` usage.
alter table tasks add column if not exists scheduled_status text
  check (scheduled_status is null or scheduled_status in (
    'draft', 'scheduled', 'completed', 'cancelled'
  ));

-- Shoot-planner workflow (used by /api/cron/shoot-planner + /api/shoots/[id]/plan)
alter table tasks add column if not exists plan_status text default 'pending'
  check (plan_status is null or plan_status in (
    'pending', 'generating', 'ready', 'sent', 'failed'
  ));
alter table tasks add column if not exists plan_data jsonb;
alter table tasks add column if not exists plan_generated_at timestamptz;
alter table tasks add column if not exists plan_sent_at timestamptz;
alter table tasks add column if not exists plan_sent_to text[];

-- Footage-upload workflow (used by /api/shoots/[id]/footage)
alter table tasks add column if not exists raw_footage_uploaded boolean default false;
alter table tasks add column if not exists raw_footage_url text;
alter table tasks add column if not exists raw_footage_uploaded_at timestamptz;
alter table tasks add column if not exists footage_ping_sent_at timestamptz;

-- ──────────────────────────────────────────────────────────────────────
-- 2. Edit-specific columns on `tasks`
-- ──────────────────────────────────────────────────────────────────────

-- Pipeline stage for edits. Distinct from `tasks.status` so a shoot's parent
-- task can be `done` while its edit child travels through its own pipeline.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'tasks' and column_name = 'edit_status'
  ) then
    alter table tasks add column edit_status text
      check (edit_status in (
        'not_started',
        'in_edit',
        'review',
        'revisions',
        'approved',
        'delivered'
      ));
  end if;
end $$;

alter table tasks add column if not exists edit_revision_count integer default 0;
alter table tasks add column if not exists edit_source_url text;
alter table tasks add column if not exists edit_deliverable_url text;
alter table tasks add column if not exists edit_due_at timestamptz;

-- Optional self-referential link: an edit row can point at its source shoot row.
alter table tasks add column if not exists parent_shoot_id uuid
  references tasks(id) on delete set null;

-- ──────────────────────────────────────────────────────────────────────
-- 3. Generic project-management columns on `tasks`
-- ──────────────────────────────────────────────────────────────────────

-- Per-column drag-reorder support for the kanban Board view.
alter table tasks add column if not exists sort_order integer default 0;

-- Lifecycle timestamps drive the Timeline view and stay-on-track analytics.
alter table tasks add column if not exists started_at timestamptz;
alter table tasks add column if not exists completed_at timestamptz;

-- Best-effort backfill so existing rows get a sensible `completed_at`.
-- Leaves `started_at` null for rows that never recorded a start.
update tasks
   set completed_at = coalesce(updated_at, created_at)
 where status = 'done'
   and completed_at is null;

-- ──────────────────────────────────────────────────────────────────────
-- 4. Indexes
-- ──────────────────────────────────────────────────────────────────────

create index if not exists idx_tasks_shoot_start on tasks(shoot_start_at) where shoot_start_at is not null;
create index if not exists idx_tasks_scheduled_status on tasks(scheduled_status) where scheduled_status is not null;
create index if not exists idx_tasks_plan_status on tasks(plan_status) where plan_status is not null;
create index if not exists idx_tasks_edit_status on tasks(edit_status) where edit_status is not null;
create index if not exists idx_tasks_edit_due on tasks(edit_due_at) where edit_due_at is not null;
create index if not exists idx_tasks_parent_shoot on tasks(parent_shoot_id) where parent_shoot_id is not null;
create index if not exists idx_tasks_sort on tasks(sort_order);
create index if not exists idx_tasks_completed_at on tasks(completed_at desc) where completed_at is not null;

-- ──────────────────────────────────────────────────────────────────────
-- 5. Notification types — extend CHECK to allow new PM events
-- ──────────────────────────────────────────────────────────────────────
-- Mirrors the constraint set in 160_revenue_hardening.sql plus the four new
-- types below. Re-applying the full list keeps a single source of truth.

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type = any (array[
  -- existing types (from 160_revenue_hardening.sql) ──────────────────
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
  'revenue_anomaly',
  -- new in 163 ────────────────────────────────────────────────────────
  'shoot_scheduled',          -- replaces ad-hoc handling for new shoots
  'shoot_rescheduled',
  'shoot_cancelled',
  'edit_status_changed'
]));

commit;
