# Project Management — design spec

**Date:** 2026-04-25
**Owner:** Jack
**Goal:** Replace monday.com for production project management. Combine the existing **Edits**, **Shoots**, and **Tasks** surfaces into one `/admin/projects` page backed by a single unified data model.

---

## Audit — current state

| Surface | UI | API | DB | Verdict |
|---------|----|----|-----|---------|
| **Tasks** | `/admin/tasks` fully built (Today / Upcoming / All views, calendar, detail panel, Todoist sync) | `/api/tasks/*` + `/api/v1/tasks/*` — Zod, auth, soft-delete, activity log | `tasks` table (migration 015) — full schema, indexes, RLS | ✅ Healthy. Single silent-failure: Todoist sync errors are swallowed. |
| **Shoots** | `/admin/shoots` renders; depends on Monday.com Content Calendar API + queries `shoot_events` | `/api/shoots/*` (auth ✅, Zod ✅) — but reads/writes `shoot_events` | ❌ `shoot_events` is queried by 9+ files, **never created in any migration**. | ⚠️ Broken. Page will fail at runtime once the local-cached Monday.com data is gone. |
| **Edits** | Sidebar link to `/admin/edits` exists; **no page file**, no API, no table. | None. | None. (Only the `'edit'` value in `tasks.task_type` enum.) | ❌ Doesn't exist. |

**Other findings:**
- `tasks.task_type` enum already supports `task | content | shoot | edit | paid_media | strategy | other` — the foundation for unification has been in the schema since migration 015.
- Tasks integrates with Todoist; Shoots integrates with Google Calendar (OAuth, attendees) + Monday.com (read-only Content Calendar mirror).
- Reusable building blocks already in repo: `components/pipeline/` (kanban + filters, native HTML5 DnD), `@dnd-kit` (in research history-dnd), `components/tasks/calendar-view.tsx`, notification bell with shoot/task event types, activity feed.

---

## Recommendation: tasks-as-work-items

Promote `tasks` to the unified work_items table. Add type-specific columns additively. Build one page `/admin/projects` with Board / Table / Calendar views, filterable by type. Detail panel adapts per type.

### Why not separate tables (`shoots`, `edits`, `tasks`)?

- `tasks` already has the right shape: client/assignee/status/priority/due_date/tags + activity log + soft-delete + Todoist hook.
- A polymorphic super-table over three real tables would mean three sets of CRUD endpoints, three sets of indexes, three sets of RLS, three sets of UI components. Tasks-as-work-items is one.
- We already partially-committed to this in migration 015 (the `task_type` enum). Continuing that direction is the lower-risk play.

### Why not just fix `shoot_events`?

- We'd still have nothing for edits.
- We'd have to maintain task↔shoot synchronization (assignment, due dates, activity log).
- The shoot UI's needs are a strict superset of task fields, not a different shape.

---

## Data model — additive migration

New migration: `163_project_management_unified.sql`. **Additive only** — no DROPs, no column renames. Existing `/api/tasks/*` keeps working unchanged.

```sql
-- Shoot-specific columns
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS shoot_location TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS shoot_start_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS shoot_end_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS shoot_notes TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS google_event_id TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS google_calendar_event_created BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS invitees JSONB DEFAULT '[]'::jsonb;

-- Edit-specific columns
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS edit_status TEXT
  CHECK (edit_status IN ('not_started','in_edit','review','revisions','approved','delivered'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS edit_revision_count INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS edit_source_url TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS edit_deliverable_url TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS edit_due_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_shoot_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
  -- Optional: link an edit row to its source shoot row.

-- Generic project-management columns
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tasks_shoot_start ON tasks(shoot_start_at) WHERE shoot_start_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_edit_status ON tasks(edit_status) WHERE edit_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_parent_shoot ON tasks(parent_shoot_id) WHERE parent_shoot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_sort ON tasks(sort_order);
```

Notification + activity-log tables (`notifications`, `task_activity`) are reused as-is. Notification `type` enum gains `'edit_status_changed'` and `'shoot_rescheduled'` (the existing migration uses a CHECK constraint — we extend it).

---

## API surface

| Route | Action |
|-------|--------|
| `/api/tasks/*` | **Canonical surface.** Stays unchanged; adds support for the new fields in the Zod schemas + PATCH handler. |
| `/api/projects` (new) | `GET` only — convenience aggregation endpoint that returns tasks shaped for the new page (joins client + assignee in one query). Returns the same rows as `/api/tasks` but with eager-loaded relations and type-aware shaping. |
| `/api/shoots/*` | **Deprecated** in phase 6. During transition: queries proxy to `tasks` filtered by `task_type='shoot'`. The Google Calendar OAuth side-effects move into `/api/tasks` POST/PATCH when `task_type='shoot'`. |
| `/api/shoots/content-calendar` | **Kept.** This isn't shoots — it reads the Monday.com **content** board (videos to publish). Will be repurposed in a future content-calendar feature. |

---

## UI — `/admin/projects`

### Layout

```
─────────────────────────────────────────────────────────────
[ All ▾ ] [ Tasks ] [ Shoots ] [ Edits ]    [ + New ▾ ]
[ Client filter ] [ Assignee filter ] [ Status filter ] [ Search ]
[ Board ] [ Table ] [ Calendar ] [ Timeline ]
─────────────────────────────────────────────────────────────
< view content >
```

- **Type pills** at the top: `All | Tasks | Shoots | Edits` (also exposes Content / Strategy / Paid Media via overflow). Drives the `task_type` filter.
- **View switcher** below: Board / Table / Calendar / Timeline.
- **Filters** (client / assignee / status / search) persist via URL params so views are shareable.
- **`+ New` dropdown**: New task / New shoot / New edit — all hit `POST /api/tasks` with the right `task_type`.
- **Detail panel** (right slide-over) adapts to type:
  - **Task** — current task panel (description, due date, Todoist, activity).
  - **Shoot** — task fields + location, start/end time, talent (invitees), Google Calendar status.
  - **Edit** — task fields + edit_status pipeline pill, revision count, source URL, deliverable URL, optional link to parent shoot.

### Views

| View | Behaviour |
|------|-----------|
| **Board** | Kanban; columns = status (`backlog / in_progress / review / done`) for tasks/edits; for shoots, columns swap to `pending / scheduled / completed / cancelled`. Drag updates status (or `edit_status` if filtered to edits). Built on existing `components/pipeline/pipeline-board.tsx` patterns; upgrade to `@dnd-kit` for cross-column moves. |
| **Table** | Dense list with sortable columns, inline status pills, assignee avatars. Default for power users. |
| **Calendar** | Month grid. Tasks plot on `due_date`; shoots plot on `shoot_start_at`; edits plot on `edit_due_at`. Color-coded by type. Reuse `components/tasks/calendar-view.tsx`. |
| **Timeline** | Gantt-lite — horizontal lanes per assignee, bars from `started_at` → `completed_at` (or due date if not yet started). Phase 4 (deferred). |

### Sidebar

`components/layout/admin-sidebar.tsx` — replace three separate links (Edits / Shoots / Tasks) with one **Project Management** link. Keep `/admin/tasks`, `/admin/shoots`, `/admin/edits` as redirects to `/admin/projects?type=…` for muscle memory.

---

## Phasing

| Phase | Scope | Risk |
|-------|-------|------|
| **0** | Spec + audit doc committed (this file). | None |
| **1** | Migration 163 (additive columns + indexes). Update `/api/tasks` POST/PATCH Zod schemas to accept new fields. Backward compat: existing payloads still validate. | Low (additive) |
| **2** | New `/admin/projects` page. Table view + type pills + filters. Reads `/api/tasks?include=client,assignee`. **Read-only first** — no edit. | Low |
| **3** | Board view (kanban). Drag-to-reorder + drag-to-restatus. `@dnd-kit`. | Medium |
| **4** | Calendar view. Migrate from `components/tasks/calendar-view.tsx`. | Low |
| **5** | Type-aware detail panels (task / shoot / edit). New shoot/edit POST flows wire Google Calendar invite for shoots and revision tracking for edits. | Medium |
| **6** | Sidebar swap. Redirect `/admin/{tasks,shoots,edits}` → `/admin/projects`. Deprecate `/api/shoots/route.ts` (proxy or delete after grep confirms no callers). | Medium |
| **7** | Verify: `npx tsc --noEmit`, `npm run lint`, e2e routes spec, manual smoke: create one task, one shoot (with Google Calendar invite), one edit; reschedule via Board; switch all four views. | Low |
| **8 (deferred)** | Timeline view. Notification subscriptions (in-app + email) for shoot rescheduled / edit status changes. Portal read-only view for clients. | Medium |

---

## Open questions

1. **Monday.com content-calendar dependency** — `/api/shoots/content-calendar` currently mirrors a Monday board into the shoots page. After this change, that data has nowhere to surface unless we fold "content/post calendar" into Project Management as a separate type. **Decision: defer** — keep the route, but the new page does not import it. Future content-calendar work can repurpose it.
2. **Portal exposure** — should clients see a read-only Project Management view? Probably yes for shoots (so they know when crew is arriving). **Decision: phase 8 / not in scope here.**
3. **Notifications taxonomy** — adding `'edit_status_changed'` requires extending the CHECK constraint in `notifications.type`. Cheap, but list it.
4. **Activity feed event types** — the dashboard activity feed already understands `shoot_scheduled / shoot_completed`; we'll add `edit_status_changed`. Same migration as #3.

---

## Acceptance criteria

- `/admin/projects` renders with all four type pills and three working views (Board / Table / Calendar).
- Creating a shoot from the new page creates a `tasks` row with `task_type='shoot'` and (when Google is connected) sends a calendar invite to client primary contacts + assigned team members. Parity with the old `/api/shoots` POST.
- Creating an edit from the new page creates a `tasks` row with `task_type='edit'`, `edit_status='not_started'`, and the new `edit_*` fields populated.
- The deprecated `/admin/{tasks,shoots,edits}` routes 308-redirect to `/admin/projects`.
- `npx tsc --noEmit` and `npm run lint` pass clean. E2E redirect spec covers the redirects.
- Sidebar shows one **Project Management** link in the Manage section.
- The dead `shoot_events` table reference no longer matters: nothing in the codebase queries it after phase 6 (verified via grep).
