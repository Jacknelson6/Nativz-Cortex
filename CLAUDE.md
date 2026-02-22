# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Nativz Cortex** is a dual-dashboard AI-powered topic research and content ideation platform built for the Nativz marketing agency. It has two interfaces: an **admin dashboard** for the Nativz team to manage clients, run searches, and approve reports, and a **client portal** where clients can run their own searches and view approved reports.

The core problem: videographers show up on set without knowing what to film. This tool runs AI-powered topic research 72 hours before a shoot so the videographer has trending topics and specific video ideas ready to go.

## Tech Stack

- **Framework:** Next.js 15 (App Router) + TypeScript
- **Hosting:** Vercel
- **Database:** Supabase (Postgres + Auth)
- **Search Data:** Brave Search API (web results, discussions, videos)
- **AI:** Claude Sonnet 4.5 via OpenRouter (structures Brave SERP data into reports)
- **Styling:** Tailwind CSS v4
- **Charts:** Recharts
- **Icons:** lucide-react
- **Validation:** Zod
- **Vault:** Obsidian-style markdown notes synced via GitHub API

## Common Commands

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
npx tsc --noEmit     # Type-check without emitting
```

## Architecture

### Route Structure

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

**API routes:**
- `POST /api/search/start` — Kick off topic search (creates record, returns ID)
- `POST /api/search/[id]/process` — Execute search (Brave → Claude → store results)
- `GET /api/search/[id]` — Retrieve stored search result
- `PATCH /api/search/[id]` — Approve/reject search (admin only)
- `GET /api/clients` — List clients (admin) or get own org's clients (portal)
- `POST /api/clients` — Create client (admin)
- `PATCH /api/clients/[id]` — Update client settings (admin)
- `POST /api/clients/upload-logo` — Upload client logo image
- `POST /api/clients/analyze-url` — Analyze client website URL to auto-fill profile
- `GET/PATCH /api/clients/preferences` — Client brand preferences
- `POST /api/invites` — Generate portal invite token (admin)
- `GET /api/invites/validate` — Check if invite token is valid
- `POST /api/invites/accept` — Accept invite and create portal user account
- `GET/POST /api/ideas` — Idea submissions CRUD
- `PATCH /api/ideas/[id]` — Update idea status (approve/reject)
- `POST /api/auth/logout` — Sign out
- `/api/vault/*` — Vault provisioning, sync, search, indexing
- `/api/monday/*` — Monday.com webhook + sync

### Key Directories

- `lib/brave/` — Brave Search API client (`client.ts`) and response types (`types.ts`)
- `lib/ai/` — OpenRouter API client (`client.ts`) and JSON parser (`parse.ts`)
- `lib/supabase/` — Supabase clients: `client.ts` (browser), `server.ts` (server), `admin.ts` (service role), `middleware.ts` (auth + role routing)
- `lib/prompts/` — AI prompt templates: `topic-research.ts` (general), `client-strategy.ts` (brand-aware), `brand-context.ts` (shared brand context builder)
- `lib/types/search.ts` — TypeScript interfaces for topic search flow
- `lib/types/database.ts` — Database table interfaces (clients, reports, etc.)
- `lib/utils/` — Formatting helpers, sentiment utilities, metrics computation
- `lib/vault/` — Obsidian vault integration: `github.ts` (GitHub API), `reader.ts` (read client profiles), `sync.ts` (write search results), `formatter.ts` (markdown formatting), `parser.ts` (parse vault notes), `indexer.ts` (search indexing)
- `lib/monday/` — Monday.com integration: `client.ts` (API), `sync.ts` (data sync)
- `lib/portal/get-portal-client.ts` — Resolve current portal user's client + org
- `lib/brand.ts` — Nativz branding constants
- `lib/tooltips.ts` — Tooltip content strings
- `components/layout/` — Admin sidebar, portal sidebar, shared header, mobile sidebar, notification bell, sidebar account
- `components/ui/` — Base UI components (Button, Card, Input, Badge, Select, Dialog, GlassButton, GlowButton, Toggle, ImageUpload, TagInput, etc.)
- `components/charts/` — Recharts chart components (activity-chart, trend-line)
- `components/results/` — Result page sections (metrics-row, emotions-breakdown, content-breakdown, content-pillars, niche-insights, sources-panel, trending-topics-table, topic-row-expanded, video-idea-card)
- `components/search/` — Search components: `search-mode-selector.tsx` (dual-card selector), `search-processing.tsx` (progress animation), `filter-chip.tsx`, `client-selector.tsx`, `history-filters.tsx`
- `components/ideas/` — Idea triage list, idea cards, idea submit dialog
- `components/clients/` — Client search grid, invite button
- `components/reports/executive-summary.tsx` — AI summary card
- `components/shared/` — Stat cards, loading skeletons, empty-state, page-error
- `components/preferences/` — Brand preferences form

### Data Flow

1. User picks "Brand intel" or "Topic research" on the search page (dual-card UI)
2. `POST /api/search/start` creates a `topic_searches` record with `status: 'processing'` and `search_mode` field
3. Client is redirected to the processing page which calls `POST /api/search/[id]/process`
4. Process route: Brave Search API (3 parallel calls) → builds prompt (with optional client context) → Claude via OpenRouter → parses JSON → validates source URLs against SERP → computes metrics → stores results
5. Processing page polls for completion, then redirects to results page
6. Admin can approve a completed search → sets `approved_at` → client portal users can now see it
7. Completed searches are auto-synced to Obsidian vault via GitHub (non-blocking)

### Auth & Roles

- Supabase Auth with email/password
- Two roles in `users` table: `admin` (Nativz team) and `viewer` (client users)
- `middleware.ts` protects all `/admin/*` and `/portal/*` routes
- Admins can only access `/admin/*`; viewers redirected to `/portal/*`
- Public routes: `/admin/login`, `/portal/login`, `/portal/join/*` (invite signup)
- Legacy routes (`/`, `/login`, `/search/*`, `/history`) redirect to admin login
- Role cached in httpOnly cookie (`x-user-role`, 10 min) to avoid DB query per request

### Database Tables

**`topic_searches`** — Core table for search queries and AI-generated results:
- `query`, `source`, `time_range`, `language`, `country` — Search parameters
- `client_id` — Optional client attachment
- `search_mode` — `'general'` or `'client_strategy'`
- `status` — pending, processing, completed, failed
- `summary`, `metrics`, `emotions`, `content_breakdown`, `trending_topics` — Parsed AI response sections
- `serp_data` — Raw Brave SERP data for reference
- `approved_at`, `approved_by` — Admin approval tracking
- `raw_ai_response` — Full AI response for debugging
- `tokens_used`, `estimated_cost` — Usage tracking

**`clients`** — Client records:
- `name`, `slug`, `industry`, `target_audience`, `brand_voice`, `topic_keywords`, `website_url`
- `organization_id` — Links to an organization for portal access
- `feature_flags` JSONB: `{ "can_search", "can_view_reports", "can_edit_preferences", "can_submit_ideas" }`
- `preferences` JSONB — Brand preferences (content types, posting frequency, etc.)
- `is_active` — Soft delete flag

**`users`** — App users:
- `role` — `'admin'` or `'viewer'`
- `organization_id` — Links viewer to their client org
- `full_name`, `avatar_url`

**`invite_tokens`** — Portal invite links:
- `token` — Unique hex string (auto-generated)
- `client_id`, `organization_id` — Links invite to a client
- `expires_at` — 7-day default expiry
- `used_at`, `used_by` — One-time use tracking
- `created_by` — Admin who generated the invite

**`ideas`** — Video idea submissions with status tracking

## Credentials Needed

1. **Supabase:**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. **OpenRouter:**
   - `OPENROUTER_API_KEY`
   - `OPENROUTER_MODEL` (default: `anthropic/claude-sonnet-4-5`)

3. **Brave Search:**
   - `BRAVE_SEARCH_API_KEY`

4. **Vercel:**
   - `NEXT_PUBLIC_APP_URL`

5. **Vault (GitHub):**
   - `VAULT_GITHUB_TOKEN`
   - `VAULT_GITHUB_OWNER`
   - `VAULT_GITHUB_REPO`

## Session startup

At the start of every session, read these files to orient:

1. **`detail-design-patterns.md`** — 56 curated UI/UX patterns from detail.design applicable to this project. Reference this when implementing any new UI component or interaction to ensure we're applying best-practice micro-interactions and polish.
2. **`todo.md`** — Current project status, what's done, what's left, and priorities.

## Memory system

This project uses **Ars Contexta** as its persistent memory system. The plugin is installed at `~/.claude/plugins/arscontexta/` with all 26 skills available via `/arscontexta-*` commands. Key commands:

- `/arscontexta-setup` — Initialize the knowledge vault (run once)
- `/arscontexta-help` — See all available commands
- `/arscontexta-remember` — Capture friction, corrections, or learnings
- `/arscontexta-next` — Get the most valuable next action
- `/arscontexta-health` — Run vault diagnostics

## Working preferences

- **Plans are always approved** — proceed with implementation without asking for permission. The user trusts your judgment.
- **Don't ask "is this plan good?"** — just build it.

## Conventions

- All chart components are client components (`'use client'`)
- API routes validate input with Zod schemas and check auth before processing
- Dynamic route params in Next.js 15 use `params: Promise<{ id: string }>` pattern (must `await params`)
- Search data gathered via Brave Search API (`lib/brave/client.ts`), then structured by Claude via OpenRouter (`lib/ai/client.ts`)
- UI uses dark theme with card-based layout: `bg-surface` cards on `bg-background`, blue accent (`accent-text`) for active states and CTAs
- All UI copy uses **sentence case** (only capitalize first word + proper nouns)
- Use `getSentimentColorClass(score)` and `getSentimentBadgeVariant(score)` from `lib/utils/sentiment.ts`
- Use the `interactive` prop on `<Card>` for any card wrapped in a `<Link>`
- Error messages follow the pattern: what happened + what to do next
- Empty states always include guidance on what the user should do
- Button labels start with a verb and name the specific action
- Admin pages use `createAdminClient()` (service role) for unrestricted data access
- Portal pages scope data to the user's organization via `organization_id`
- AI response fields must always use null safety (`?? []`, `?? ''`, `?? 0`) — Claude sometimes returns incomplete JSON
- Performance: vault GitHub fetches use `next: { revalidate: 300 }` (5 min cache), layout user data uses `unstable_cache()`, middleware role uses httpOnly cookie
- Glass buttons (`components/ui/glass-button.tsx`) for primary search actions; glow buttons (`components/ui/glow-button.tsx`) for settings CTAs
- Brand colors: blue (`#046BD2` / `rgba(4, 107, 210, ...)`) and purple (`#8B5CF6` / `rgba(139, 92, 246, ...)`)
