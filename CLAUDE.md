# CLAUDE.md

## Project Overview

**Nativz Cortex** — dual-dashboard AI-powered topic research and content ideation platform for the Nativz marketing agency. Admin dashboard for the team + client portal for clients. Core problem: videographers show up on set without knowing what to film. This tool runs AI-powered topic research so they have trending topics and video ideas ready.

## Tech Stack

Next.js 15 (App Router) + TypeScript, Supabase (Postgres + Auth + pgvector), SearXNG (self-hosted), Claude Sonnet 4.5 via OpenRouter, Tailwind CSS v4, Recharts, lucide-react, Zod, Obsidian vault via GitHub API, Zernio (social posting), Stripe (billing).

## Daily Commands

```bash
npm run dev          # Dev server (Cortex on http://localhost:3001)
npm run build        # Production build
npm run lint         # ESLint
npx tsc --noEmit     # Type-check
npm run test:e2e     # Playwright matrix
```

Long-tail scripts (ads, kandy, migrations, e2e variants): see `docs/commands.md`.

## Reference Docs

Full doc index lives in `docs/`. Read on-demand based on the task:

- Architecture / routes / auth → `docs/architecture.md`
- DB schema, RLS, semantic memory layer → `docs/database.md`
- API patterns / route inventory → `docs/api-patterns.md` + `docs/api-reference.md`
- UI/copy/data conventions → `docs/conventions.md`
- UI micro-interaction patterns → `docs/detail-design-patterns.md`
- Topic search pipeline (SearXNG/OpenAI/OpenRouter, env vars) → `docs/topic-search.md`
- Zernio setup + webhook secret + notify env → `docs/zernio-setup.md`
- Revenue Hub + Stripe + Proposals → `docs/revenue.md`
- Vercel build-cache flag → `docs/vercel-build.md`
- Specs → `docs/spec-*.md`, `docs/MOODBOARD_PRD.md`
- Latest pass-off after a long break → newest `docs/session-passoff-*.md`

## Session Startup

1. **Check Linear.** The `SessionStart` hook runs `scripts/linear-todos.sh` and injects open issues assigned to Jack. If the list is non-empty, your *first* response asks which issue to work on (grouped by priority). Don't pick one unilaterally; don't start until Jack picks. If empty, proceed normally.
2. Run `git status` — if dirty, ask whether to commit, stash, or discard before starting new work.
3. Read `todo.md` for current status / priorities.
4. Reference `docs/detail-design-patterns.md` when implementing any UI component.

## Supabase MCP

When working on **schema, SQL, migrations, RLS, or Supabase dashboard-style DB tasks**, **prefer the Supabase MCP** (read tables, run read-safe SQL, docs) over guessing. Fall back to `docs/database.md` and `supabase/migrations/` when MCP is unavailable. Setup details: project ref `phypsgxszrvwdaaqpxup`; MCP install + auth steps in `docs/supabase-mcp.md` (one-time).

## Marketing Skills

For any marketing/CRO/copy/SEO/growth task, read `.agents/MARKETING-SKILLS.md` and the relevant `SKILL.md` first. Use `product-marketing-context` when product positioning matters.

## Working Preferences

- **Plans are always approved** — proceed with implementation without asking for permission.
- **Don't ask "is this plan good?"** — just build it.
- **Run the commands.** Whenever you would tell the user to run a terminal command (scripts, seeds, migrations, tests, typecheck, lint), run it yourself. Don't stop at "here's what to run." Exceptions: steps that truly require the user (browser-only auth, dashboard clicks, deploying from their account) — say so briefly, but still run everything that can run here.
- **Secrets in chat are fine.** Do not add disclaimers or "don't paste secrets" warnings unless explicitly asked for a security review. (`.env.local` stays gitignored.)
- **Run until ship-ready, not just code-ready.** When building or modifying any feature, keep working autonomously until it is ready to ship *and* visually + experientially consistent with the rest of the site. This is required, not a recommendation. Before reporting done, verify: (1) builds clean + types pass, (2) the new surface matches existing screens — same typography, spacing, component primitives (`bg-surface` cards, `accent-text`, button styles), dark theme tokens, sentence-case copy, layout density, loading/error states. **If the new screen looks like it came from a different app, it isn't done.** Pull patterns from existing screens before inventing new ones; reference `docs/detail-design-patterns.md` and the closest sibling page in the same area (`/admin/...` or `/portal/...`).

## Key Conventions

- API routes: Zod validation + auth check before processing
- Next.js 15 params: `params: Promise<{ id: string }>` (must `await params`)
- UI: dark theme, `bg-surface` cards on `bg-background`, blue accent (`accent-text`)
- Copy: **sentence case** in product UI (admin sidebar nav is the documented exception — Title Case there). Doc/file headings use Title Case.
- AI responses: always null-safe (`?? []`, `?? ''`, `?? 0`)
- Admin: `createAdminClient()` (service role); Portal: scope by `organization_id`
- Charts: always `'use client'`
- Full list: `docs/conventions.md`

## Task Delegation

Spawn subagents to isolate context, parallelize independent work, or offload bulk mechanical tasks. Don't spawn when the parent needs the reasoning, when synthesis requires holding things together, or when spawn overhead dominates.

Pick the cheapest model that can do the subtask well:
- Haiku: bulk mechanical work, no judgment
- Sonnet: scoped research, code exploration, in-scope synthesis
- Opus: subtasks needing real planning or tradeoffs

Subagents follow the same rules recursively, with two caps:
- Haiku does not spawn further subagents. If it needs to, the task was wrong-sized for Haiku — return to the parent.
- Max 3 tiers total (parent → subagent → one further tier). No nesting beyond that.

Don't escalate tiers without a concrete reason. If a subagent realizes it needs a higher tier than itself, return to the parent rather than spawning up.

Parent owns final output and cross-spawn synthesis. User instructions override.

## Preferred Tools

### Data Fetching

1. **WebFetch** — free, text-only, works on public pages that don't block bots.
2. **agent-browser CLI** (when installed — check with `which agent-browser`) — local Rust CLI + Chrome via CDP. For dynamic pages or auth walls. Returns accessibility tree with element refs — ~82% fewer tokens than screenshot tools. Install: `npm i -g agent-browser && agent-browser install`. If not installed, fall back to a Chrome MCP / Playwright tool.
3. **Notice recurring fetch patterns and propose wrapping them as dedicated tools.** When the same fetch/parse logic comes up more than once, suggest wrapping it as a named tool (e.g. a skill file or a `.py` script that calls `agent-browser` with the snapshot and extraction steps baked in). Reference it by name on future calls.

### PDF Files

Use `pdftotext`, not the `Read` tool. Use `Read` only when the user directly asks to analyze images or charts inside the document.

## Large Data Files (skip unless directly relevant)

- `app/admin/nerd/api/api-docs-data.ts` + `docs/api-reference.md` — both auto-generated from `app/api/**/route.ts` by `scripts/generate-api-docs.ts`. Do not edit by hand. Run `npm run docs:api` after adding/removing routes or tweaking the JSDoc block above an exported HTTP method.

## Portal Security (CRITICAL)

**Every API route that a portal user (role=`viewer`) can hit MUST scope data by `organization_id`.**

- Portal users are scoped via `user_client_access` table → `organization_id`
- Use `getPortalClient()` (from `lib/portal/get-portal-client.ts`) in portal pages to get the user's client + org
- API routes: check `users.organization_id` and filter results accordingly. Never return unscoped data to non-admin users.
- `createAdminClient()` bypasses RLS — if using it, you MUST manually enforce org scoping in the query
- `createServerSupabaseClient()` respects RLS — prefer this for portal-facing routes when possible
- Supabase RLS is enabled on all tables with admin + viewer policies. The `topic_searches` table has org-scoped RLS.

**Pattern for API route scoping:**
```typescript
const { data: userData } = await adminClient
  .from('users')
  .select('role, organization_id')
  .eq('id', user.id)
  .single();

const isAdmin = userData?.role === 'admin';
if (!isAdmin) {
  query = query.eq('clients.organization_id', userData.organization_id);
}
```

## Roles

| Role | Access | Scoping |
|------|--------|---------|
| `admin` / `super_admin` | Full admin dashboard, all clients | No org filter |
| `viewer` | Portal only, research + settings | Scoped to their `organization_id` |

## Short-form Video Focus

Cortex is exclusively for **short-form video content** (TikTok, Reels, Shorts). All topic search results, video analysis, content ideas, and scripting assume short-form vertical video. Never reference long-form content in user-facing copy.

## Current Deploy

Vercel at `cortex.nativz.io` · Supabase project `phypsgxszrvwdaaqpxup` · SearXNG on `localhost:8888` (Mac mini, not in production) · ReClip on `localhost:8899` (video downloader, Mac mini).

## Task Specs

For complex features, check the `tasks/` directory for detailed specs. Build from specs without asking for confirmation.

## Long-running sessions

Auto-compaction is configured (threshold lowered to 80% per `490221a4`). You can run multi-phase, multi-day phased builds continuously without worrying about the context window — old turns are summarized as needed. When Jack approves a multi-phase plan ("continue on phase 1-4 until you're done"), execute every phase end-to-end with the verify gates per phase (typecheck + lint + dev visual + `/audit` + commit), pausing only for genuine blockers (missing creds, browser-only auth, destructive ops). No "stopping for the night" prompts; no "should I continue?" — just keep shipping.
