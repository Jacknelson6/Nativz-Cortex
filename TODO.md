# Nativz Cortex — Task Queue

> Single source of truth for all dev work.
> Statuses: `[ ]` todo · `[🔄]` in-progress · `[x]` done
> **Calendar integration:** Using Nango for OAuth token management (Google Calendar). Custom native scheduler built in Cortex sends invites.

---

## Next Session

### Post-Launch QA (client portal)
- [ ] Test password reset email delivery on production (deploy just pushed — verify `ace@nativz.io` gets branded email)
- [ ] Test password reset from AC domain — verify AC-branded email arrives from `cortex@andersoncollaborative.com`
- [ ] Test portal invite flow end-to-end: admin creates invite → user clicks link → registers → auto-signs-in → lands on portal
- [ ] Test multi-client invite: send second invite to existing user → verify auto-link works
- [ ] Test brand switcher with a multi-client user (assign test user to 2+ clients)
- [ ] Verify viewer can't access `/admin/dashboard` on production (should redirect to portal)
- [ ] Test The Nerd on production — verify Grok 4.20 model works (was broken with qwen3.6:free)
- [ ] Clean up test `user_client_access` rows — test user may be linked to wrong clients
- [ ] Client logo upload — admin should be able to upload client logos (brand switcher shows placeholder icons)
- [ ] Forgot-password page renders with admin sidebar when logged in — should show clean layout instead

### PDF Export Theming
- [ ] Match PDF export to current brand theme (AC vs Nativz — colors, logo, fonts)
- [ ] Update PDF content to match results page layout (trending topics breakdown, content pillars, emotions)
- [ ] Remove extra info that doesn't match the UI (keep it clean)
- [ ] Don't include all videos/sources — just the analysis sections

### Remaining from April 3 Session
- [ ] Frame extraction debugging — ffmpeg-static works locally but carousel returns 0 frames. Need server-side logging.
- [ ] Rescript in carousel — needs clientId passed through for brand context
- [ ] Toast notification when search completes in background (user navigated away)
- [x] AC invite emails — Supabase Auth Hook + Resend multi-brand email system (Option C from PRD)
- [ ] Video reference library in Strategy Lab Knowledge Base tab

---

## Active Work

### Strategy Lab “brain” + Nerd context (see `docs/prd-strategy-lab-brain.md`)
- [x] PRD with phased backlog + implementation log
- [x] `buildStrategyLabContextPack` + append when client is @mentioned in Nerd
- [x] Analytics `/admin/analytics/social?clientId=` preselect + assistant card link
- [x] Remaining PRD phases implemented: performance snapshot, affiliates, board/video strategy tools, Strategy Lab → Cortex handoff, smoke coverage

### Static Ad Generator (built 2026-03-18, QA'd 2026-03-19)
- [x] PRD finalized — Gemini 3.1 Flash Image gen from Kandy template styles
- [x] Database migration (4 tables + 2 storage buckets)
- [x] Core engine (image gen, copy gen, prompt assembly, batch orchestrator)
- [x] 9 API routes (templates, generation, gallery, batches, bulk upload, scrape, brand scan, AI model)
- [x] 4-step wizard UI (brand scan → templates → offers → generate)
- [x] 49 Kandy templates seeded + all analyzed with prompt schemas
- [x] Post-processing pipeline (logo compositing via sharp)
- [x] QA layer (10 checks: wrong brand, duplicate logos, misspellings, wrong product, fabricated info, etc.)
- [x] Bulk template import (drag-and-drop up to 50 + URL scraper)
- [x] AI model switcher (settings page, DB-backed, platform-wide)
- [x] E2E tested — Toastique ads through v1→v9 iterations
- [x] Browser QA passed — gallery, templates, wizard, AC mode all working
- [x] Ad wizard: Brand DNA gate (client must be draft/active), step-by-step flow, offers field, crawl → `mediaUrls`; scraper uses Brand DNA color/logo extractors + richer products
- [ ] Sync Desktop Kandy folders to site: apply migration `053_kandy_templates_vertical_expand.sql`, set `KANDY_TEMPLATES_ROOT` if needed, run `npm run kandy:upload` (then `npm run kandy:analyze`)

### QA Fixes Applied (2026-03-19)
- [x] Portal login + invite: AC brand logo toggle
- [x] Portal login: deactivated user error display
- [x] Search process route: portal org scope check
- [x] Ad scraper: HTTP→HTTPS URL rewrite, filter non-product artifacts
- [x] Template catalog: display names + formatted section headings

### Tooling / hygiene (2026-03-20)
- [x] ESLint: 36 **errors** cleared — hooks order (ideas PDF export), `no-explicit-any`, `prefer-const`, `no-unescaped-entities`, empty interface; ignore `.claude/**` + `ac-knowledge-graph/**` for app-only lint
- [x] `results-client.tsx`: React 19 + TS — replace `string && <Component />` / `object && <Component />` with ternaries or `Boolean(...) ?` so children are not inferred as `unknown`

### Remaining QA Items
- [x] Topic search expansion — built (API + UI + pre-fill from URL params)
- [x] Search processing progress — fixed (error state, retry button, timeout)

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
- **Unified Research Hub** — Combined brand/topic research + idea generation at `/admin/search/new` with wizard modals, history feed, and polling
- **AI/Nerd Tools** — Knowledge tools, Fyxer integration, meeting import, usage tracking
- **Client Profiles** — Connected accounts, agency badges, Google service account support
- **Todo Widget** — Centered empty state with add task button

## Next Week
- [ ] Set up Google OAuth (Sign in with Google) for admin users — needs Google Cloud Console OAuth app first (Client ID + Secret → Supabase Auth settings)
