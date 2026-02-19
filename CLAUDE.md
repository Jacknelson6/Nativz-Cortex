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
- `/admin/clients/[slug]` — Client detail (info, recent searches)
- `/admin/clients/[slug]/settings` — Client feature toggles, industry, brand info
- `/admin/search/new` — Run a new topic search (with client selector)
- `/admin/search/[id]` — View search results + approve/reject
- `/admin/search/history` — All searches across clients

**Portal** (`/portal/*`):
- `/portal/login` — Client login
- `/portal/dashboard` — Welcome, recent approved reports, quick search
- `/portal/search/new` — Run a topic search (scoped to client's org)
- `/portal/search/[id]` — View search results (read-only)
- `/portal/reports` — Approved reports list
- `/portal/settings` — View profile, industry terms, brand info

**API routes:**
- `POST /api/search` — Execute topic search (Brave Search → Claude → store)
- `GET /api/search/[id]` — Retrieve stored search result
- `PATCH /api/search/[id]` — Approve/reject search (admin only)
- `GET /api/clients` — List clients (admin) or get own org's clients (portal)
- `POST /api/clients` — Create client (admin)
- `PATCH /api/clients/[id]` — Update client settings (admin)
- `POST /api/auth/logout` — Sign out

### Key Directories

- `lib/brave/` — Brave Search API client (`client.ts`) and response types (`types.ts`)
- `lib/ai/` — OpenRouter API client (`client.ts`) and JSON parser (`parse.ts`)
- `lib/supabase/` — Supabase clients: `client.ts` (browser), `server.ts` (server), `admin.ts` (service role), `middleware.ts` (auth + role routing)
- `lib/prompts/topic-research.ts` — AI prompt template (accepts Brave SERP data)
- `lib/types/search.ts` — TypeScript interfaces for topic search flow
- `lib/types/database.ts` — Database table interfaces (clients, reports, etc.)
- `lib/utils/` — Formatting helpers, sentiment utilities
- `lib/brand.ts` — Nativz branding constants
- `components/layout/` — Admin sidebar, portal sidebar, shared header
- `components/ui/` — Base UI components (Button, Card, Input, Badge, Select, Dialog)
- `components/charts/` — Recharts chart components (activity-chart, trend-line)
- `components/results/` — Result page sections (metrics-row, emotions-breakdown, content-breakdown, trending-topics-table, topic-row-expanded, video-idea-card)
- `components/search/` — Search form components (search-form, filter-chip, client-selector)
- `components/reports/executive-summary.tsx` — AI summary card
- `components/shared/` — Stat cards, loading skeletons, empty-state
- `supabase/schema.sql` — Full database schema

### Data Flow

1. User enters a topic on the search page with optional filters (source, time range, language, country, client)
2. `POST /api/search` → calls Brave Search API (3 parallel calls: web, discussions, videos) → builds prompt with SERP data → calls Claude via OpenRouter → parses structured JSON → stores in `topic_searches` → returns ID
3. User is redirected to the results page where the server component fetches results and renders all sections
4. Admin can approve a completed search → sets `approved_at` → client portal users can now see it

### Auth & Roles

- Supabase Auth with email/password
- Two roles in `users` table: `admin` (Nativz team) and `viewer` (client users)
- `middleware.ts` protects all `/admin/*` and `/portal/*` routes
- Admins can only access `/admin/*`; viewers redirected to `/portal/*`
- Login pages (`/admin/login`, `/portal/login`) are public
- Legacy routes (`/`, `/login`, `/search/*`, `/history`) redirect to admin login

### Database Tables

**`topic_searches`** — Core table for search queries and AI-generated results:
- `query`, `source`, `time_range`, `language`, `country` — Search parameters
- `client_id` — Optional client attachment
- `status` — pending, processing, completed, failed
- `summary`, `metrics`, `activity_data`, `emotions`, `content_breakdown`, `trending_topics` — Parsed AI response sections
- `approved_at`, `approved_by` — Admin approval tracking
- `raw_ai_response` — Full AI response for debugging
- `tokens_used`, `estimated_cost` — Usage tracking

**`clients`** — Client records with `feature_flags` JSONB column:
- `feature_flags`: `{ "can_search": true, "can_view_reports": true }`

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

## Conventions

- All chart components are client components (`'use client'`)
- API routes validate input with Zod schemas and check auth before processing
- Dynamic route params in Next.js 15 use `params: Promise<{ id: string }>` pattern (must `await params`)
- Search data gathered via Brave Search API (`lib/brave/client.ts`), then structured by Claude via OpenRouter (`lib/ai/client.ts`)
- UI follows a card-based pattern: white cards on `bg-gray-50`, indigo accent for active states and CTAs
- All UI copy uses **sentence case** (only capitalize first word + proper nouns)
- Use `getSentimentColorClass(score)` and `getSentimentBadgeVariant(score)` from `lib/utils/sentiment.ts`
- Use the `interactive` prop on `<Card>` for any card wrapped in a `<Link>`
- Error messages follow the pattern: what happened + what to do next
- Empty states always include guidance on what the user should do
- Button labels start with a verb and name the specific action
- Admin pages use `createAdminClient()` (service role) for unrestricted data access
- Portal pages scope data to the user's organization via `organization_id`
- `SearchForm` accepts `redirectPrefix` prop (`"/admin"` or `"/portal"`) for routing
