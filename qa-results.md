# QA Results — Client Portal — 2026-03-19

## Summary
- Pages tested: 8 (login, join, dashboard, knowledge, reports, notifications, research, settings)
- Security tests: 2 (admin/dashboard, admin/clients — both correctly blocked)
- Issues found: 7 (2 critical, 3 warning, 2 info)
- Console errors: 2 (strategy API 404s)

## Critical Issues

| # | Page | Issue | Type | Status |
|---|------|-------|------|--------|
| 1 | `/portal/login`, `/portal/join/[token]` | **Sidebar visible on unauthenticated pages** — full nav (Dashboard, Research, Knowledge, etc.) shows before login. Client can see all nav items and click them before authenticating. | Security/UI | **FIXED** — layout now renders without sidebar when no user session |
| 2 | `/api/search` (POST) | **Missing org scope validation** — portal users can craft a request with an arbitrary `client_id` from another organization. No server-side check verifies the client belongs to the user's org. | Security | **FIXED** — added org_id check for viewer role users |

## Warnings

| # | Page | Issue | Type | Status |
|---|------|-------|------|--------|
| 3 | `/portal/knowledge` | **Internal meeting notes visible** — meeting notes contain sensitive internal strategy (e.g., "Stop paid ad spend immediately"). Knowledge entries should have an `approved` or `client_visible` flag. | Data Privacy | Open |
| 4 | `/portal/dashboard` | **"Loading strategy..." spinner never resolves** — strategy card shows perpetual loading state (404 on `/api/clients/.../strategy`). Should show empty state or be hidden when no strategy exists. | UX | Open |
| 5 | All portal pages | **No theme lock to agency** — Toastique is an AC client (`agency: "Anderson Collaborative"`) but portal shows Nativz dark theme. Should auto-lock to AC theme based on client's agency assignment. | UX | Open — needs new feature |

## Info

| # | Page | Issue | Type | Status |
|---|------|-------|------|--------|
| 6 | `/portal/dashboard` | Console: 2x 404 on `/api/clients/22bb761f.../strategy` | Console | Open |
| 7 | `/portal/settings` | Feature access shows "Edit preferences: Disabled" and "Submit ideas: Disabled" — these features are hidden from sidebar (correct) but settings page shows they're disabled. Expected behavior but worth noting. | Info | N/A |

## Security Tests — Passed

| Test | Result |
|------|--------|
| Portal user → `/admin/dashboard` | Redirected to `/portal/dashboard` |
| Portal user → `/admin/clients` | Redirected to `/portal/dashboard` |
| Knowledge data scoped to org | Only Toastique entries visible |
| Invite token single-use | Token marked `used_at` after acceptance |
| User record org assignment | Correctly set to Toastique org |
| Feature flags applied | Ideas/Preferences hidden from sidebar per flags |

## Client Portal Feature Access

**Currently accessible to portal clients:**
1. Dashboard — overview stats, recent reports
2. Notifications — notification center (empty by default)
3. Research — brand intel + topic research
4. Knowledge — view/add knowledge entries
5. Reports — view approved research reports
6. Settings — view account, brand profile, feature flags

**Hidden by default (feature flags):**
- Ideas (`can_submit_ideas: false`)
- Preferences (`can_edit_preferences: false`)
- Calendar (`can_view_calendar: false`)
- Analyze/Moodboard (`can_view_analyze: false`)

## Features Needed (from user requirements)

| # | Feature | Priority | Scope |
|---|---------|----------|-------|
| F1 | **Lock theme to agency** — AC clients see AC theme, Nativz clients see Nativz theme, no toggle | High | Portal layout + brand mode provider |
| F2 | **Multi-brand accounts** — one user can belong to multiple client orgs | High | DB schema change (user_organizations junction table) + brand switcher UI |
| F3 | **Brand switcher** — toggle between brands in sidebar/header | High | Portal sidebar component |
| F4 | **Scope Nerd agent to client** — AI chat only accesses current client's knowledge/data | Medium | Nerd chat API route + portal nerd page |
| F5 | **Knowledge entry visibility** — add `client_visible` flag to filter internal-only notes | Medium | DB migration + knowledge API + portal knowledge page |
| F6 | **Fix search route org scoping** — add server-side org validation | High | `app/api/search/route.ts` |

## Test Account Created

- **Email:** test@toastique.com
- **Password:** TestPortal123!
- **Role:** viewer
- **Organization:** Toastique Portal (e5e1e21a-8c44-4c20-b706-68749d790d16)
- **Client:** Toastique (22bb761f-4fb6-41ec-ac73-e13693e74c12, agency: Anderson Collaborative)
