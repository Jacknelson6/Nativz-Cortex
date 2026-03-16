# Portal Expansion & Impersonation — Design Spec

## Problem
Admins can't test what clients see. The portal sidebar is sparse — clients can only see reports, preferences, and ideas. They need access to notifications, calendar, video analysis, research, saved ideas, and their knowledge graph.

## Solution

### 1. Impersonation System
- "Impersonate" button on admin client profile pages (`/admin/clients/[slug]`)
- Sets a cookie `x-impersonate-org` with the client's `organization_id`
- Middleware detects this cookie → routes admin to portal with that org's scoping
- Yellow banner at top of portal: "Viewing as [Client Name] — Exit"
- Exit clears cookie and returns to admin client page

### 2. Portal Sidebar Expansion
New sidebar items (in order):
1. **Dashboard** (existing)
2. **Notifications** — engagement spikes, top performers, follower milestones for their account
3. **Research** (existing search, renamed)
4. **Saved ideas** — ideas saved from research, submitted ideas
5. **Calendar** — shared calendar preview (posts scheduled for them)
6. **Analyze** — video analysis boards shared with their org
7. **Knowledge** — view and add to their knowledge graph
8. **Preferences** (existing)
9. **Settings** (existing)

### 3. New Portal Pages
- `/portal/notifications` — notification feed for the org
- `/portal/calendar` — shared calendar/scheduled posts preview
- `/portal/analyze` — moodboard boards shared with this client
- `/portal/knowledge` — knowledge graph viewer + add entries
- `/portal/ideas` — expanded to show saved ideas from research too

### 4. Feature Flags
All new features respect existing feature_flags system. Add new flags:
- `can_view_notifications` (default: true)
- `can_view_calendar` (default: false — only when calendar is shared)
- `can_view_analyze` (default: false)
- `can_view_knowledge` (default: true)

## Data Model
No schema changes. All data already exists scoped by organization_id or client_id.
Impersonation is purely cookie-based — no DB changes.
