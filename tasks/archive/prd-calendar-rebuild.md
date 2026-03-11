# PRD: Calendar rebuild — scheduling hub

## Introduction

Rebuild the calendar page into a scheduling hub that shows client meetings and shoots, proactively surfaces clients who are missing scheduled shoots or biweekly strategy meetings, syncs bidirectionally with Google Calendar, and routes follow-ups to the assigned strategist. The calendar should be the single source of truth for "who needs what scheduled this month."

## Goals

- Display all shoots and biweekly client meetings on a unified calendar
- Proactively alert when a client is missing their monthly shoot or next biweekly meeting
- Create shoot and meeting events that push to Google Calendar, and pull external events back into Cortex
- Route scheduling follow-ups to the strategist assigned to each client (the team member with `role = 'Strategist'` on `client_assignments`)
- Provide date-aware prompts: "It's the 1st — time to schedule shoots" and "It's the 5th — these clients still need shoots"

## User Stories

### US-001: Create meetings table
**Description:** As a developer, I need a dedicated `meetings` table so biweekly client meetings and their Google Calendar event IDs can be stored independently from tasks.

**Acceptance Criteria:**
- [x] Migration creates `meetings` table with columns: `id` (uuid PK), `client_id` (FK → clients), `title` (text), `scheduled_at` (timestamptz), `duration_minutes` (int, default 30), `location` (text — Zoom link, address, etc.), `google_event_id` (text, nullable), `recurrence_rule` (text, nullable — e.g. `RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU`), `created_by` (FK → auth.users), `attendees` (jsonb — array of `{email, name, role}`), `notes` (text), `status` (text — `'scheduled'` / `'completed'` / `'cancelled'`, default `'scheduled'`), `created_at`, `updated_at`
- [x] RLS policy: authenticated users can read/write
- [x] Index on `client_id` and `scheduled_at`
- [x] Typecheck passes

### US-002: Add Google Calendar fields to shoots table
**Description:** As a developer, I need shoots to store their Google Calendar event ID so they can sync bidirectionally.

**Acceptance Criteria:**
- [x] Migration adds `google_event_id` (text, nullable) column to the shoots table (or whatever table currently stores shoots — verify first)
- [x] Typecheck passes

### US-003: Meetings CRUD API
**Description:** As an admin, I need API routes to create, read, update, and delete meetings so the calendar UI can manage them.

**Acceptance Criteria:**
- [x] `GET /api/meetings` — list meetings with optional `client_id`, `date_from`, `date_to` filters
- [x] `POST /api/meetings` — create a meeting (Zod validated), returns the new meeting
- [x] `PATCH /api/meetings/[id]` — update a meeting
- [x] `DELETE /api/meetings/[id]` — delete a meeting
- [x] All routes check auth, validate with Zod, return proper status codes
- [x] Typecheck passes

### US-004: Google Calendar push — create events
**Description:** As an admin, when I create a shoot or meeting in Cortex, it should also create a Google Calendar event and store the `google_event_id` back.

**Acceptance Criteria:**
- [x] When a meeting is created via `POST /api/meetings`, a Google Calendar event is created via the connected user's Nango credentials
- [x] The `google_event_id` is stored on the meeting row
- [x] When a shoot is created/updated with a date, a Google Calendar event is created/updated similarly
- [x] Attendees from the meeting `attendees` field are added as Google Calendar event invitees
- [x] If the user has no Google Calendar connection, the event is created in Cortex only (no error)
- [x] Typecheck passes

### US-005: Google Calendar pull — two-way sync
**Description:** As an admin, I want meetings created or moved in Google Calendar to reflect in Cortex so the calendar stays current.

**Acceptance Criteria:**
- [x] `POST /api/calendar/sync` pulls events from connected Google Calendars for the current user
- [x] New Google Calendar events with matching `google_event_id` update the corresponding Cortex meeting/shoot
- [x] Time/date changes in Google Calendar update the Cortex record
- [x] Cancellations in Google Calendar mark the Cortex record as `'cancelled'`
- [x] Sync runs automatically when the calendar page loads (debounced, max once per 5 minutes)
- [x] Typecheck passes

### US-006: Calendar page — day view with meetings and shoots
**Description:** As an admin, I want to see all meetings and shoots for a selected day so I know the full schedule at a glance.

**Acceptance Criteria:**
- [x] Calendar page fetches both meetings and shoots for the visible date range
- [x] Meetings display with blue color coding, shoots with amber
- [x] Each event shows: title, client name, time, and the assigned strategist's name
- [x] Clicking an event opens an edit/detail view
- [x] Month view shows event chips per day; week/day views show time-positioned blocks
- [x] Typecheck passes
- [x] Verify in browser using dev-browser skill

### US-007: Proactive scheduling banners
**Description:** As an admin, I want the calendar page to show smart banners when clients are missing their monthly shoot or upcoming biweekly meeting so nothing falls through the cracks.

**Acceptance Criteria:**
- [x] On the 1st–4th of the month: banner reads "Time to schedule shoots — N clients still need their [Month] shoot" with a list of client names
- [x] On the 5th+ of the month: banner reads "These clients still need shoots this month" (more urgent tone) with client names
- [x] Clients are flagged as "needing a shoot" if they have no shoot record with `shoot_date` in the current month
- [x] A separate banner shows clients whose next biweekly meeting is not scheduled (no future meeting record exists, or the last meeting was >16 days ago with no next one)
- [x] Each client name in the banner links to a quick-create action pre-filled with that client
- [x] Banners are dismissible per-session (come back on page reload)
- [x] Typecheck passes
- [x] Verify in browser using dev-browser skill

### US-008: Strategist follow-up routing
**Description:** As an admin, I want banners and scheduling prompts to show which strategist is responsible for each client so follow-ups go to the right person.

**Acceptance Criteria:**
- [x] Each client in the "needs shoot" / "needs meeting" banner shows the assigned strategist name (from `client_assignments` where `role = 'Strategist'`)
- [x] If no strategist is assigned, show "Unassigned" in a warning style
- [x] Strategist name is a visual badge/tag next to the client name
- [x] Typecheck passes
- [x] Verify in browser using dev-browser skill

### US-009: Quick-create meeting with recurrence
**Description:** As an admin, I want to create a biweekly meeting from the calendar that automatically sets up the recurring schedule so I don't have to create each one manually.

**Acceptance Criteria:**
- [x] "New meeting" form includes a recurrence toggle: None / Weekly / Biweekly / Monthly
- [x] When biweekly is selected, the system creates the initial meeting and stores the `recurrence_rule`
- [x] The calendar displays future occurrences of recurring meetings (computed from the rule, not stored as individual rows)
- [x] Editing a single occurrence asks: "This event only" or "All future events"
- [x] Google Calendar event is created with matching recurrence rule (RRULE)
- [x] Typecheck passes
- [x] Verify in browser using dev-browser skill

### US-010: Quick-create shoot from banner
**Description:** As an admin, I want to click a client name in the "needs shoot" banner and immediately open a shoot creation form pre-filled with that client so scheduling is fast.

**Acceptance Criteria:**
- [x] Clicking a client in the banner opens the quick-create popover/modal
- [x] Client is pre-selected, event type is pre-set to "Shoot"
- [x] Date defaults to next available weekday
- [x] Saving creates the shoot record and pushes to Google Calendar
- [x] After saving, the client disappears from the "needs shoot" banner without page reload
- [x] Typecheck passes
- [x] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: Create `meetings` table with fields for scheduling, recurrence, Google Calendar sync, and attendees
- FR-2: Add `google_event_id` to shoots table for bidirectional sync
- FR-3: CRUD API for meetings at `/api/meetings` and `/api/meetings/[id]`
- FR-4: When creating/updating a meeting or shoot, push to Google Calendar via Nango if the user has a connection
- FR-5: Pull changes from Google Calendar on page load (debounced to max once per 5 minutes)
- FR-6: Calendar page displays both meetings (blue) and shoots (amber) with client name and strategist
- FR-7: Smart banners on calendar page: "time to schedule shoots" (1st–4th) and "clients still need shoots" (5th+)
- FR-8: Smart banner for clients missing their next biweekly meeting
- FR-9: Each banner entry shows the assigned strategist (role = 'Strategist' from `client_assignments`)
- FR-10: Quick-create from banner pre-fills client and event type
- FR-11: Meeting creation supports recurrence rules (None / Weekly / Biweekly / Monthly) stored as RRULE
- FR-12: Recurring meetings render as computed future occurrences on the calendar (not individual DB rows)
- FR-13: Google Calendar events include attendees from meeting `attendees` field

## Non-goals

- No email/Slack notifications for scheduling reminders (banners on calendar page only, per 2A)
- No auto-scheduling — the system surfaces what's missing, humans schedule it
- No client portal view of the calendar (admin only)
- No integration with calendars other than Google (no Outlook, Apple Calendar)
- No meeting notes/transcript features
- No billing or time tracking tied to meetings

## Design considerations

- Reuse existing calendar components: `TimeGrid`, `MonthGrid`, `AgendaView`, `CalendarHeader`
- Banners should sit above the calendar grid, styled as dismissible alert bars (amber for shoots, blue for meetings)
- Strategist badges should use the existing `PERSON_COLORS` palette
- Quick-create popover already exists (`components/calendar/quick-create.tsx`) — extend it for meetings with recurrence
- Keep the existing layer toggle system (shoot/meeting/task) for filtering

## Technical considerations

- **Existing infrastructure:** `team_members`, `client_assignments`, `calendar_connections` tables already exist. `client_assignments.role` stores the strategist assignment. Nango OAuth flow is already built.
- **Google Calendar API:** Use Nango's Google Calendar integration for creating/updating/deleting events. Store `google_event_id` on both meetings and shoots for bidirectional mapping.
- **Recurrence:** Store RRULE string on the meeting row. Compute future occurrences client-side (using a library like `rrule` or manual date math for simple biweekly patterns). Don't store individual occurrences as rows.
- **Sync strategy:** On calendar page load, call `/api/calendar/sync` (debounced). This fetches recent changes from Google Calendar and updates Cortex records. Use `google_event_id` as the join key.
- **Banner logic:** Query shoots and meetings for the current month. Compare against active clients list. Clients with no shoot this month = "needs shoot." Clients with no future meeting and last meeting >16 days ago = "needs meeting." Join with `client_assignments` to get strategist name.
- **Existing shoots table:** Check the actual column structure before adding `google_event_id` — the shoots table may already have fields that need consideration.

## Success metrics

- Every active client has a shoot scheduled by the 5th of each month
- Every active client has a biweekly meeting on the calendar at all times
- Zero "forgotten" clients — the banner catches any gaps
- Shoots and meetings created in Cortex appear in Google Calendar within seconds
- Changes made in Google Calendar reflect in Cortex within 5 minutes

## Open questions

- Should completed/past meetings be visible on the calendar or hidden by default?
- What's the meeting duration default — 30 minutes? 60?
- Should the recurrence computation show occurrences for the next 2 months? 3? 6?
- Do we need to handle Google Calendar event conflicts (e.g. double-booking a time slot)?
- Should the "needs shoot" logic account for cancelled shoots (treat as still needing one)?
