# Nativz Cortex — Task Queue

> Single source of truth for all dev work.
> Statuses: `[ ]` todo · `[🔄]` in-progress · `[x]` done
> **Calendar integration:** Using Nango for OAuth token management (Google Calendar). Custom native scheduler built in Cortex sends invites.

---

## Next Session

### Audit — Live QA (scrapers built, need live test)
- [ ] QA all 4 Apify scrapers live (TikTok, Instagram, Facebook, YouTube) — run a real audit and verify data returns
- [ ] Test new Facebook scraper env override (`FACEBOOK_SCRAPER_ACTOR`) with cheaper community actors

### Analytics — QA
- [ ] Verify analytics client portfolio selector loads with real client data
- [ ] Verify social/affiliates/benchmarking tabs all work
- [ ] Verify benchmarking competitor add + refresh + historical charts
- [ ] Test status dots (green/yellow) accuracy for connected clients

### Calendar Webhooks — QA
- [ ] Test webhook with a real Google Chat webhook URL
- [ ] Verify webhook fires on shared calendar feedback (approved/changes_requested/comment)
- [ ] Verify webhook URL save/clear in client settings

### Research — QA
- [ ] Suggest topics — QA that brand-specific ontology topics generate correctly for different clients
- [ ] History rail — verify client filter works correctly with load-more (no unrelated searches leaking)
- [ ] PDF export — QA the overhauled PDF matches the results page (all 3 pages)
- [ ] Share links — QA that AC domain generates AC share URLs and Nativz generates Nativz URLs
- [ ] QA: verify PDF renders correctly for both AC and Nativz branded searches

### Remaining from April 3 Session
- [ ] Frame extraction debugging — ffmpeg-static works locally but carousel returns 0 frames
- [ ] Video reference library in Strategy Lab Knowledge Base tab

---

## Completed — April 9 Session (Part 2)

### Audit — Scraper & Source Browser Fixes
- [x] Website scraper — improved social link detection: two-pass extraction (regex + href parsing), added `m.facebook.com`, `fb.com`, protocol-relative URL support, expanded exclusion list
- [x] Instagram scraper — verified input format (passes both `urls` and `usernames`, already correct)
- [x] TikTok scraper — verified input format (`profiles` array with full URLs, correct)
- [x] Facebook scraper — made actor configurable via `FACEBOOK_SCRAPER_ACTOR` env var, added flexible field extraction for different actor output formats, reduced results limit for cost savings
- [x] Source browser — added Facebook platform support (colors, labels, filter button), dynamic platform filter (only shows platforms with data)
- [x] Source browser — fixed YouTube aspect ratios: Shorts (≤180s or `/shorts/` URL) now correctly show as 9:16 vertical

### Audit — PDF Export & Share Links (NEW)
- [x] Audit PDF export — 3-page dark-themed PDF via @react-pdf/renderer (overview + scorecard + platforms/competitors)
- [x] Export PDF button in audit report header
- [x] Audit share links — full CRUD API at `/api/audit/[id]/share` (GET/POST/DELETE)
- [x] DB migration `095_audit_share_links.sql` — `audit_share_links` table with RLS
- [x] Share button in audit report header
- [x] Shared audit page at `/shared/audit/[token]` — read-only public view with full report

### Research — Background Notifications
- [x] Background search tracker — React context provider with polling
- [x] Toast notification when search completes in background (user navigated away)
- [x] "Go back" button on processing page registers search for background tracking
- [x] Toast includes "View results" action button

### Research — Rescript Fix
- [x] Carousel rescript — now passes `clientId` for brand context to `/api/analysis/items/[id]/rescript`

---

## Completed — April 9 Session

### Sales Audit Tool (NEW)
- [x] Website-first flow — paste URL, auto-detect social profiles
- [x] Platform confirmation screen — shows detected platforms, lets user add missing ones
- [x] TikTok scraper (apidojo/tiktok-profile-scraper via raw Apify fetch)
- [x] Instagram scraper (apidojo/instagram-scraper-api via raw Apify fetch)
- [x] Facebook scraper (apify/facebook-posts-scraper via raw Apify fetch)
- [x] YouTube scraper (YouTube Data API — channel info + recent Shorts)
- [x] Parallel platform scraping
- [x] AI competitor discovery + competitor profile scraping
- [x] Scorecard with green/yellow/red dots (posting frequency, engagement, avg views, hashtags, content variety, bio optimization, follower-to-view ratio, caption optimization, content quality)
- [x] Recharts: engagement rate over time, views per post per platform
- [x] Competitor comparison charts (avg views + engagement rate horizontal bars)
- [x] Smart aspect ratios (YouTube Shorts 9:16, long-form 16:9, TikTok/IG always 9:16)
- [x] VideoGrid source browser with platform filtering
- [x] History rail with right-click context menu, bulk select, delete, search
- [x] Smooth progress bar (eased curve, animated finish to 100%)
- [x] Encrypted text stage animation during processing
- [x] Admin-only access (ADMIN_ONLY_HREFS)
- [x] DB migration: prospect_audits + social_urls + videos_data columns
- [x] `needs_social_input` + `confirming_platforms` status flow

### Analytics Overhaul
- [x] Client portfolio selector with green/yellow status dots
- [x] Merged social + affiliates into tabbed view (Social | Affiliates | Benchmarking)
- [x] Benchmarking: add/discover competitors, Apify scraping, snapshots, historical charts
- [x] Old /admin/analytics/social and /affiliates redirect to consolidated page

### Calendar Revision Webhooks
- [x] Google Chat webhook on feedback submission
- [x] Configurable webhook URL per client in settings
- [x] lib/webhooks/revision-webhook.ts
- [x] /api/clients/[id]/webhook-settings API

### Users/Team Consolidation
- [x] Merged Team into Users page with Team filter tab + role badges
- [x] Bumped font sizes across Users page
- [x] Sort controls (name, role, team, last active, searches)
- [x] /admin/team redirects to /admin/users

### Research Improvements
- [x] Suggest topics button (AI generates brand-specific ontology topics when client selected)
- [x] History rail filters by selected client
- [x] Removed folders section from history rail
- [x] Delete completed searches enabled
- [x] Talking head & reaction content pillar added to clustering prompt
- [x] Encrypted text stage animation on processing page
- [x] Keyword picker centered + font sizes bumped
- [x] "Processing" badge removed from history rail (just spinner)

### Share Links & PDF
- [x] Share URL uses request origin (AC domain → AC links, Nativz → Nativz)
- [x] Share view includes AiTakeaways, SourceBrowser (matches admin page)
- [x] Removed BigMovers + CompetitiveAnalysis (not rendering)
- [x] PDF overhauled — 3 pages matching results page with two-column layouts
- [x] PDF brand detection from domain (AC green vs Nativz blue)

### UI/UX
- [x] Global cursor-pointer on all buttons/links via CSS
- [x] "Why this video works" removed from video detail panel (was just repeating caption)
- [x] "Short-form videos" renamed to "Videos — across all platforms"
- [x] AI model fixed across all agencies (openai/gpt-5.4-mini in all model columns)
- [x] Sidebar: "Sales audit" → "Audit", Team removed, Analytics no dropdown

---

## Active Work

### Strategy Lab "brain" + Nerd context (see `docs/prd-strategy-lab-brain.md`)
- [x] PRD with phased backlog + implementation log
- [x] `buildStrategyLabContextPack` + append when client is @mentioned in Nerd
- [x] Analytics `/admin/analytics/social?clientId=` preselect + assistant card link
- [x] Remaining PRD phases implemented

### Static Ad Generator (built 2026-03-18, QA'd 2026-03-19)
- [x] Full pipeline built and QA'd
- [ ] Sync Desktop Kandy folders to site

---

## Completed Epics

- **EPIC 1** — Client Score System (health_score ratings)
- **EPIC 2** — Client Profile Rework (contacts, team, assignments, services)
- **EPIC 3** — Dashboard Rework (activity feed, todos, upcoming shoots)
- **EPIC 4** — Team Board (team management, assignments)
- **EPIC 5** — Shoot Scheduler (Nango + Google Calendar)
- **EPIC 6** — Task & Workflow Management (Monday replacement)
- **EPIC 7** — Social Media Reporting Dashboard (cross-platform analytics)
- Brave Search, dual dashboard, search flow, approval system, portal invites, ideas, vault integration
- **Knowledge System** — Vault layout, semantic search, wikilinks, entity linking, Gemini embeddings
- **Ideas Hub** — Generation, triage, saved ideas, reference videos, script generation
- **Unified Research Hub** — Combined brand/topic research + idea generation
- **AI/Nerd Tools** — Knowledge tools, Fyxer integration, meeting import, usage tracking
- **Client Profiles** — Connected accounts, agency badges, Google service account support
- **Todo Widget** — Centered empty state with add task button

## Future
- [ ] Set up Google OAuth (Sign in with Google) for admin users
- [ ] Instagram + Facebook scrapers for research pipeline (not just audit)
- [ ] Audit PDF export
- [ ] Calendar share improvements (Section 3 of original PRD)
- [ ] Recurring benchmarking scrapes (cron-based, admin-controlled)
