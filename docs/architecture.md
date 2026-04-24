# Architecture

## Route Structure

**Admin** (`/admin/*`):
- `/admin/login` — Admin login
- `/admin/dashboard` — Overview stats, recent searches, quick actions
- `/admin/clients` — Client list
- `/admin/clients/[slug]` — Client detail (vault-powered profile, recent searches, invite button)
- `/admin/clients/[slug]/settings` — Client feature toggles, industry, brand info, logo upload
- `/admin/search/new` — Dual-mode search: Brand intel + Topic research cards
- `/admin/search/[id]` — View search results + approve/reject
- `/admin/search/[id]/processing` — Animated progress while AI processes
- `/admin/search/history` — All searches across clients
- `/admin/settings` — Admin account settings
- `/admin/shoots` — Shoot management and scheduling
- `/admin/moodboard` — Visual moodboards with AI analysis
- `/admin/analytics` — Instagram analytics dashboard
- `/admin/calendar` — Calendar integration

**Portal** (`/portal/*`):
- `/portal/login` — Client login
- `/portal/join/[token]` — Invite signup (public, no auth required)
- `/portal/dashboard` — Welcome, recent approved reports, quick search
- `/portal/search/new` — Dual-mode search (brand card pre-filled with client)
- `/portal/search/[id]` — View search results (read-only)
- `/portal/reports` — Approved reports list
- `/portal/settings` — View profile
- `/portal/preferences` — Edit brand preferences
- `/portal/ideas` — Idea submissions

**Shared** (`/shared/*`):
- `/shared/search/[token]` — Public shared search results
- `/shared/moodboard/[token]` — Public shared moodboard

**API routes** — see `docs/api-patterns.md`

## Key Directories

- `lib/ai/` — OpenRouter API client (`client.ts`) and JSON parser (`parse.ts`)
- `lib/brave/` — Brave Search API client (`client.ts`) and response types (`types.ts`)
- `lib/supabase/` — Supabase clients: `client.ts` (browser), `server.ts` (server), `admin.ts` (service role), `middleware.ts` (auth + role routing)
- `lib/prompts/` — AI prompt templates: `topic-research.ts`, `client-strategy.ts`, `brand-context.ts`, `onboard-strategy.ts`, `shoot-plan.ts`
- `lib/types/` — TypeScript interfaces: `search.ts`, `database.ts`, `moodboard.ts`, `strategy.ts`
- `lib/utils/` — Formatting helpers, sentiment utilities, metrics computation
- `lib/vault/` — Obsidian vault integration: `github.ts`, `reader.ts`, `sync.ts`, `formatter.ts`, `parser.ts`, `indexer.ts`, `content-memory.ts`
- `lib/monday/` — Monday.com integration: `client.ts` (API), `sync.ts` (data sync)
- `lib/moodboard/` — Moodboard processing: `process-video.ts`
- `lib/google/` — Google Calendar integration
- `lib/instagram/` — Instagram API client
- `lib/meta/` — Meta/Facebook API client and types
- `lib/portal/get-portal-client.ts` — Resolve current portal user's client + org
- `lib/brand.ts` — Nativz branding constants
- `lib/tooltips.ts` — Tooltip content strings
- `components/ui/` — Base UI primitives (Button, Card, Input, Badge, Select, Dialog, etc.)
- `components/layout/` — Admin sidebar, portal sidebar, shared header, mobile sidebar
- `components/results/` — Search result page sections
- `components/search/` — Search form, mode selector, processing, filters
- `components/moodboard/` — Moodboard nodes, edges, panels, modals
- `components/shared/` — Cross-feature: stat cards, loading skeletons, empty-state, breadcrumbs

## Data Flow (Search)

1. User picks "Brand intel" or "Topic research" on the search page (dual-card UI)
2. `POST /api/search/start` creates a `topic_searches` record with `status: 'processing'` and `search_mode` field
3. Client is redirected to the processing page which calls `POST /api/search/[id]/process`
4. Process route: Brave Search API (3 parallel calls) → builds prompt (with optional client context) → Claude via OpenRouter → parses JSON → validates source URLs against SERP → computes metrics → stores results
5. Processing page polls for completion, then redirects to results page
6. Admin can approve a completed search → sets `approved_at` → client portal users can now see it
7. Completed searches are auto-synced to Obsidian vault via GitHub (non-blocking)

## Auth & Roles

- Supabase Auth with email/password
- Two roles in `users` table: `admin` (Nativz team) and `viewer` (client users)
- `middleware.ts` protects all `/admin/*` and `/portal/*` routes
- Admins can only access `/admin/*`; viewers redirected to `/portal/*`
- Public routes: `/admin/login`, `/portal/login`, `/portal/join/*` (invite signup)
- Legacy routes (`/`, `/login`, `/search/*`, `/history`) redirect to admin login
- Role cached in httpOnly cookie (`x-user-role`, 10 min) to avoid DB query per request
