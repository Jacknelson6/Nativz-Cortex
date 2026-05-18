# CLAUDE.md

## What this app is

Nativz Cortex is a dual-dashboard SaaS for the Nativz social media marketing agency. The admin dashboard is the internal team's workflow hub; the portal is the client-facing view. The core problem is that videographers show up on set without knowing what to film, so Cortex runs AI-powered topic research, format ideation, and content scheduling so they have trending topics and video ideas ready. Cortex is for **short-form video only** (TikTok, Reels, Shorts). Never reference long-form in user-facing copy.

## Stack

- Framework: Next.js 15 (App Router) · TypeScript
- Styling: Tailwind v4 (inline `@theme` in `app/globals.css`, no `tailwind.config.js`)
- Data: Supabase (Postgres + Auth + pgvector + RLS)
- AI: Claude Sonnet 4.5 via OpenRouter
- Search: SearXNG (self-hosted, Mac mini)
- Posting: Zernio
- Billing: Stripe
- Hosting: Vercel (`cortex.nativz.io`); Supabase project ref `phypsgxszrvwdaaqpxup`
- Package manager: npm
- Tests: Vitest (unit) · Playwright (e2e)

## Hard rules

1. **No em dashes.** Anywhere. U+2014 (em dash) and U+2013 (en dash) are banned in code, copy, commit messages, chat, markdown, comments. Use commas, periods, colons, parentheses, or a regular hyphen `-`. Date ranges read "Jan 1 to Jan 7", not "Jan 1 to 7" with a fancy dash. Audit your output before sending.
2. **No new primitive components.** Always import from `@/components/ui`. Run `ls components/ui` and grep `components/ui/COMPONENTS.md` before writing any new UI file. If a primitive almost fits, extend its variants rather than forking.
3. **No arbitrary Tailwind values.** No `p-[13px]`, no `text-[#abc]`, no raw palette colors (`bg-slate-900`, `text-gray-400`). Use semantic tokens documented in `DESIGN_SYSTEM.md`. Carve-outs (user-supplied hex, brand-mode overrides) must be deliberate and obvious from context.
4. **Reuse before build.** Before any UI work, check `components/ui/COMPONENTS.md` and `DESIGN_SYSTEM.md`. Before any feature work, check the closest sibling page (admin or portal) for an existing pattern.
5. **Enumerate edge cases up front.** Before implementing any feature: loading, empty, error, permission-denied, mobile, 0/1/many items. Use `<Skeleton />`, `<EmptyState />`, `<PageError />` primitives, not ad-hoc divs.
6. **Portal routes scope by `organization_id`.** Every API route a portal user (role `viewer`) can hit must filter by org. Use `getPortalClient()` (from `lib/portal/get-portal-client.ts`) in portal pages. `createAdminClient()` bypasses RLS - if you use it, manually scope every query. Prefer `createServerSupabaseClient()` for portal-facing routes.
7. **API routes: Zod + auth + null-safe.** Zod input validation, `supabase.auth.getUser()`, null-safe AI response fields (`?? []`, `?? ''`, `?? 0`), `NextResponse.json()`, proper HTTP status codes. See `.claude/rules/api-routes.md`. Dynamic params are `params: Promise<{ id: string }>` - must `await params`.
8. **Sentence case** in product UI. Title Case is reserved for the admin sidebar nav (documented exception) and document/file headings.
9. **Charts are `'use client'`.** Recharts components must live in client components.
10. **Plans are approved on output.** Don't ask "is this plan good?". Plan mode is required for features touching more than two files; once you exit plan mode, build it.
11. **Run the commands yourself.** Don't tell the user "here's what to run." Run typecheck, lint, migrations, seeds, tests yourself. Exceptions: browser-only auth, dashboard clicks, deploys from their account.
12. **Run `npm run verify` before declaring done.** Verify wraps `lint + tsc --noEmit + build`. If it fails, fix and re-run - don't ship a broken build.
13. **Run until ship-ready, not just code-ready.** Before reporting done: builds clean, types pass, visually consistent with sibling screens (tokens, spacing, primitives, loading/error states). If the new screen looks like it came from a different app, it isn't done.

## Workflow

Spec (when one exists in `tasks/` or `docs/`) → plan (plan mode for >2-file changes) → build (parallel reads, dedicated tools over Bash) → review (read changed files, optionally spawn the `rules-reviewer` agent on the diff) → verify (`npm run verify`) → commit on the working branch. Subagents are for context isolation, parallel research, or bulk mechanical work; pick the cheapest tier that can do the task. Use Supabase MCP for schema/RLS/migration tasks before guessing.

## File map

- `app/admin/*` - admin dashboard pages (Nativz team)
- `app/portal/*` - client portal pages (scoped by `organization_id`)
- `app/(app)/*` - shared logged-in surfaces (results, scheduler, audit)
- `app/api/*` - API routes (618 currently; Zod + auth + org-scope per rule 6/7)
- `app/auth/*`, `app/login`, `app/forgot-password`, `app/reset-password`, `app/join` - auth flows
- `app/present`, `app/p`, `app/c`, `app/r`, `app/s` - public share surfaces
- `app/onboarding`, `app/connect`, `app/comptroller` - onboarding, integration, financial
- `components/ui/*` - primitives (single source of truth; see `COMPONENTS.md`)
- `components/{layout,shared,admin,portal,...}/*` - composed + feature components by domain
- `lib/*` - utilities, auth helpers (`get-portal-client.ts`, admin/server client factories)
- `supabase/migrations/*` - SQL migrations (applied via `npm run supabase:migrate`)
- `docs/*` - reference docs (see Pointers)
- `scripts/*` - tooling (ads, kandy, seeds, migrations, audits)
- `tests/*` - Playwright e2e (auth crawls, redirects, security, smoke)
- `tasks/*` - feature specs to build from without asking
- `.claude/*` - agent harness config (hooks, agents, rules, skills)

## Pointers

- [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) - short token + scale reference. Read before any UI work.
- [`components/ui/COMPONENTS.md`](components/ui/COMPONENTS.md) - primitive catalog with props + usage. Read before adding any component.
- [`FOUNDATION_AUDIT.md`](FOUNDATION_AUDIT.md) - inventory + flagged future consolidation work.
- [`docs/architecture.md`](docs/architecture.md) - App Router layout, route groups, auth.
- [`docs/database.md`](docs/database.md) - Supabase schema, RLS policies, semantic memory layer.
- [`docs/api-patterns.md`](docs/api-patterns.md) - HTTP conventions, route inventory.
- [`docs/conventions.md`](docs/conventions.md) - full UI/copy/data conventions (extends rule 8).
- [`docs/detail-design-patterns.md`](docs/detail-design-patterns.md) - micro-interaction patterns (motion, focus, hover).
- [`docs/design-tokens.md`](docs/design-tokens.md) - canonical token reference (every brand-mode override, every carve-out).
- [`docs/topic-search.md`](docs/topic-search.md) - SearXNG + OpenRouter pipeline, env vars.
- [`docs/email-style.md`](docs/email-style.md) - required before authoring any email sender.
- [`docs/zernio-setup.md`](docs/zernio-setup.md) - Zernio webhook, notify env.
- [`docs/revenue.md`](docs/revenue.md) - Revenue Hub, Stripe, proposals.
- [`docs/supabase-mcp.md`](docs/supabase-mcp.md) - MCP install + auth (one-time).
- [`docs/commands.md`](docs/commands.md) - long-tail scripts.
- [`.claude/rules/api-routes.md`](.claude/rules/api-routes.md) - API route validation + auth + scoping rules.
- [`.claude/agents/rules-reviewer.md`](.claude/agents/rules-reviewer.md) - strict diff-vs-rules reviewer (PASS or numbered violations).
