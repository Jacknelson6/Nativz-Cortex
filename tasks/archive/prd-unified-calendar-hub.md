# PRD: Unified Calendar Hub

## Introduction

Replace the three separate calendar-adjacent pages (`/admin/calendar`, `/admin/scheduler`, `/admin/shoots`) with a single unified Calendar hub at `/admin/calendar`. This hub becomes the command center for everything time-based at Nativz: shoot scheduling, social media post scheduling, meetings, and content planning — all on one multi-calendar overlay view.

The core UX innovation: when scheduling anything, the UI shows the Google Calendars of all participants (team members + client contacts) overlaid so you can visually spot free slots and book directly. Think Motion meets Cal.com meets Later.com, purpose-built for a content agency workflow.

## Goals

- Single `/admin/calendar` page replaces Calendar, Scheduler, and becomes the primary way to schedule shoots
- Multi-person calendar overlay: see team and client Google Calendars side-by-side in real-time
- Click any free slot to create a shoot, meeting, or content publish event
- Keep all existing social media scheduler functionality (media library, post editor, AI captions, batch publish, cron auto-publish) but housed within the Calendar hub
- Reduce sidebar nav from Calendar + Scheduler to one "Calendar" item
- No new external dependencies — extend Nango Google Calendar integration to support multiple connected accounts

## User Stories

### US-001: Unified calendar page with view modes
**Description:** As an admin, I want one calendar page with different view modes so I don't have to jump between three separate pages.

**Acceptance Criteria:**
- [ ] `/admin/calendar` renders the unified Calendar hub
- [ ] View mode switcher in header: Month, Week, Day, Agenda
- [ ] Month view: grid showing all event types (shoots, posts, meetings, tasks) as color-coded chips
- [ ] Week view: 7-column time grid (8am–8pm default) with events as time blocks
- [ ] Day view: single-column time grid with full detail, best for scheduling
- [ ] Agenda view: chronological list grouped by day (next 14 days)
- [ ] Default view is Week
- [ ] View persists in URL param `?view=week`
- [ ] Remove old `/admin/scheduler` page (redirect to `/admin/calendar?mode=posts`)
- [ ] Sidebar nav: single "Calendar" item replaces Calendar + Scheduler
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-002: Event type layers with toggle visibility
**Description:** As an admin, I want to toggle which event types are visible so I can focus on what I'm planning.

**Acceptance Criteria:**
- [ ] Layer toggles in a filter bar: Shoots, Posts, Meetings, Tasks, Google Calendar
- [ ] Each layer has a distinct color: Shoots = amber, Posts = purple, Meetings = blue, Tasks = emerald, Google Calendar = gray
- [ ] Toggles persist in localStorage (`cortex:calendar-layers`)
- [ ] When a layer is off, its events are hidden from all views
- [ ] Event count badge next to each layer toggle
- [ ] "All" toggle to show/hide everything
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-003: Multi-calendar overlay — connect team calendars
**Description:** As an admin, I want to see my team's Google Calendars overlaid on the same view so I can find times when everyone is free.

**Acceptance Criteria:**
- [ ] "People" sidebar panel (right side, collapsible) showing connected team members
- [ ] Each team member with a connected Google Calendar shows a colored avatar + toggle
- [ ] When toggled on, their Google Calendar events appear as semi-transparent blocks on the time grid (Week/Day views)
- [ ] Each person's events are a different color (auto-assigned from a palette)
- [ ] Busy blocks show event title (if available) or just "Busy"
- [ ] Free time slots are visually clear (no overlay = free)
- [ ] Team members connect via existing Nango OAuth flow (reuse `ConnectCalendar` component)
- [ ] Store team calendar connections in `calendar_connections` table (already exists)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-004: Multi-calendar overlay — connect client calendars
**Description:** As an admin, I want to invite clients to share their Google Calendar so I can see their availability when scheduling shoots.

**Acceptance Criteria:**
- [ ] On the People panel, "Invite client" button generates a unique calendar-connect link
- [ ] Link sends the client to a lightweight public page (`/shared/calendar-connect/[token]`) where they OAuth with Google
- [ ] After connecting, the client's calendar appears as an overlay option in the People panel
- [ ] Client calendar events show as "Busy" blocks only (no titles, for privacy)
- [ ] Connection stored in `calendar_connections` table with `contact_id` reference
- [ ] Connections auto-refresh (re-fetch events every 5 minutes or on manual "Refresh" click)
- [ ] Admin can disconnect a client's calendar
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Quick schedule from calendar — shoots
**Description:** As an admin, I want to click a free time slot and schedule a shoot directly from the calendar.

**Acceptance Criteria:**
- [ ] Clicking an empty time slot on Week/Day view opens a quick-create popover
- [ ] Popover shows: event type selector (Shoot / Meeting / Post), then type-specific fields
- [ ] Shoot fields: client selector, title (auto-filled: "Shoot — {client}"), location, notes, team members multi-select, duration dropdown (1h/2h/4h/full day)
- [ ] The selected time slot pre-fills start time; duration extends the end time
- [ ] "Schedule" button: creates `shoot_events` record + sends Google Calendar invites to all participants (team + client primary contact)
- [ ] New shoot immediately appears on the calendar as an amber block
- [ ] Google Calendar invite includes title, time, location, notes
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-006: Quick schedule from calendar — meetings
**Description:** As an admin, I want to schedule internal or client meetings from the calendar.

**Acceptance Criteria:**
- [ ] Meeting fields in quick-create: title, attendees (team + contacts multi-select), location/link, notes, duration
- [ ] "Schedule" button creates a Google Calendar event via Nango with all attendees
- [ ] Meeting appears on calendar as a blue block
- [ ] Attendees receive Google Calendar invites
- [ ] Optional: video meeting link auto-generation (Google Meet) if no location specified
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-007: Quick schedule from calendar — social posts
**Description:** As an admin, I want to schedule a social media post by clicking a date/time on the calendar.

**Acceptance Criteria:**
- [ ] Post fields in quick-create: client selector, then opens the full PostEditor slide-over (reuse existing)
- [ ] Selected date/time pre-fills the scheduled_at field
- [ ] All existing PostEditor functionality preserved: platform selector, media attach, AI caption, hashtags, draft/schedule toggle
- [ ] Scheduled post appears on calendar as a purple chip (shows thumbnail if media attached)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-008: Media library integration
**Description:** As an admin, I want access to the media library from within the Calendar hub so I can drag videos onto dates.

**Acceptance Criteria:**
- [ ] Media library as a collapsible left panel (reuse existing `MediaLibrary` component)
- [ ] Panel toggle button in the header toolbar
- [ ] Drag a video from the media library onto a calendar date → opens PostEditor pre-filled with that media and date
- [ ] Media library scoped to selected client (reuse existing client selector)
- [ ] All existing media library features preserved: upload, thumbnails, "unused" filter, duration overlay
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-009: Day detail panel
**Description:** As an admin, I want to click a day (in month view) and see everything happening that day in a detail panel.

**Acceptance Criteria:**
- [ ] Clicking a day in month view opens a right-side panel showing all events for that day
- [ ] Events grouped by type: Shoots, Posts, Meetings, Tasks
- [ ] Each event shows: time, title, client badge, status indicator
- [ ] Click an event to open its detail view / editor
- [ ] "Add" button at top with event type selector
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-010: Client filter
**Description:** As an admin, I want to filter the calendar to a specific client so I can see only their events.

**Acceptance Criteria:**
- [ ] Client selector dropdown in the header toolbar (reuse existing)
- [ ] "All clients" option shows everything
- [ ] When a client is selected: only their shoots, posts, tasks, and meetings involving their contacts are shown
- [ ] Client filter persists in URL param `?client=slug`
- [ ] Media library auto-scopes to selected client
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-011: Database — calendar connections for clients
**Description:** As a developer, I need to extend the calendar connections system to support client contact connections.

**Acceptance Criteria:**
- [ ] Extend `calendar_connections` table (or create if needed): add `contact_id uuid references contacts(id)` column, `connection_type text` ('team' or 'client'), `invite_token text` (unique, for the public connect page)
- [ ] Migration in `supabase/migrations/`
- [ ] RLS: admins can read all connections, public connect endpoint can create client connections via token
- [ ] Typecheck passes

### US-012: API — fetch multiple calendars
**Description:** As a developer, I need an API that fetches events from multiple Google Calendar connections simultaneously.

**Acceptance Criteria:**
- [ ] `GET /api/calendar/events` — accepts `connection_ids[]` or `team_member_ids[]` query params
- [ ] Fetches Google Calendar events from each connection via Nango in parallel
- [ ] Returns events grouped by person: `{ [connectionId]: { name, color, events[] } }`
- [ ] Events include: `id`, `title` (or "Busy" for client calendars), `start`, `end`, `is_all_day`
- [ ] Caches results for 2 minutes per connection (in-memory or Redis)
- [ ] Error for one calendar doesn't fail the whole request (partial results OK)
- [ ] Typecheck passes

### US-013: API — calendar connect invitation
**Description:** As a developer, I need an API to generate and redeem calendar connection invitations for clients.

**Acceptance Criteria:**
- [ ] `POST /api/calendar/invite` — generates an invite token, stores in `calendar_connections` with `contact_id`, returns the shareable URL
- [ ] `GET /api/calendar/connect/[token]` — public, validates token, returns contact info for the connect page
- [ ] `POST /api/calendar/connect/[token]` — public, completes the Nango OAuth and stores the `nango_connection_id` on the calendar_connections row
- [ ] Tokens expire after 30 days
- [ ] Zod validation, proper error responses
- [ ] Typecheck passes

### US-014: Redirect old routes
**Description:** As a developer, I need to ensure old routes redirect properly.

**Acceptance Criteria:**
- [ ] `/admin/scheduler` redirects to `/admin/calendar?mode=posts`
- [ ] Old `/admin/calendar` URL works as-is (it's the new page)
- [ ] Update sidebar nav: remove Scheduler item, keep Calendar item
- [ ] Update command palette if it references the old routes
- [ ] Typecheck passes

### US-015: Public calendar connect page
**Description:** As a client contact, I want a simple page to connect my Google Calendar when invited by the Nativz team.

**Acceptance Criteria:**
- [ ] `/shared/calendar-connect/[token]` — public page, no auth required
- [ ] Shows Nativz branding, the team member who invited them, and what they're connecting for
- [ ] "Connect Google Calendar" button triggers Nango OAuth popup
- [ ] After connecting: success state with "You're connected! You can close this page"
- [ ] Invalid/expired token shows friendly error
- [ ] Only fetches free/busy data — explain to client that Nativz only sees availability, not event details
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: Single `/admin/calendar` page with Month/Week/Day/Agenda views replaces Calendar + Scheduler pages
- FR-2: Sidebar nav consolidates to one "Calendar" item
- FR-3: Layer toggles control visibility of event types (Shoots, Posts, Meetings, Tasks, External Calendars)
- FR-4: People panel shows connected team and client calendars with toggle-on/off overlays
- FR-5: Week/Day views render a time grid (8am–8pm) with events as positioned blocks, colored by type/person
- FR-6: Clicking empty time slots opens a quick-create popover with event type selection
- FR-7: Shoots created from calendar automatically send Google Calendar invites to team + client contacts
- FR-8: Meetings created from calendar send Google Calendar invites to selected attendees
- FR-9: Social posts created from calendar open the existing PostEditor with pre-filled date/time
- FR-10: Media library available as a collapsible left panel with drag-onto-calendar support
- FR-11: Client contacts can be invited to share their Google Calendar via a public connect link
- FR-12: Client calendar events displayed as "Busy" blocks only (privacy)
- FR-13: Multi-calendar fetch API returns events from multiple Google Calendar connections in parallel
- FR-14: All existing scheduler functionality preserved: auto-publish cron, AI captions, review links, batch publish
- FR-15: Client filter scopes the entire view to one client's events
- FR-16: `/admin/scheduler` redirects to `/admin/calendar?mode=posts`

## Non-Goals

- No smart slot finder / AI scheduling (future iteration — start with visual overlay)
- No recurring event creation (use Google Calendar for recurring, we just display them)
- No drag-to-reschedule on the time grid (future iteration)
- No Apple Calendar or Outlook integration (Google Calendar only via Nango)
- No real-time WebSocket updates (polling/refresh is fine for now)
- No mobile-responsive time grid (mobile users get Agenda view only)
- No calendar embedding for external websites
- No Zoom/Teams integration for meeting links (just Google Meet or manual link)

## Design Considerations

**Layout — three-panel when fully expanded:**
```
┌─────────┬─────────────────────────────────────┬──────────┐
│  Media  │          Calendar Grid              │  People  │
│ Library │    (Month/Week/Day/Agenda)          │  Panel   │
│  (280px)│                                      │  (280px) │
│         │  ┌─ Header ─────────────────────┐   │          │
│ optional│  │ View toggle · Client · Today  │   │ optional │
│  panel  │  └───────────────────────────────┘   │  panel   │
│         │                                      │          │
│         │  Events rendered as colored blocks   │  Toggle  │
│         │  on time grid (Week/Day) or chips   │  people  │
│         │  in cells (Month)                    │  on/off  │
│         │                                      │          │
└─────────┴─────────────────────────────────────┴──────────┘
```

**Color system for event types:**
- Shoots: `amber-500` — primary revenue activity
- Social posts: `purple-500` — content pipeline
- Meetings: `blue-500` — communication
- Tasks (due dates): `emerald-500` — internal work
- External calendar events: `gray-400` (own) / person-specific color (overlays)

**Calendar overlay colors (per person):**
Auto-assigned from palette: `['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#06b6d4', '#84cc16', '#f43f5e', '#14b8a6']`

**Time grid design:**
- Hours on left axis, 30-minute grid lines
- Current time indicator: horizontal red line with dot
- Events positioned absolutely by start/end time
- Overlapping events: side-by-side columns (like Google Calendar)
- All-day events: pinned to top of the day column

**Quick-create popover:**
- Appears anchored to the clicked time slot
- Minimal: event type pills at top, then 3–5 fields, "Schedule" button
- framer-motion scale-in animation
- Escape or click-outside to dismiss

**Typography:**
- Header: `text-lg font-semibold text-text-primary`
- Day headers: `text-xs font-medium text-text-muted uppercase`
- Event chips: `text-xs font-medium`
- Time axis: `text-[11px] text-text-muted`

**Existing components to reuse:**
- `components/scheduler/media-library.tsx` — left panel, as-is
- `components/scheduler/post-editor.tsx` — slide-over for post creation
- `components/scheduler/hooks/use-scheduler-data.ts` — data fetching for posts/media/profiles
- `components/scheduler/video-validation.ts` — upload validation
- `components/calendar/connect-calendar.tsx` — Nango OAuth popup
- All scheduler API routes — unchanged, just called from the new page

**Components to retire:**
- `app/admin/scheduler/page.tsx` — replaced by unified calendar
- `components/scheduler/calendar-view.tsx` — replaced by new unified calendar views
- `components/calendar/content-calendar.tsx` — replaced by new calendar
- `components/calendar/shoot-events-list.tsx` — shoots now rendered on calendar

## Technical Considerations

- The multi-calendar fetch will make N parallel Nango API calls (one per connected calendar). Budget for 200–500ms latency per call. Use `Promise.allSettled` so one failure doesn't block others.
- Google Calendar API rate limits: 100 queries per 100 seconds per user. Cache aggressively (2-minute TTL per connection).
- Time grid rendering: use absolute positioning with `top` and `height` calculated from event start/end times relative to the day. For overlapping events, calculate column layout (standard interval graph algorithm).
- The existing `scheduled_posts` table and APIs are untouched — we're just rendering them differently on the calendar.
- Nango's `google-calendar` integration already supports listing events and creating events. For client calendars, we may need to request `freeBusyQuery` scope instead of full event read (privacy).
- `calendar_connections` table needs extension — currently it stores `user_id` + `nango_connection_id`. Add `contact_id`, `connection_type`, `invite_token`, `expires_at`.
- Consider lazy-loading the media library panel and people panel (code-split) since they add significant JS.
- The Week/Day time grid is the most complex new UI. Consider building it as a standalone `TimeGrid` component that receives `events[]` and renders them with absolute positioning.

## Success Metrics

- Admin can schedule a shoot in under 30 seconds from the calendar (click slot → fill 3 fields → schedule)
- All 3 old pages' functionality accessible from one page with zero feature regression
- Team members can see 3+ calendars overlaid simultaneously without performance degradation
- Client calendar connection flow takes under 60 seconds (send link → client connects)
- Page load time under 2 seconds (initial view, without external calendar fetches)
- Social post scheduling workflow identical to current — no relearning required

## Open Questions

- Should we support Google Calendar free/busy API specifically for client calendars (lighter permissions, better privacy story) vs full event read?
- Should meetings created in Cortex also create a Cortex record (new `meetings` table) or just be Google Calendar events we display?
- How should timezone handling work when team + client are in different timezones? Show all times in the team's timezone, or per-person?
- Should we integrate with the existing tasks system to show task due dates on the calendar, or keep tasks separate?
- What's the budget for Nango API calls? Each calendar overlay = 1 API call per refresh. With 5 people overlaid, that's 5 calls every 2 minutes.
- Should the People panel show availability heatmaps (green/yellow/red by hour) as a quick summary?
