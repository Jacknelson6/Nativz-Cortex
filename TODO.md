# Nativz Cortex — Master Task Queue

> Single source of truth for all dev work.  
> Statuses: `[ ]` todo · `[🔄]` in-progress · `[x]` done  
> Each task is written to be handed directly to a Claude Code agent.
> **Calendar integration:** Using Nango for OAuth token management (Google Calendar). Custom native scheduler built in Cortex sends invites.

---

## EPIC 1 — Client Score System

**Goal:** Replace the arbitrary numeric score on client cards with an admin-managed rating that the team sets manually.

- [x] **DB migration: add `health_score` to `clients` table** — New column: `health_score text` with allowed values: `'not_good' | 'fair' | 'good' | 'great' | 'excellent'`. Write the Supabase migration SQL in `supabase/migrations/`. Default `null`.
- [x] **Client settings page: add Health Score selector** — In `/admin/clients/[slug]/settings`, add a labeled dropdown (using existing Select component) with options: Not Good / Fair / Good / Great / Excellent. Wire to `PATCH /api/clients/[id]`. Show current value on load.
- [x] **Client card: replace numeric score badge with health rating badge** — On the clients list cards, replace the number badge (e.g. "50", "55") with a colored label badge showing the health rating. Colors: Not Good = red, Fair = amber, Good = blue, Great = teal, Excellent = green. If no rating set, show nothing.
- [x] **Client detail page: show health score** — Display the health score prominently on the client detail page header with same color coding.

---

## EPIC 2 — Client Profile Rework (Replace Monday.com client data)

**Goal:** Full client profile system built natively in Cortex. Clients list cards show enabled services. End reliance on Monday for client data.

### 2A — Database

- [x] **DB migration: expand `clients` table** — Add columns:
  - `agency text` — which Nativz agency they're under (e.g. Nativz, AC, etc.)
  - `services text[]` — array of enabled services (e.g. `['SMM', 'Paid Media', 'Editing', 'Nativz', 'Affiliates']`)
  - `description text` — short client description / notes
  - `google_drive_branding_url text` — link to branding assets folder on Google Drive
  - `google_drive_calendars_url text` — link to content calendars folder on Google Drive
  - Write migration SQL in `supabase/migrations/`.

- [x] **DB migration: create `contacts` table** — New table for points of contact per client:
  - `id uuid primary key`
  - `client_id uuid references clients(id) on delete cascade`
  - `name text not null`
  - `email text`
  - `phone text`
  - `role text` — their role at the client company
  - `project_role text` — their role in the Nativz engagement (e.g. "Primary Contact", "Approver", "Creative Lead")
  - `avatar_url text`
  - `is_primary bool default false`
  - Enable RLS. Write migration SQL in `supabase/migrations/`.

- [x] **DB migration: create `team_members` table** — New table for Nativz internal team:
  - `id uuid primary key references auth.users(id)`
  - `full_name text`
  - `email text`
  - `role text` — job title / position (e.g. "Social Media Manager", "Video Editor", "Account Manager")
  - `avatar_url text`
  - `is_active bool default true`
  - Write migration SQL in `supabase/migrations/`.

- [x] **DB migration: create `client_assignments` table** — Links team members to clients:
  - `id uuid primary key`
  - `client_id uuid references clients(id) on delete cascade`
  - `team_member_id uuid references team_members(id) on delete cascade`
  - `role text` — their role on this account (e.g. "Account Manager", "Editor")
  - `is_lead bool default false`
  - Write migration SQL in `supabase/migrations/`.

### 2B — API Routes

- [x] **API: contacts CRUD** — Create `/api/clients/[id]/contacts`:
  - `GET` — list all contacts for client
  - `POST` — add new contact (body: name, email, phone, role, project_role, is_primary)
  - `PATCH /api/clients/[id]/contacts/[contactId]` — update contact
  - `DELETE /api/clients/[id]/contacts/[contactId]` — delete contact
  - Admin only. Zod validation. Follow existing API patterns.

- [x] **API: team members** — Create `/api/team`:
  - `GET` — list all active team members
  - `POST` — create team member
  - `PATCH /api/team/[id]` — update team member
  - Admin only. Zod validation.

- [x] **API: client assignments** — Create `/api/clients/[id]/assignments`:
  - `GET` — list team members assigned to client
  - `POST` — assign team member to client  
  - `DELETE /api/clients/[id]/assignments/[assignmentId]` — unassign
  - Admin only. Zod validation.

- [x] **API: update `PATCH /api/clients/[id]`** — Extend existing client PATCH to accept `agency`, `services`, `description`, `google_drive_branding_url`, `google_drive_calendars_url`, `health_score`.

### 2C — UI: Clients List

- [x] **Clients list: show services tags from DB** — The service tags on client cards (Nativz, SMM, Paid Media, etc.) should read from `clients.services` array in the DB, not hardcoded. Each service gets its own colored badge. Remove hardcoded values.
- [x] **Clients list: show assigned team members** — Below services on each card, show avatar stack of team members assigned to the client (max 3 + overflow count).
- [x] **Clients list: filter by agency** — The "All agencies" dropdown on the clients list should filter by `clients.agency`. Populate dropdown dynamically from distinct agency values in DB.

### 2D — UI: Client Detail & Settings Pages

- [x] **Client settings: add new fields** — On `/admin/clients/[slug]/settings`, add form fields for: Agency (text input or dropdown), Services (multi-select checkboxes: Nativz / SMM / Paid Media / Editing / Affiliates / AC), Description, Google Drive Branding URL, Google Drive Calendars URL. Wire all to the PATCH API.
- [x] **Client detail: contacts section** — On `/admin/clients/[slug]`, replace old single point-of-contact with a full Contacts section. Shows list of contacts with name, role, project_role, email, phone. Admin can add/edit/delete contacts inline. Use a modal or inline form. Mark one as primary.
- [x] **Client detail: assigned team section** — On `/admin/clients/[slug]`, add a "Nativz Team" section showing which team members are assigned to this account and their roles. Admin can add/remove assignments.
- [x] **Client detail: quick links** — On `/admin/clients/[slug]`, add a "Quick Links" card with buttons/links to: Google Drive Branding Assets, Google Drive Content Calendars. Only show if URLs are set.

---

## EPIC 3 — Dashboard Rework

**Goal:** Replace "Recent Searches" with unified activity feed. Add personal per-user to-do list widget. Add shoot dates.

### 3A — Database

- [x] **DB migration: create `todos` table** — Per-user to-do list:
  - `id uuid primary key`
  - `user_id uuid references auth.users(id) on delete cascade`
  - `title text not null`
  - `description text`
  - `is_completed bool default false`
  - `completed_at timestamptz`
  - `due_date date`
  - `assigned_by uuid references auth.users(id)` — who assigned it (if assigned to you by someone else)
  - `client_id uuid references clients(id)` — optional client association
  - `priority text` — `'low' | 'medium' | 'high'`
  - `created_at timestamptz default now()`
  - Enable RLS: users can only see their own todos. Admins can see/create todos for others.
  - Write migration SQL in `supabase/migrations/`.

- [x] **DB migration: create `activity_log` table** — Unified activity feed:
  - `id uuid primary key`
  - `actor_id uuid references auth.users(id)` — who did the action
  - `action text` — e.g. `'search_completed'`, `'report_approved'`, `'client_created'`, `'idea_submitted'`, `'shoot_scheduled'`
  - `entity_type text` — `'search' | 'client' | 'idea' | 'shoot' | 'report'`
  - `entity_id uuid` — ID of the related record
  - `metadata jsonb` — extra context (client name, search query, etc.)
  - `created_at timestamptz default now()`
  - Write migration SQL in `supabase/migrations/`.

### 3B — API Routes

- [x] **API: todos CRUD** — Create `/api/todos`:
  - `GET` — fetch current user's todos (filter: completed/incomplete, due today)
  - `POST` — create todo (can optionally assign to another user_id if admin)
  - `PATCH /api/todos/[id]` — update (title, completed, due_date, priority, etc.)
  - `DELETE /api/todos/[id]` — delete
  - Zod validation. Auth check.

- [x] **API: activity log** — Create `/api/activity`:
  - `GET` — fetch recent activity (last 50 events), admin sees all, viewers see their org's activity
  - Create a `lib/activity.ts` helper: `logActivity(action, entityType, entityId, metadata)` to write activity events. Call this from existing API routes for searches, approvals, client creation, invites, ideas.

### 3C — Dashboard UI

- [x] **Admin dashboard: replace Recent Searches with Recent Activity feed** — Remove the recent searches widget. Add a "Recent Activity" section that shows the last 20 activity events from `activity_log`. Each event shows: icon (based on action type), description (e.g. "Search completed for EcoView"), actor name, relative timestamp. Pull from `GET /api/activity`.
- [x] **Admin dashboard: add personal To-Do widget** — Add a "What we're working on" widget on the dashboard showing the current user's incomplete todos (sorted by due_date, then priority). Each item has a checkbox to complete it, title, optional due date badge, and priority indicator. Include a quick "Add task" inline input at the bottom. Clicking a todo opens a detail modal with full edit. Pull from `GET /api/todos`.
- [x] **Admin dashboard: add upcoming shoots widget** — Add an "Upcoming Shoots" widget on the dashboard showing the next 5 scheduled shoots from the `shoots` table (read existing `/admin/shoots` logic). Shows client name, shoot date, shoot type with a calendar icon.

---

## EPIC 4 — Team Board

**Goal:** Internal team management page — who's on the team, their roles, client assignments, assigned tasks.

- [x] **Team board page: `/admin/team`** — New page listing all active team members. Each team member card shows: avatar, name, position/role, list of clients they're assigned to (as mini badges), count of open todos assigned to them. Admin can click into a team member to see details.
- [x] **Team member detail: `/admin/team/[id]`** — Shows team member profile, their assigned clients, and all open todos assigned to them. Admin can add/remove client assignments and create new todos assigned to this person.
- [x] **Add "Team" to admin sidebar navigation** — Add a Team icon and link to `/admin/team` in the sidebar nav. Place it between Clients and Search.

---

## EPIC 5 — Shoot Scheduler (Nango + Google Calendar)

**Goal:** Build a native shoot scheduling tool inside Cortex. Uses Nango to handle Google Calendar OAuth so the team can connect once and Cortex manages everything. Admins create shoots natively in Cortex → sends Google Calendar invites to clients and team. Also syncs shoots booked in Google Calendar back into Cortex.

### 5A — Nango Setup

- [x] **Install Nango SDK and configure** — `npm install @nangohq/node`. Add env vars: `NANGO_SECRET_KEY`, `NANGO_PUBLIC_KEY`. Create `lib/nango/client.ts` that exports a configured Nango server client. Document required env vars in `.env.example`. Nango integration name should be `google-calendar`.
- [x] **Nango OAuth connect flow** — Create `/api/nango/connect` (POST) and `/api/nango/callback` (GET) API routes to initiate and handle the Google Calendar OAuth connection via Nango. Store the `connectionId` per admin user in the `users` table (add `nango_connection_id text` column via migration). Admin settings page should show a "Connect Google Calendar" button that triggers the OAuth flow and shows connected status.

### 5B — Native Shoot Scheduler

- [x] **DB migration: create `shoots` table** — Check if it already exists in `supabase/migrations/`. If not, create:
  - `id uuid primary key`
  - `title text not null` — e.g. "Brand Shoot — EcoView"
  - `client_id uuid references clients(id)`
  - `shoot_date date not null`
  - `shoot_time time`
  - `location text`
  - `notes text`
  - `google_calendar_event_id text` — for sync deduplication
  - `status text` — `'scheduled' | 'completed' | 'cancelled'`
  - `created_by uuid references auth.users(id)`
  - `created_at timestamptz default now()`
  - Write migration SQL in `supabase/migrations/`.

- [x] **API: shoots CRUD + calendar invite** — Create `/api/shoots`:
  - `GET` — list shoots with filters (client_id, date range, status)
  - `POST` — create shoot record in DB, then via Nango send a Google Calendar event invite to: client contacts (from `contacts` table where `is_primary=true`), assigned team members. Calendar event includes title, date/time, location, description. Stores `google_event_id` on the shoot record.
  - `PATCH /api/shoots/[id]` — update shoot (also updates Google Calendar event if event ID exists)
  - `DELETE /api/shoots/[id]` — cancel shoot (deletes or cancels Google Calendar event)
  - Admin only. Zod validation.

- [x] **API: `/api/shoots/sync`** — POST endpoint that reads upcoming events from Google Calendar via Nango (`google-calendar` integration), finds shoot-related events (filter by title keywords: "shoot", "film", "content day", "production"), and upserts into `shoot_events` table matching on `google_event_id`. Auto-matches client names from event titles.

- [x] **Shoot scheduler page: `/admin/shoots`** — Replace any placeholder content with a real shoot management UI:
  - List view of upcoming shoots (sorted by date) with client badge, date, location, status
  - "Schedule Shoot" button opens a modal/form: client selector, date, time, location, notes, team member multi-select
  - On submit: creates shoot in DB + fires Google Calendar invite API
  - "Sync from Google Calendar" button triggers `/api/shoots/sync`
  - Shows last sync timestamp

- [x] **Dashboard: upcoming shoots widget** — On `/admin/dashboard`, add an "Upcoming Shoots" widget showing next 5 shoots from DB. Each row: client logo + name, shoot date (formatted nicely), location. Clicking navigates to `/admin/shoots`.

---

## EPIC 6 — Task & Workflow Management (Monday Replacement)

**Goal:** Replicate Monday.com Content Calendar and Clients boards natively in Nativz Cortex.

- [x] **DB migration: create `tasks` table** — Full task management:
  - `id uuid primary key`
  - `title text not null`
  - `description text`
  - `status text` — `'backlog' | 'in_progress' | 'review' | 'done'`
  - `priority text` — `'low' | 'medium' | 'high' | 'urgent'`
  - `client_id uuid references clients(id)` — optional client association
  - `assignee_id uuid references team_members(id)` — who's doing it
  - `created_by uuid references auth.users(id)`
  - `due_date date`
  - `task_type text` — `'content' | 'shoot' | 'edit' | 'paid_media' | 'strategy' | 'other'`
  - `shoot_date date` — if this task is tied to a shoot
  - `tags text[]`
  - `created_at timestamptz default now()`
  - `updated_at timestamptz default now()`
  - Write migration SQL in `supabase/migrations/`.

- [x] **API: tasks CRUD** — Create `/api/tasks`:
  - `GET` — list tasks with filters: client_id, assignee_id, status, task_type, date range
  - `POST` — create task
  - `PATCH /api/tasks/[id]` — update (status, assignee, due_date, etc.)
  - `DELETE /api/tasks/[id]` — delete (soft delete via `archived_at`)
  - Admin only. Zod validation.

- [x] **Tasks board page: `/admin/tasks`** — Kanban-style board with 4 columns: Backlog / In Progress / Review / Done. Cards show: task title, client badge, assignee avatar, due date, priority indicator. Drag-and-drop to move between columns (use `@dnd-kit/core`). Filter bar at top: by client, by assignee, by task type.
- [x] **Content calendar page: `/admin/calendar`** — Calendar view (monthly grid) of tasks with `shoot_date` or `due_date` set. Each day cell shows task chips (colored by client). Clicking a chip opens task detail. Uses existing `/admin/calendar` route — replace placeholder content with real tasks from DB.
- [x] **Add "Calendar" to admin sidebar navigation** — Added CalendarDays icon and link to `/admin/calendar` in the sidebar nav between Tasks and Scheduler.

---

## EPIC 7 — Social Media Reporting Dashboard

**Goal:** Unified cross-platform reporting — aggregate Instagram, TikTok, Facebook, and YouTube Shorts metrics into one dashboard with cumulative summaries and top post discovery. Replaces old analytics page.

- [x] **DB migration: create `platform_snapshots` and `post_metrics` tables** — Daily aggregate snapshots + per-post performance. Migration `021_create_reporting_tables.sql`.
- [x] **TypeScript types** — `lib/types/reporting.ts` with normalized shapes for all platforms.
- [x] **Platform normalizers** — `lib/reporting/normalizers/` with Instagram, Facebook, TikTok, YouTube normalizers mapping to unified schema via Nango proxy.
- [x] **Sync service** — `lib/reporting/sync.ts` orchestrates fetching from all connected platforms and upserting to DB.
- [x] **API routes** — `POST /api/reporting/sync`, `GET /api/reporting/summary`, `GET /api/reporting/top-posts`. All with Zod validation + auth.
- [x] **Cron sync** — `GET /api/cron/sync-reporting` runs daily at 6 AM UTC via Vercel cron.
- [x] **Analytics dashboard** — Replaced `/admin/analytics` with unified reporting. Client selector, date range presets (7d/30d/MTD/YTD), pill-toggled views.
- [x] **Performance summary view** — 4 StatCards (views, followers gained, engagement, avg rate) with period-over-period change. Platform breakdown table.
- [x] **Top posts view** — Ranked post cards (top 3/5/10) with thumbnail, caption, engagement breakdown. Click to open original post.
- [x] **Sync now button** — Manual data refresh from the dashboard.

---

## Completed (Archive)

- [x] Brave Search API integration
- [x] Admin + portal dual-dashboard
- [x] Search flow (Brave → Claude → structured results)
- [x] Dual search modes (Brand intel + Topic research)
- [x] Approval system (admin approves, portal sees approved)
- [x] Role-based middleware + auth
- [x] Portal invite system
- [x] Ideas system with triage
- [x] Obsidian vault integration + sync
- [x] Monday.com webhook integration (to be replaced by EPIC 6)
- [x] Performance caching (vault, middleware, layout)
- [x] Toast notifications — fully implemented via sonner
- [x] Feature flag guards on portal — already multi-layer implemented
