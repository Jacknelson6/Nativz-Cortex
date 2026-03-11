# PRD: UX Polish Batch — Task Assignment, Pipeline Views, Auto-Scheduler, Moodboard Chat, Team Modals

## Introduction

Five targeted improvements across Nativz Cortex to close workflow gaps and improve daily usability. Covers: (1) full task reassignment with notifications, (2) pipeline alternate views including Kanban and timeline, (3) auto-scheduler smart frequency defaults, (4) moodboard AI chat that includes website and video content automatically, and (5) team page restructured with modal-only detail views.

## Goals

- Allow task assignment/reassignment with real-time notification to the assignee
- Give the pipeline page alternate views (Kanban, timeline) so different roles can consume it naturally
- Remove manual "posts per week" input from auto-scheduler — calculate it automatically from media count and date range
- Make moodboard AI chat include all videos automatically and support chatting with scraped website content
- Replace team member detail pages with inline modals for faster navigation

---

## Feature 1: Task Assignment with Notifications

### US-1.1: Assignee picker on task cards and detail panel
**Description:** As a team lead, I want to assign or reassign a task to any team member so work is clearly owned.

**Acceptance Criteria:**
- [ ] Task detail panel (`components/tasks/task-detail-panel.tsx`) shows an assignee dropdown populated from `team_members` table
- [ ] Clicking the assignee area on a Kanban card opens the same picker inline
- [ ] Selecting a team member fires `PATCH /api/tasks/[id]` with `assignee_id`
- [ ] Unassigned tasks show a ghost avatar with "Assign" label
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-1.2: Assign tasks from team member profiles
**Description:** As an admin, I want to assign new tasks directly from a team member's profile modal so I don't have to navigate away.

**Acceptance Criteria:**
- [ ] Team member modal (see Feature 5) includes an "Assign task" button
- [ ] Opens a mini task-create form pre-filled with that team member as assignee
- [ ] Created task appears in the tasks board immediately
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-1.3: Notification on task assignment
**Description:** As a team member, I want to be notified when a task is assigned to me so nothing falls through the cracks.

**Acceptance Criteria:**
- [ ] When `assignee_id` changes on a task, create a notification via existing `notifications` table
- [ ] Notification text: "[Assigner name] assigned you: [task title]"
- [ ] Notification links to `/admin/tasks` (or opens task detail)
- [ ] Notification bell (`components/layout/notification-bell.tsx`) shows the new notification in real-time
- [ ] Reassignment also notifies the new assignee (previous assignee gets no notification)
- [ ] Typecheck passes

### US-1.4: Filter tasks by assignee
**Description:** As a team lead, I want to filter the tasks board by assignee so I can review one person's workload.

**Acceptance Criteria:**
- [ ] Tasks board filter bar includes an "Assignee" dropdown with all team members + "Unassigned"
- [ ] Filter persists in URL search params
- [ ] Kanban columns only show matching tasks when filtered
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

## Feature 2: Pipeline Alternate Views

### US-2.1: View switcher in pipeline header
**Description:** As a user, I want to switch between Table, Kanban, and Timeline views of the pipeline so I can pick what works for my role.

**Acceptance Criteria:**
- [ ] Pipeline header gets a segmented control: Table | Kanban | Timeline
- [ ] Active view persists in URL params (`?view=table|kanban|timeline`)
- [ ] Default view is Table (current behavior)
- [ ] View preference persists across page navigations within the session
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-2.2: Pipeline Kanban view
**Description:** As an editing manager, I want to see pipeline items as cards in columns by editing status so I can track progress at a glance.

**Acceptance Criteria:**
- [ ] Kanban columns based on `editing_status`: Not started | Editing | Edited | EM approved | Revising | Blocked | Scheduled | Done
- [ ] Each card shows: client name, agency badge, assigned editor name, shoot date
- [ ] Cards are color-coded by their overall progress (how many statuses are complete)
- [ ] Drag-and-drop between columns updates `editing_status` via `PATCH /api/pipeline/[id]`
- [ ] Month navigation still works (same as table view)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-2.3: Pipeline Timeline view
**Description:** As a strategist, I want a timeline/Gantt view showing shoot dates, strategy due dates, and SMM due dates so I can see the month's schedule visually.

**Acceptance Criteria:**
- [ ] Horizontal timeline spanning the selected month
- [ ] Each client is a row with date markers for: shoot_date, strategy_due_date, raws_due_date, smm_due_date, calendar_sent_date
- [ ] Date markers are colored dots/bars with tooltips showing the date and status
- [ ] Clients sorted by earliest date
- [ ] Clicking a client row opens an inline detail or scrolls to it in table view
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-2.4: Pipeline is fully editable by Jack Nelson
**Description:** As Jack Nelson (super-admin), I want to modify all pipeline fields inline regardless of the view.

**Acceptance Criteria:**
- [ ] All status pills, person cells, date fields, and link fields remain editable in all views
- [ ] No role-based restrictions on pipeline editing (all admins can edit)
- [ ] Add client and delete client actions available in all views
- [ ] Typecheck passes

---

## Feature 3: Auto-Scheduler Smart Frequency

### US-3.1: Auto-calculate posts per week
**Description:** As a scheduler, I want the auto-scheduler to figure out the ideal posting frequency automatically based on media count and date range, so I don't have to do the math.

**Acceptance Criteria:**
- [ ] Remove the manual "Posts per week" dropdown from `AutoScheduleDialog`
- [ ] Calculate automatically: `posts_per_week = ceil(selected_media_count / weeks_in_range)`
- [ ] `weeks_in_range = max(1, (end_date - start_date) / 7)`
- [ ] Cap at 7 posts/week maximum (one per day)
- [ ] Display the calculated frequency in the summary section: "X videos across Y weeks = Z posts/week"
- [ ] If calculated frequency exceeds 2 posts/day, show a warning: "High volume — consider extending the date range"
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-3.2: Allow manual override
**Description:** As a power user, I want to override the auto-calculated frequency if I know better.

**Acceptance Criteria:**
- [ ] Show calculated value as a pre-filled but editable field (number input, not dropdown)
- [ ] Label: "Posts per week (auto-calculated)" with a small edit icon
- [ ] Editing the field switches label to "Posts per week (custom)"
- [ ] Summary updates in real-time as the value changes
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

## Feature 4: Moodboard Chat — Websites + Auto-Include Videos

### US-4.1: Auto-include all videos in chat context
**Description:** As a strategist, I want all videos on the board automatically included in chat context so I don't have to manually connect each one.

**Acceptance Criteria:**
- [ ] Remove the "connected items" picker UI from `AiChatPanel`
- [ ] Remove the `connectedItemIds` prop and `onConnectedItemsChange` callback
- [ ] All video-type items on the board are automatically included in every chat request
- [ ] Display a read-only indicator: "Chatting with X videos" (not clickable/editable)
- [ ] Notes are included as supplementary context (categories/labels), not primary content
- [ ] API payload always sends all video item IDs from the board
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-4.2: Scrape website content for chat context
**Description:** As a strategist, I want to chat about websites added to the board (not just videos) so I can analyze landing pages, competitor sites, and reference material.

**Acceptance Criteria:**
- [ ] When a website-type item is on the board, scrape its content server-side (title, meta description, main body text, headings)
- [ ] Store scraped content on the moodboard item record (new `scraped_content text` column or in `metadata jsonb`)
- [ ] Scraping happens once when the website item is added to the board (or on first chat if not yet scraped)
- [ ] Scraped content is included in the AI chat context alongside video data
- [ ] Maximum scrape size: 10,000 characters (truncate with "...content truncated" note)
- [ ] Handle scrape failures gracefully — still include URL and any metadata available
- [ ] Typecheck passes

### US-4.3: Chat context includes both websites and videos
**Description:** As a user, I want to ask questions that reference both video transcripts and website content in the same conversation.

**Acceptance Criteria:**
- [ ] `buildItemContext()` in `/api/moodboard/chat/route.ts` handles website items with scraped content
- [ ] Website context format: title, URL, meta description, key headings, body excerpt
- [ ] System prompt updated to mention website analysis capability
- [ ] Chat indicator shows "Chatting with X videos and Y websites"
- [ ] Notes still included as supplementary context for categorization
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

## Feature 5: Team Page — Modal-Only Detail Views

### US-5.1: Replace team detail page with modal
**Description:** As an admin, I want to click a team member card and see their details in a modal so I stay on the team page.

**Acceptance Criteria:**
- [ ] Clicking a team member card in `TeamGrid` opens a detail modal instead of navigating to `/admin/team/[id]`
- [ ] Modal shows: avatar, full name, email, role, list of assigned clients, open todos/tasks count
- [ ] Modal has edit capability for name, email, role, avatar URL
- [ ] Modal has "Assigned clients" section with add/remove client assignment
- [ ] Modal has "Open tasks" section showing tasks assigned to this person
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-5.2: Delete team detail page route
**Description:** As a developer, I want to remove the now-unused detail page to keep the codebase clean.

**Acceptance Criteria:**
- [ ] Delete `/admin/team/[id]/page.tsx` (and any related components only used by that page)
- [ ] Remove any `<Link href="/admin/team/[id]">` references
- [ ] Ensure no dead links remain in the app
- [ ] Typecheck passes

### US-5.3: Improve team grid visual design
**Description:** As an admin, I want the team page to look polished and professional.

**Acceptance Criteria:**
- [ ] Team member cards show a larger avatar (64px instead of 48px)
- [ ] Cards show email below role in muted text
- [ ] Client badges use colored dots matching client health score colors
- [ ] Cards have a subtle gradient or accent border on hover
- [ ] Grid is responsive: 1 col mobile, 2 cols tablet, 3 cols desktop (already exists, verify)
- [ ] "Add member" button opens the existing dialog (keep as-is)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

## Functional Requirements

- FR-1: Task assignee can be set via dropdown on task detail panel and inline on Kanban cards
- FR-2: Changing task assignee creates a notification record for the new assignee
- FR-3: Pipeline page supports three views: Table (default), Kanban (by editing_status), Timeline (date-based)
- FR-4: Pipeline view selection persists in URL search params
- FR-5: All pipeline fields remain inline-editable in every view
- FR-6: Auto-scheduler calculates `posts_per_week = ceil(media_count / weeks)` automatically
- FR-7: Auto-scheduler shows calculated frequency with optional manual override
- FR-8: Moodboard chat auto-includes all video items without manual connection
- FR-9: Website items on moodboard are scraped for content and included in chat context
- FR-10: Notes are supplementary context in chat (categories/labels), not primary source
- FR-11: Team member detail opens in a modal, not a separate page
- FR-12: `/admin/team/[id]` route is removed

## Non-Goals

- No drag-and-drop reordering of pipeline items (just status changes)
- No real-time collaborative editing of pipeline (optimistic updates are fine)
- No AI-powered pipeline status suggestions
- No email/SMS notifications for task assignment (in-app only)
- No scheduled/recurring task assignment
- No website content auto-refresh (scrape once, manual re-scrape if needed)
- No team member permissions/role-based access to pipeline views (all admins see everything)

## Technical Considerations

- Pipeline Kanban: reuse `@dnd-kit/core` already used in tasks board
- Pipeline Timeline: build with CSS grid or a lightweight timeline component (no heavy Gantt library)
- Website scraping: server-side fetch with `cheerio` or similar HTML parser; store in `metadata` jsonb on `moodboard_items`
- Task notifications: use existing `notifications` table and `notification-bell` component
- Team modal: reuse existing `Dialog` component; fetch member details client-side on open
- Auto-scheduler calculation: pure frontend logic, no API changes needed

## Success Metrics

- Task assignment takes < 2 clicks from any task view
- Pipeline Kanban view loads in < 1 second for 30 clients
- Auto-scheduler dialog has one fewer manual input field
- Moodboard chat includes all board content without user intervention
- Team member details accessible without page navigation

## Open Questions

- Should pipeline Kanban be groupable by other statuses (assignment, approval) or just editing?
- Should website scraping respect robots.txt / rate limits?
- Should team modal show a full activity log for that member?
