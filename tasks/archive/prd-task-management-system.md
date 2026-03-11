# PRD: Integrated Task Management System

## Introduction

Build a comprehensive task management system that combines Todoist-style personal productivity with Monday.com project awareness. The system lets the Nativz team capture tasks instantly with natural language, see what's coming from Monday.com content pipelines, and manage their day across multiple views — all without leaving Cortex.

Monday.com remains the source of truth for content production pipelines and client data. Cortex tasks are their own system: personal to-dos, team assignments, and one-click imports from Monday suggestions. This gives the team speed and flexibility that Monday alone can't provide, while keeping Monday as the operational backbone.

## Goals

- Replace the need for a separate Todoist/task app — everything lives in Cortex
- Surface Monday.com pipeline items as actionable task suggestions (one-click import)
- Enable instant task capture via natural language parsing (AI-powered)
- Provide Today / Upcoming / Calendar / Kanban views for different working styles
- Support task assignment across the team with notifications
- Tag tasks to clients for cross-referencing with client profiles
- Reduce context-switching between Monday.com and day-to-day task management

## User Stories

### US-001: Natural language quick-add bar
**Description:** As a team member, I want to type a task in plain English so that the system auto-parses the title, date, client, and assignee without me filling out a form.

**Acceptance Criteria:**
- [ ] Text input at top of tasks page with placeholder "Add a task... (e.g. Edit Rana videos by Friday)"
- [ ] AI parses input and extracts: title, due_date, client (fuzzy-matched), assignee (fuzzy-matched), priority
- [ ] Parsed fields shown as editable chips/tags below input before confirming
- [ ] Press Enter to confirm, Escape to cancel
- [ ] Examples that must work:
  - "Work on Rana today" → title: "Work on Rana", due: today, client: Rana
  - "Schedule Toastique shoot next Thursday" → title: "Schedule shoot", due: next Thu, client: Toastique, type: shoot
  - "Review edits for AC clients urgent" → title: "Review edits for AC clients", priority: urgent
- [ ] Fallback: if AI can't parse, treat entire input as title with no extras
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-002: Global command bar (Cmd+K)
**Description:** As a team member, I want to press Cmd+K from anywhere in Cortex to quickly add a task without navigating to the tasks page.

**Acceptance Criteria:**
- [ ] Cmd+K (Mac) / Ctrl+K (Windows) opens modal overlay from any admin page
- [ ] Same natural language input as US-001
- [ ] Modal shows parsed preview, Enter to save, Escape to close
- [ ] After saving, toast notification confirms with task title and due date
- [ ] Does not conflict with browser's native Cmd+K (if any)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-003: Today view
**Description:** As a team member, I want a "Today" view showing tasks due today and overdue tasks so I can focus on what needs attention right now.

**Acceptance Criteria:**
- [ ] Default landing view on `/admin/tasks` page
- [ ] Sections: "Overdue" (red header), "Today" (blue header), "No date" (gray header, collapsed by default)
- [ ] Each task shows: checkbox, title, client tag, priority dot, assignee avatar, due date
- [ ] Clicking checkbox marks task as done with strikethrough animation, moves to bottom "Completed today" section
- [ ] Tasks sorted by priority within each section (urgent → high → medium → low)
- [ ] Empty state: "All caught up! No tasks for today." with illustration
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-004: Upcoming view
**Description:** As a team member, I want an "Upcoming" view showing tasks scheduled for the next 7+ days so I can plan ahead.

**Acceptance Criteria:**
- [ ] Tab/toggle to switch between Today and Upcoming views
- [ ] Groups tasks by day: "Tomorrow", "Wednesday", "Thursday", etc. then by week
- [ ] Shows task count per day in section header
- [ ] Drag-and-drop to reschedule tasks between days
- [ ] Tasks without due dates shown at bottom in "Someday" section
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Enhanced Kanban board
**Description:** As a team member, I want the existing Kanban board enhanced with the new task features (quick-add, client tags, etc.).

**Acceptance Criteria:**
- [ ] Existing Kanban columns preserved: Backlog → In Progress → Review → Done
- [ ] Quick-add bar at top of each column (type and press Enter to add to that column)
- [ ] Task cards show: title, client tag, priority dot, assignee, due date, Monday.com icon if imported
- [ ] Drag-and-drop between columns updates status
- [ ] Filter bar: by client, assignee, type, priority, date range
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-006: Calendar view
**Description:** As a team member, I want a calendar view showing tasks alongside shoots and content deadlines so I can see my full schedule.

**Acceptance Criteria:**
- [ ] Monthly calendar grid with tasks shown as colored dots/chips on their due dates
- [ ] Color coding: by client (using existing deterministic client colors)
- [ ] Click a day to see all tasks for that day in a side panel
- [ ] Drag tasks between days to reschedule
- [ ] Toggle to overlay shoot dates from the shoots system
- [ ] Week view option for denser daily detail
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-007: Task detail panel
**Description:** As a team member, I want to click a task to see and edit its full details in a slide-out panel.

**Acceptance Criteria:**
- [ ] Slide-out panel from right side (similar to existing patterns in the app)
- [ ] Editable fields: title, description (rich text with markdown), status, priority, client, assignee, due date, task type, tags
- [ ] Description supports markdown with preview
- [ ] Client field is a searchable dropdown populated from Supabase clients table
- [ ] Assignee field is a searchable dropdown populated from team_members table
- [ ] Activity log at bottom showing status changes and edits (read-only)
- [ ] Delete button with confirmation dialog
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-008: Monday.com suggestion panel
**Description:** As a team member, I want to see Monday.com pipeline items as suggested tasks so I can quickly pull relevant work into my task list.

**Acceptance Criteria:**
- [ ] "Suggestions" panel/tab on the tasks page showing items from Monday.com boards
- [ ] Sources: Content Calendars (items needing action), Content Requests, Blog Pipeline
- [ ] Each suggestion shows: item name, client, board source, status, relevant dates
- [ ] "Add to tasks" button on each suggestion → creates a Cortex task pre-filled with Monday data
- [ ] Imported tasks have a `monday_item_id` field linking back to the source
- [ ] Smart filtering: only show items that need attention (e.g., RAWs uploaded but no editor assigned, edits due soon)
- [ ] Suggestion items that have already been imported show "Already added" indicator
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-009: Task assignment and team visibility
**Description:** As a team member, I want to assign tasks to colleagues and see what everyone is working on.

**Acceptance Criteria:**
- [ ] Assignee picker shows team members with avatars, name, and role
- [ ] "Assigned to me" filter shows only my tasks
- [ ] "Team" filter shows tasks grouped by assignee
- [ ] Assigning a task creates an in-app notification for the assignee (stored in DB)
- [ ] Unassigned tasks visible to everyone
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-010: Task notifications system
**Description:** As a team member, I want to receive notifications when tasks are assigned to me, due soon, or overdue.

**Acceptance Criteria:**
- [ ] Notification bell icon in the admin header with unread count badge
- [ ] Notification types: task assigned, task due tomorrow, task overdue, task completed (if you assigned it)
- [ ] Click notification → navigates to the task
- [ ] Mark as read / mark all as read
- [ ] Notifications stored in `notifications` table with `user_id`, `type`, `task_id`, `read`, `created_at`
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-011: Client tagging in tasks
**Description:** As a team member, I want to tag client names in tasks so I can filter and see all tasks related to a specific client.

**Acceptance Criteria:**
- [ ] Client field on tasks links to the clients table via `client_id` FK (already exists)
- [ ] Client tag shown as a colored badge on task cards (using deterministic color)
- [ ] Clicking client tag filters task list to that client
- [ ] Client profile page shows a "Tasks" tab listing all tasks for that client
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-012: Database schema updates
**Description:** As a developer, I need to update the database schema to support new task features.

**Acceptance Criteria:**
- [ ] Add `monday_item_id` (TEXT, nullable) to tasks table for Monday.com link tracking
- [ ] Add `monday_board_id` (TEXT, nullable) to tasks table
- [ ] Create `notifications` table: id, user_id, type, title, message, task_id (FK), read (bool), created_at
- [ ] Create `task_activity` table: id, task_id (FK), user_id, action (text), details (jsonb), created_at
- [ ] Add indexes on new columns
- [ ] Migration runs successfully
- [ ] Typecheck passes

### US-013: API routes for new features
**Description:** As a developer, I need API routes for notifications, task activity, and Monday suggestions.

**Acceptance Criteria:**
- [ ] `GET /api/notifications` — list notifications for current user, newest first
- [ ] `PATCH /api/notifications/[id]` — mark notification as read
- [ ] `POST /api/notifications/mark-all-read` — mark all as read for current user
- [ ] `GET /api/tasks/[id]/activity` — get activity log for a task
- [ ] `GET /api/tasks/suggestions` — fetch Monday.com items that need attention, filtered by already-imported
- [ ] `POST /api/tasks/parse` — send natural language input, return parsed task fields via AI
- [ ] All routes use Zod validation and auth checks
- [ ] Typecheck passes

## Functional Requirements

- FR-1: Natural language task parser using Claude API — extracts title, due_date, client, assignee, priority, task_type from free text input
- FR-2: Cmd+K global command bar available on all `/admin/*` pages
- FR-3: Today view shows overdue + today's tasks, sorted by priority
- FR-4: Upcoming view groups tasks by day for the next 14 days
- FR-5: Calendar view displays tasks on a monthly/weekly grid with drag-to-reschedule
- FR-6: Kanban board (existing) enhanced with quick-add per column and new task card design
- FR-7: Task detail panel slides out from right with full edit capabilities and activity log
- FR-8: Monday.com suggestion panel fetches items from Content Calendars, Content Requests, and Blog Pipeline boards
- FR-9: One-click import from Monday suggestion creates a Cortex task with `monday_item_id` link
- FR-10: Smart suggestion filtering — only shows Monday items that need action (status-based rules)
- FR-11: Task assignment with team member picker and in-app notifications
- FR-12: Notification bell in admin header with unread count
- FR-13: Client tagging on tasks with colored badges and cross-reference to client profiles
- FR-14: Task activity log tracks all changes (status, assignee, priority, etc.)
- FR-15: Checkbox completion with animation — completed tasks move to bottom of list
- FR-16: All task views share common filter bar (client, assignee, type, priority, date range)

## Non-Goals

- No real-time collaboration (no live cursors, no simultaneous editing)
- No two-way sync back to Monday.com (Cortex reads from Monday, doesn't write)
- No recurring/repeating tasks (v1)
- No subtasks or task dependencies (v1)
- No time tracking or time estimates
- No mobile app (responsive web only)
- No email notifications (in-app only for v1)
- No replacing Monday.com for content production pipeline management — Monday stays as operational backbone
- No client-facing task views (admin-only for v1)

## Design Considerations

- Follow existing dark theme: `bg-surface` cards on `bg-background`, blue accent
- Task cards should be compact — prioritize scanability over detail
- Quick-add bar should feel as fast as Todoist — no loading spinners for the input itself
- Suggestion panel should feel like a helpful assistant, not a mandatory inbox
- Reuse existing components: slide-out panels, filter bars, client color badges, avatar circles
- Sentence case everywhere per project convention
- Command bar (Cmd+K) should have a polished feel — backdrop blur, centered modal, search-style input

## Technical Considerations

- Natural language parsing: POST to `/api/tasks/parse` which calls Claude Sonnet via OpenRouter with a structured prompt returning JSON
- Monday.com API: Use existing `lib/monday/client.ts` — extend with functions for Content Requests and Blog Pipeline boards
- Notifications: Simple DB table with polling (fetch on page load + every 60s) — no WebSockets needed for v1
- Activity log: Insert on every task update via the PATCH endpoint — no separate service needed
- Calendar view: Use existing Recharts patterns or a lightweight calendar grid (CSS Grid) — avoid heavy calendar libraries
- Cmd+K: React portal rendered at layout level, listens for keyboard shortcut globally
- Task views share a common data hook (like `use-scheduler-data.ts` pattern) for consistency
- Monday suggestion smart filtering rules:
  - Content Calendars: show items where `editing_status` ≠ "Done" AND has a shoot date within 30 days
  - Content Requests: show items where `status` ≠ "Done"
  - Blog Pipeline: show items where `month_status` ≠ "Complete"

## Success Metrics

- Team can capture a task in under 3 seconds via quick-add
- Monday.com suggestions surface actionable items without manual checking
- All team members use Cortex tasks as their primary daily task list within 2 weeks
- Zero tasks fall through the cracks — overdue notifications catch everything
- Client profile pages show complete task history for accountability

## Open Questions

- Should the notification polling interval be configurable or is 60s fine?
- Do we want keyboard shortcuts for task status changes (e.g., `x` to complete, `p` to change priority)?
- Should completed tasks auto-archive after N days or stay visible indefinitely?
- Future v2: Should we add a "My Day" drag-to-plan view (like Microsoft To-Do)?
