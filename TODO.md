# Nativz Cortex — Task Queue

> Single source of truth for all dev work.
> Statuses: `[ ]` todo · `[🔄]` in-progress · `[x]` done
> **Calendar integration:** Using Nango for OAuth token management (Google Calendar). Custom native scheduler built in Cortex sends invites.

---

## Active Work

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
