# Cortex Claude Code Skills — Design Spec

## Overview

Three custom Claude Code skills for Nativz Cortex that accelerate development and catch project-specific mistakes. Built as full skill folders (not just markdown) following Anthropic's internal skill patterns.

All skills are local folders in `.claude/skills/` (not symlinks).

---

## Skill 1: `cortex-route`

**Purpose:** Scaffold a complete API route file with correct boilerplate for the project's exact patterns.

**Description (trigger):** "Use when creating a new API route, endpoint, or handler. Covers standard, admin-only, portal, cron, and public variants with correct auth, validation, error handling, and usage tracking for this project."

**Variants (user picks or skill infers from context):**

| Variant | Auth | Client | Scoping | Key detail |
|---------|------|--------|---------|------------|
| `standard` | `supabase.auth.getUser()` | `createServerSupabaseClient()` only | None | User-scoped Supabase client. Only add `createAdminClient()` if bypassing RLS is needed. |
| `admin` | getUser + `verifyAdmin()` | Admin client | Admin-only | Uses `verifyAdmin()` helper (checks `users.role === 'admin'`). Extract to shared util if not already. |
| `portal` | getUser + org check | Admin client | `organization_id` | Uses `getPortalClient()` from `lib/portal/get-portal-client.ts`. Some older routes do inline org queries — new routes must use the helper. |
| `cron` | Bearer token | Admin client | None | Checks `CRON_SECRET` header. No user context. Always set `export const maxDuration`. |
| `public` | None | Varies | None | For webhooks, shared token routes, public endpoints. Zod validation only, no auth. |

**What every template includes:**
- Route file at correct path under `app/api/`
- Zod schema stub with field comments
- JSDoc with `@auth`, `@body`/`@query`, `@returns` annotations
- `try/catch` wrapping the full handler body
- `console.error('METHOD /api/path error:', error)` in catch block
- `{ error: 'Internal server error' }` with status 500 as fallback
- `export const maxDuration = N` for routes calling external services or AI (default 60 for cron, 30 for AI routes)
- Correct Next.js 15 dynamic params (`Promise<{ id: string }>`) for dynamic routes
- `NextRequest` import only when needed (body parsing, header access). GET routes without params use bare `()`

**What it adds conditionally:**
- `logUsage()` call if the route calls a tracked service (service type from `TrackedService` in `lib/ai/usage.ts`: `'openrouter' | 'groq' | 'gemini' | 'brave' | 'apify' | 'cloudflare' | 'resend' | 'youtube'`)
- `userId`/`userEmail` threading for usage tracking (only if user auth is present)
- `?? []`, `?? ''`, `?? 0` null-safety for AI response fields

**Skill folder structure:**
```
.claude/skills/cortex-route/
├── SKILL.md              # When to use, variant selection logic, examples
├── config.json           # Default variant, tracked services list
└── references/
    ├── templates/
    │   ├── standard.ts   # User-scoped supabase client + Zod
    │   ├── admin.ts      # + verifyAdmin() role gate
    │   ├── portal.ts     # + getPortalClient() org scoping
    │   ├── cron.ts       # Bearer token + maxDuration
    │   └── public.ts     # No auth, Zod only
    └── gotchas.md        # Common mistakes when creating routes
```

**Key gotchas to encode:**
- Always `await params` (Next.js 15)
- Always validate with Zod before accessing data
- Standard routes use `createServerSupabaseClient()` NOT `createAdminClient()` by default
- Portal routes must use `getPortalClient()` not inline org queries
- Cron routes check `CRON_SECRET` not user auth, always set `maxDuration`
- AI response fields need `?? []`, `?? ''`, `?? 0`
- Error log format: `console.error('METHOD /api/path error:', error)`
- `NextRequest` import only needed for body/header access

---

## Skill 2: `cortex-review`

**Purpose:** Adversarial code review tuned to this project's specific conventions.

**Description (trigger):** "Use when editing or writing API routes or lib files. Checks auth-before-data, portal org scoping, Zod validation, AI null-safety, usage tracking, error format, and maxDuration. Catches the specific mistakes that happen in this codebase."

**Trigger:** PreToolUse hook on `Edit` and `Write` to files matching `app/api/**/*.ts` and `lib/**/*.ts`. Also invocable manually.

**Checks (ordered by severity):**

### Critical (block)
1. **Auth before data** — Every API route must call `supabase.auth.getUser()`, check `CRON_SECRET`, or be explicitly public before any DB query or external call
2. **Portal org scoping** — Routes under `app/api/portal/` must scope all queries by `organization_id` via `getPortalClient()`
3. **Zod before processing** — Request body/params validated with `.safeParse()` before use

### Warning (flag)
4. **AI null-safety** — Fields from AI responses (OpenRouter, Gemini) use `?? []`, `?? ''`, or `?? 0`
5. **Usage tracking** — Routes calling tracked services (`TrackedService` type) have `logUsage()` with `userId`/`userEmail`
6. **Error responses** — Return `NextResponse.json({ error: string })` not raw strings or empty bodies
7. **Dynamic params** — Uses `params: Promise<{ id: string }>` then `await params`
8. **Error log format** — Catch blocks use `console.error('METHOD /api/path error:', error)` format
9. **maxDuration** — Routes calling external services or AI have `export const maxDuration`
10. **Admin client scope** — `createAdminClient()` only used when bypassing RLS is necessary. Standard routes should use `createServerSupabaseClient()`

### Info (note)
11. **Missing JSDoc** — Route handlers should have `@auth`, `@body`/`@query`, `@returns`

**Skill folder structure:**
```
.claude/skills/cortex-review/
├── SKILL.md              # Checklist, severity levels, when to trigger
├── config.json           # Which checks are enabled, severity overrides
└── references/
    ├── checklist.md      # Full check descriptions with correct/incorrect examples
    └── patterns.md       # The "right" way for each pattern with code snippets
```

**Hook integration:**
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "echo 'Apply .claude/skills/cortex-review/references/checklist.md to this file'"
      }]
    }]
  }
}
```

The hook points Claude directly to the checklist file path. The skill itself is a reference document — Claude reads the checklist and applies it. No external scripts needed.

---

## Skill 3: `cortex-feature`

**Purpose:** Orchestrate scaffolding a full vertical feature slice: route + lib + component + wiring.

**Description (trigger):** "Use when building a new feature that spans API + UI. Orchestrates route scaffolding (via cortex-route), lib function creation, UI component generation, page wiring, and usage tracking. Knows the file layout conventions for admin vs portal."

**What it orchestrates:**
1. **API route** — Delegates to `cortex-route` skill for the correct variant
2. **Lib function** — Creates `lib/<domain>/<feature>.ts` with typed inputs/outputs
3. **UI component** — Creates `components/<domain>/<feature>.tsx` with loading/error/empty states, referencing `docs/detail-design-patterns.md` for micro-interaction patterns
4. **Page wiring** — Adds the component to the correct page under `app/admin/` or `app/portal/`
5. **Usage tracking** — Wires `logUsage()` if external services are involved
6. **Type safety** — Generates shared types in `lib/<domain>/types.ts` if needed

**Skill folder structure:**
```
.claude/skills/cortex-feature/
├── SKILL.md              # Decision tree: what files to create, naming conventions
├── config.json           # Default paths, component patterns
└── references/
    ├── file-layout.md    # Where files go (app/admin vs app/portal, lib/<domain>/)
    ├── component-patterns.md  # Card, table, form, modal patterns + points to detail-design-patterns.md
    └── checklist.md      # Pre-flight checks before generating
```

**Decision tree encoded in SKILL.md:**
```
Is this admin, portal, or shared?
├── Admin → app/admin/... route, no org scoping
├── Portal → app/portal/... + app/api/portal/... + org scoping via getPortalClient()
└── Shared → app/api/shared/... + token-based auth (niche, manual setup)

Does it call an external service?
├── Yes → Add logUsage() with TrackedService type, wire userId/userEmail
└── No → Skip usage tracking

Does it need a UI?
├── Yes → Component + page wiring, reference detail-design-patterns.md
└── No → Just API + lib (background job, cron, etc.)

Is it long-running (AI, crawl, scrape)?
├── Yes → Add export const maxDuration
└── No → Skip
```

---

## Implementation order

1. **cortex-route** first — Most self-contained, highest frequency use
2. **cortex-review** second — Catches mistakes in code written with or without the route skill
3. **cortex-feature** third — Composes the other two, needs them stable first

## File locations

All skills are local folders in `.claude/skills/`:
- `.claude/skills/cortex-route/`
- `.claude/skills/cortex-review/`
- `.claude/skills/cortex-feature/`

## Design principles (from infographic)

- **Non-obvious insights only** — Don't restate what's in CLAUDE.md. Encode the gotchas that trip you up.
- **Filesystem context** — Templates are real `.ts` files Claude can read and adapt, not pseudocode.
- **No railroading** — Skills guide but don't force. User can skip steps or override defaults.
- **Composable** — `cortex-feature` references `cortex-route`, doesn't duplicate it.
- **Start tiny, iterate** — First version is minimal. Add edge cases as they come up.
- **Descriptions are triggers** — SKILL.md description fields are slightly pushy trigger conditions, not summaries.
