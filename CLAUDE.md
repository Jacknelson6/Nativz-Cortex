# CLAUDE.md

## Project Overview

**Nativz Cortex** — dual-dashboard AI-powered topic research and content ideation platform for the Nativz marketing agency. Admin dashboard for the team + client portal for clients. Core problem: videographers show up on set without knowing what to film. This tool runs AI-powered topic research so they have trending topics and video ideas ready.

## Tech Stack

Next.js 15 (App Router) + TypeScript, Supabase (Postgres + Auth), Brave Search API, Claude Sonnet 4.5 via OpenRouter, Tailwind CSS v4, Recharts, lucide-react, Zod, Obsidian vault via GitHub API

**Social posting / analytics:** [Zernio](https://docs.zernio.com/) (`ZERNIO_API_KEY`; optional `ZERNIO_API_BASE`, `ZERNIO_WEBHOOK_SECRET`). Legacy env names `LATE_API_KEY` / `LATE_WEBHOOK_SECRET` and `POSTING_PROVIDER=late` still work as aliases. DB columns remain `late_profile_id` / `late_account_id` / `late_post_id` for now.

**Zernio webhooks:** `POST https://<app>/api/scheduler/webhooks` — use the same secret in Zernio’s “Secret key” field (signature header may still be labeled `X-Late-Signature` in their UI). Enable **Post failed** and **Account disconnected**. To ping specific admins in-app, set `ZERNIO_WEBHOOK_NOTIFY_EMAILS` (comma-separated, matches `users.email` for role admin, else `team_members.email` + linked `user_id`) and/or `ZERNIO_WEBHOOK_NOTIFY_USER_IDS` (auth UUIDs). Apply migration `068_account_disconnected_notification_type.sql` for the `account_disconnected` notification type.

## Commands

```bash
npm run dev          # Dev server (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npm run test:ad-library # Vitest — Meta Ad Library URL extraction (`extract-ad-library-urls`)
npx tsx scripts/test-ad-library-scrape.ts "<facebook ads library url>" # Live fetch + print extracted image URLs (no API/auth)
npm run ads:ecoview:50   # EcoView — 50 Nano “Meta performance mix” ads (CLI; Brand DNA guideline required)
npm run ads:ecoview:regenerate # EcoView — delete all global (Nano) creatives for the client, then queue 50 new ads (Brand DNA required)
# Goldback local PNGs → client gallery (CLI outputs never auto-link to a client):
#   GOLDBACK_IMPORT_DIR=~/Desktop/<Goldback-Idaho-Gemini-…> GOLDBACK_ADS_JSON=~/Desktop/Goldback-Meta-Top100/100-ads.generated.json GOLDBACK_CLIENT_ID=<uuid> npm run ads:goldback:import
#   Or omit CLIENT_ID if a single client matches slug `goldback` or name %goldback% (set GOLDBACK_CLIENT_SLUG if needed).
npm run ads:queue-nano-meta:dry # Print batch config only (any client: set NANO_META_CLIENT_ID, NANO_META_AD_COUNT)
npx tsc --noEmit     # Type-check
npm run kandy:upload # Local Kandy export folders → Supabase kandy_templates (see scripts/upload-kandy-templates.ts)
npm run kandy:analyze # Backfill prompt_schema for templates missing analysis
npm run supabase:migrate # Apply pending migrations (065+ by default; uses schema_migrations table; needs SUPABASE_DB_URL in .env.local)
npm run supabase:apply-065 # One-off: 065_brand_dna_jobs_updated_at.sql only
npm run supabase:apply-053 # Run migration 053 SQL via Postgres (needs SUPABASE_DB_URL in .env.local — Dashboard → Database → URI)
# `npm run dev` runs `predev` → `supabase:migrate` first (skips quietly if no DB URL).
npm run test:e2e       # Playwright — full matrix (see tests/*.spec.ts); dev server must return 200 on GET /api/health
npm run test:e2e:routes # Redirect + API security only (no login UI shells)
npm run test:e2e:shells # Login page UI smoke + health retry
# Full signed-in crawl (admin: all static routes + first client + history links + first presentation; portal: all static routes):
#   E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… npm run test:e2e
#   E2E_PORTAL_EMAIL=… E2E_PORTAL_PASSWORD=… npm run test:e2e
# PLAYWRIGHT_SKIP_WEBSERVER=1 — do not spawn `npm run dev` (use when you already have a server)
# PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 — alternate origin
```

## Reference Docs

Detailed docs live in `docs/` — read only when needed for the current task:

- **`docs/architecture.md`** — Routes, key directories, data flow, auth system
- **`docs/database.md`** — Table schemas, column details, credentials
- **`docs/api-patterns.md`** — All API routes with method/purpose
- **`docs/conventions.md`** — UI, copy, data safety, and performance patterns
- **`docs/detail-design-patterns.md`** — 56 curated UI/UX micro-interaction patterns from detail.design
- **`docs/spec-agency-tool.md`** — Original product spec
- **`docs/spec-client-engagement.md`** — Client engagement features spec
- **`docs/spec-pdr.md`** — PDR spec
- **`docs/MOODBOARD_PRD.md`** — Moodboard feature PRD

## Session Startup

Do these at the start of every session:

1. Run `git status` — if there are uncommitted changes, ask the user whether to commit, stash, or discard them before starting new work. Don't silently ignore dirty state.
2. Read **`todo.md`** — Current status, what's done, what's left, priorities
3. Reference **`docs/detail-design-patterns.md`** when implementing any UI component

## Memory System

This project uses **Ars Contexta** (`~/.claude/plugins/arscontexta/`). Key commands: `/arscontexta-help`, `/arscontexta-remember`, `/arscontexta-next`, `/arscontexta-health`

## Working Preferences

- **Plans are always approved** — proceed with implementation without asking for permission
- **Don't ask "is this plan good?"** — just build it

## Key Conventions

- API routes: Zod validation + auth check before processing
- Next.js 15 params: `params: Promise<{ id: string }>` (must `await params`)
- UI: dark theme, `bg-surface` cards on `bg-background`, blue accent (`accent-text`)
- Copy: **sentence case** everywhere
- AI responses: always null-safe (`?? []`, `?? ''`, `?? 0`)
- Admin: `createAdminClient()` (service role); Portal: scope by `organization_id`
- Charts: always `'use client'`
- See `docs/conventions.md` for full list

## Large Data Files (skip unless directly relevant)

- **`app/admin/nerd/api/api-docs-data.ts`** (2,600 lines) — Static API endpoint catalog for the docs viewer. Pure data, not logic. Only read when editing the API docs UI.
- **`docs/api-reference.md`** (1,594 lines) — Auto-generated API reference. Only read when verifying API documentation accuracy.
