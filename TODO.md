# Nativz Cortex — Task Queue

> Single source of truth for all dev work.
> Statuses: `[ ]` todo · `[🔄]` in-progress · `[x]` done
> **Calendar integration:** Using Nango for OAuth token management (Google Calendar). Custom native scheduler built in Cortex sends invites.

---

## Active Work

### Static Ad Generator (built 2026-03-18)
- [x] PRD finalized — Gemini image gen from Kandy template styles
- [x] Database migration (4 tables + 2 storage buckets)
- [x] Core engine (image gen, copy gen, prompt assembly, batch orchestrator)
- [x] 6 API routes (template catalog, generation, gallery, batches)
- [x] 7 UI components (gallery, catalog, gen form, progress, cards)
- [x] 49 Kandy templates seeded (General, H&B, Digital Products, Story)
- [x] ~29 templates AI-analyzed with prompt schemas
- [x] E2E test passed — 2 Toastique ads generated
- [ ] Top up OpenRouter credits (copy gen fails with 402)
- [ ] Browser-test UI with auth session
- [ ] Seed remaining ~150 templates from other Kandy collections
- [ ] Analyze all templates with prompt schemas

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
