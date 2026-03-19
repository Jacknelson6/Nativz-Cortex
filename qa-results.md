# QA Results — Client Portal — 2026-03-19 (Updated)

## Summary
- Pages tested: 8 portal routes + 2 admin security tests
- Security tests: All passed
- Issues found: 7 (2 critical — FIXED, 3 warning — 2 FIXED, 2 info)
- Features built & verified: 5 (theme lock, multi-brand, nerd, knowledge visibility, sidebar fix)

## Critical Issues — ALL FIXED

| # | Page | Issue | Status |
|---|------|-------|--------|
| 1 | `/portal/login`, `/portal/join/[token]` | Sidebar visible on unauthenticated pages | **FIXED** — layout skips sidebar when no user session |
| 2 | `/api/search` (POST) | Missing org scope validation for portal users | **FIXED** — added org_id check for viewer role |

## Warnings

| # | Page | Issue | Status |
|---|------|-------|--------|
| 3 | `/portal/knowledge` | Internal meeting notes visible to clients | **FIXED** — `client_visible` column added, portal filters to visible-only |
| 4 | `/portal/dashboard` | Strategy card shows perpetual "Loading strategy..." (404) | Open — minor, needs strategy API endpoint |
| 5 | All portal pages | Theme should lock to agency assignment | **FIXED** — AC clients auto-locked to AC theme via `data-brand-forced` |

## Features Built & QA Verified

### F1: Theme Lock to Agency ✅
- Toastique (AC client) → AC light theme on all portal pages
- Verified: dashboard, knowledge, research, reports, notifications, settings
- `useLayoutEffect` + `data-brand-forced` DOM flag prevents root provider override
- No flash of wrong theme on navigation

### F2+F3: Multi-Brand Accounts + Switcher ✅
- `user_client_access` junction table created (migration 048)
- Brand switcher in sidebar (visible with 2+ brands)
- Cookie-based active brand selection
- Invite flow creates access rows (second invite adds brand, doesn't overwrite)
- QA: Test user has 1 brand (Toastique) — switcher correctly hidden

### F4: Portal Nerd (Scoped AI Chat) ✅
- `/portal/nerd` page created with simplified chat UI
- Auto-scoped to client's data only
- Read-only tools (no write operations)
- Gated by `can_use_nerd` feature flag (default: false)
- QA: Not visible in sidebar (flag is off) — correct behavior

### F5: Knowledge Entry Visibility ✅
- `client_visible` column added to `client_knowledge_entries` (migration 047)
- Portal shows 0 entries (all defaulted to internal-only) — correct
- Admin has eye/eye-off toggle per entry
- Portal-created entries auto-set `client_visible = true`

### Security Checks — All Passed ✅

| Test | Result |
|------|--------|
| Portal user → `/admin/dashboard` | Redirected to `/portal/dashboard` |
| Portal user → `/admin/clients` | Redirected to `/portal/dashboard` |
| Knowledge scoped to org | Only Toastique entries visible |
| Search API org validation | Added; blocks cross-org client_id |
| Invite token single-use | Token marked `used_at` after acceptance |
| Feature flags applied | Ideas/Preferences hidden per flags |
| Theme lock works | AC theme persists across all pages |

## Portal Pages — AC Theme QA

| Page | Theme | Readability | Issues |
|------|-------|-------------|--------|
| `/portal/login` | N/A (no sidebar, clean form) | ✅ | None |
| `/portal/join/[token]` | N/A (no sidebar) | ✅ | None |
| `/portal/dashboard` | AC light ✅ | ✅ | Strategy card 404 (minor) |
| `/portal/knowledge` | AC light ✅ | ✅ | None (0 visible entries — correct) |
| `/portal/reports` | AC light ✅ | ✅ | None |
| `/portal/notifications` | AC light ✅ | ✅ | None |
| `/portal/search/new` | AC light ✅ | ✅ | None — teal accents, proper contrast |
| `/portal/settings` | AC light ✅ | ✅ | None — keyword tags visible |

## Test Account

- **Email:** test@toastique.com
- **Password:** TestPortal123!
- **Role:** viewer
- **Organization:** Toastique Portal (e5e1e21a-8c44-4c20-b706-68749d790d16)
- **Client:** Toastique (22bb761f-4fb6-41ec-ac73-e13693e74c12, agency: Anderson Collaborative)

## Remaining Open Items

| # | Item | Priority |
|---|------|----------|
| 1 | Dashboard strategy card 404 — needs `/api/clients/[id]/strategy` endpoint or hide the card | Low |
| 2 | Creative Benchmarks presentation — PRD in progress | New feature |
