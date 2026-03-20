# Cortex Claude Code Skills — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 3 custom Claude Code skills (cortex-route, cortex-review, cortex-feature) that accelerate Nativz Cortex development and catch project-specific mistakes.

**Architecture:** Each skill is a folder in `.claude/skills/` containing a SKILL.md (trigger + instructions), config.json, and a references/ directory with templates and checklists. Skills are pure markdown + template files — no scripts needed. Claude reads the skill content and applies it.

**Tech Stack:** Claude Code skills system (SKILL.md frontmatter), markdown, TypeScript templates.

**Spec:** `docs/superpowers/specs/2026-03-19-cortex-skills-design.md`

---

## File Structure

```
.claude/skills/
├── cortex-route/
│   ├── SKILL.md                          # Trigger + variant selection + usage guide
│   ├── config.json                       # Tracked services list
│   └── references/
│       ├── templates/
│       │   ├── standard.ts               # User-scoped supabase + Zod
│       │   ├── admin.ts                  # + role gate
│       │   ├── portal.ts                 # + getPortalClient() org scoping
│       │   ├── cron.ts                   # Bearer token + maxDuration
│       │   └── public.ts                 # No auth
│       └── gotchas.md                    # Common mistakes
├── cortex-review/
│   ├── SKILL.md                          # Trigger + checklist summary
│   ├── config.json                       # Check enable/disable
│   └── references/
│       ├── checklist.md                  # Full checks with correct/incorrect examples
│       └── patterns.md                   # Right-way code snippets
└── cortex-feature/
    ├── SKILL.md                          # Trigger + decision tree
    ├── config.json                       # Default paths
    └── references/
        ├── file-layout.md                # Where files go
        ├── component-patterns.md         # UI patterns
        └── checklist.md                  # Pre-flight checks
```

---

## Task 1: cortex-route — Templates

Create the 5 route template files that Claude will read and adapt when scaffolding new routes.

**Files:**
- Create: `.claude/skills/cortex-route/references/templates/standard.ts`
- Create: `.claude/skills/cortex-route/references/templates/admin.ts`
- Create: `.claude/skills/cortex-route/references/templates/portal.ts`
- Create: `.claude/skills/cortex-route/references/templates/cron.ts`
- Create: `.claude/skills/cortex-route/references/templates/public.ts`

**Reference files to read first:**
- `app/api/search/route.ts` — standard route pattern
- `app/api/clients/[id]/strategy/route.ts` — admin route with role check
- `app/api/portal/brand-dna/route.ts` — portal route
- `app/api/cron/publish-posts/route.ts` — cron route
- `lib/portal/get-portal-client.ts` — portal client helper
- `lib/ai/usage.ts` — `TrackedService` type and `logUsage` signature

- [ ] **Step 1: Create `standard.ts` template**

Template must use `createServerSupabaseClient()` (NOT `createAdminClient()`), include Zod validation, try/catch, JSDoc, and `console.error('METHOD /api/path error:', error)` format. Include placeholder comments for where to add `logUsage()` and `maxDuration` if needed. Model this after `app/api/search/route.ts`.

- [ ] **Step 2: Create `admin.ts` template**

Extends standard with admin role check. Use the inline pattern: fetch `users.role` via `createAdminClient()`, check `!== 'admin'`, return 403. Include `maxDuration` export. Model after `app/api/clients/[id]/strategy/route.ts`.

- [ ] **Step 3: Create `portal.ts` template**

Uses `getPortalClient()` from `@/lib/portal/get-portal-client`. Show the import, null check, destructuring of `{ client, organizationId }`. All DB queries scoped by org. Model after `app/api/portal/brand-dna/route.ts`.

- [ ] **Step 4: Create `cron.ts` template**

Bearer token auth checking `CRON_SECRET`. No user context. `createAdminClient()` for all DB access. `export const maxDuration = 120`. GET handler. Model after `app/api/cron/publish-posts/route.ts`.

- [ ] **Step 5: Create `public.ts` template**

No auth. Zod validation only. Minimal: just the Zod schema, try/catch, JSON response. For webhooks and public endpoints.

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/cortex-route/references/templates/
git commit -m "feat: add cortex-route template files for 5 API route variants"
```

---

## Task 2: cortex-route — SKILL.md + config + gotchas

Create the skill entry point and supporting files.

**Files:**
- Create: `.claude/skills/cortex-route/SKILL.md`
- Create: `.claude/skills/cortex-route/config.json`
- Create: `.claude/skills/cortex-route/references/gotchas.md`

- [ ] **Step 1: Create `SKILL.md`**

Frontmatter must include:
```yaml
---
name: cortex-route
description: "Use when creating a new API route, endpoint, or handler. Scaffolds correct auth, Zod validation, error handling, usage tracking, and maxDuration for this project. Covers standard, admin, portal, cron, and public variants."
---
```

Body should include:
- Variant selection table (from spec)
- "How to use" section: pick a variant, Claude reads the template from `references/templates/<variant>.ts`, adapts it for the specific route
- Dynamic params reminder: `params: Promise<{ id: string }>` then `await params`
- When to add `logUsage()`: list the tracked services
- When to add `maxDuration`: any route calling external services or AI
- Point to `references/gotchas.md` for common mistakes

- [ ] **Step 2: Create `config.json`**

```json
{
  "defaultVariant": "standard",
  "trackedServices": ["openrouter", "groq", "gemini", "brave", "apify", "cloudflare", "resend", "youtube"]
}
```

- [ ] **Step 3: Create `references/gotchas.md`**

Encode these non-obvious gotchas:
- Standard routes use `createServerSupabaseClient()` NOT `createAdminClient()`. Only use admin client when bypassing RLS.
- Portal routes: use `getPortalClient()`, not inline org queries. Some older routes do it inline — don't copy them.
- Always `await params` before using them (Next.js 15).
- Always validate with Zod BEFORE any data access.
- `NextRequest` import only needed for body parsing or header access. GET routes without params use bare `()`.
- Error log format: `console.error('METHOD /api/path error:', error)` — include the HTTP method and full path.
- AI response fields from OpenRouter/Gemini always need `?? []`, `?? ''`, `?? 0`.
- Cron routes: ALWAYS set `export const maxDuration`. Default 120, AI-heavy routes 300.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/cortex-route/
git commit -m "feat: add cortex-route skill — SKILL.md, config, gotchas"
```

---

## Task 3: cortex-review — Checklist + patterns

Create the detailed checklist and correct-pattern reference files.

**Files:**
- Create: `.claude/skills/cortex-review/references/checklist.md`
- Create: `.claude/skills/cortex-review/references/patterns.md`

**Reference files to read first:**
- `CLAUDE.md` — existing conventions (don't duplicate, extend)
- `.claude/rules/api-routes.md` — existing rules
- `lib/ai/usage.ts` — `TrackedService` type

- [ ] **Step 1: Create `references/checklist.md`**

For each check, show: what to look for, a BAD example, and a GOOD example. Organize by severity (Critical → Warning → Info) matching the spec exactly:

**Critical checks:**
1. Auth before data — show route with DB query before auth check (bad) vs auth first (good)
2. Portal org scoping — show portal route without org filter (bad) vs with `getPortalClient()` (good)
3. Zod before processing — show body access before validation (bad) vs safeParse first (good)

**Warning checks:**
4. AI null-safety — show `response.ideas` (bad) vs `response.ideas ?? []` (good)
5. Usage tracking — show route calling OpenRouter without `logUsage()` (bad) vs with it (good)
6. Error responses — show `return new Response('error')` (bad) vs `NextResponse.json({ error })` (good)
7. Dynamic params — show `params.id` (bad) vs `const { id } = await params` (good)
8. Error log format — show `console.log(error)` (bad) vs `console.error('POST /api/foo error:', error)` (good)
9. maxDuration — show route calling external service without it (bad) vs with `export const maxDuration = 60` (good)
10. Admin client scope — show standard route using `createAdminClient()` unnecessarily (bad) vs `createServerSupabaseClient()` (good)

**Info checks:**
11. Missing JSDoc — show handler without JSDoc (incomplete) vs with `@auth`, `@body`, `@returns` (complete)

- [ ] **Step 2: Create `references/patterns.md`**

Quick-reference code snippets for the "right" way. One section per pattern:
- Standard auth block
- Admin role check block
- Portal org scoping block
- Cron auth block
- Zod validation block
- Error handling block (try/catch + console.error format)
- logUsage block (with userId/userEmail threading)
- Dynamic params block
- maxDuration placement

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/cortex-review/references/
git commit -m "feat: add cortex-review checklist and patterns references"
```

---

## Task 4: cortex-review — SKILL.md + config

Create the skill entry point.

**Files:**
- Create: `.claude/skills/cortex-review/SKILL.md`
- Create: `.claude/skills/cortex-review/config.json`

- [ ] **Step 1: Create `SKILL.md`**

Frontmatter:
```yaml
---
name: cortex-review
description: "Use when editing or creating API routes and lib files. Checks auth-before-data, portal org scoping, Zod validation, AI null-safety, usage tracking, error format, and maxDuration. Catches the specific mistakes that happen in the Nativz Cortex codebase."
---
```

Body should:
- Summarize the 11 checks with severity levels (table format)
- Explain: "Read `references/checklist.md` for full examples of each check"
- Explain: "Read `references/patterns.md` for correct code snippets"
- Note: these checks supplement (not replace) what's in CLAUDE.md and `.claude/rules/api-routes.md`

- [ ] **Step 2: Create `config.json`**

```json
{
  "checks": {
    "auth_before_data": { "severity": "critical", "enabled": true },
    "portal_org_scoping": { "severity": "critical", "enabled": true },
    "zod_before_processing": { "severity": "critical", "enabled": true },
    "ai_null_safety": { "severity": "warning", "enabled": true },
    "usage_tracking": { "severity": "warning", "enabled": true },
    "error_responses": { "severity": "warning", "enabled": true },
    "dynamic_params": { "severity": "warning", "enabled": true },
    "error_log_format": { "severity": "warning", "enabled": true },
    "max_duration": { "severity": "warning", "enabled": true },
    "admin_client_scope": { "severity": "warning", "enabled": true },
    "jsdoc": { "severity": "info", "enabled": true }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/cortex-review/
git commit -m "feat: add cortex-review skill — SKILL.md and config"
```

---

## Task 5: cortex-feature — All files

Create the feature orchestration skill.

**Files:**
- Create: `.claude/skills/cortex-feature/SKILL.md`
- Create: `.claude/skills/cortex-feature/config.json`
- Create: `.claude/skills/cortex-feature/references/file-layout.md`
- Create: `.claude/skills/cortex-feature/references/component-patterns.md`
- Create: `.claude/skills/cortex-feature/references/checklist.md`

**Reference files to read first:**
- `docs/detail-design-patterns.md` — UI micro-interaction patterns (referenced by component-patterns.md)
- `docs/conventions.md` — UI conventions (dark theme, sentence case, etc.)

- [ ] **Step 1: Create `SKILL.md`**

Frontmatter:
```yaml
---
name: cortex-feature
description: "Use when building a new feature that spans API + UI. Orchestrates route scaffolding (delegates to cortex-route), lib function creation, UI component generation with dark theme, and page wiring. Knows admin vs portal file layout."
---
```

Body: the decision tree from the spec, plus instructions to:
1. Use cortex-route skill for the API layer
2. Read `references/file-layout.md` for where to put files
3. Read `references/component-patterns.md` for UI patterns
4. Run through `references/checklist.md` before finishing

- [ ] **Step 2: Create `config.json`**

```json
{
  "adminBasePath": "app/admin",
  "portalBasePath": "app/portal",
  "libBasePath": "lib",
  "componentsBasePath": "components"
}
```

- [ ] **Step 3: Create `references/file-layout.md`**

Document where files go based on feature type:
- Admin feature: `app/admin/<section>/page.tsx` + `app/api/<domain>/route.ts` + `lib/<domain>/` + `components/<domain>/`
- Portal feature: `app/portal/<section>/page.tsx` + `app/api/portal/<domain>/route.ts` + `lib/<domain>/` + `components/portal/<domain>/`
- Background job: `app/api/cron/<name>/route.ts` + `lib/<domain>/` (no UI)
- Types go in `lib/<domain>/types.ts` or `lib/types/<domain>.ts` (check which pattern the domain already uses)

- [ ] **Step 4: Create `references/component-patterns.md`**

Document the 4 main UI patterns used in the project:
- **Data card** — `<Card>` with header, stats grid, optional actions. Used for dashboards.
- **Data table** — Table with sortable headers, border styling. Used for lists.
- **Form** — Zod-validated inputs, loading state on submit, error display. Used for settings.
- **Modal/sheet** — Overlay for detail views and edit forms.

For each: show the actual Tailwind classes used (dark theme: `bg-surface`, `text-text-primary`, `border-nativz-border`, etc.). Reference `docs/detail-design-patterns.md` for micro-interaction details.

- [ ] **Step 5: Create `references/checklist.md`**

Pre-flight checklist before finishing a feature:
- [ ] API route uses correct variant (standard/admin/portal/cron/public)
- [ ] Zod schema covers all input fields
- [ ] UI has loading, error, and empty states
- [ ] Dark theme tokens used (not raw colors)
- [ ] Sentence case on all copy
- [ ] `logUsage()` wired if external service is called
- [ ] `maxDuration` set if route is long-running
- [ ] Types shared between API and UI (not duplicated)

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/cortex-feature/
git commit -m "feat: add cortex-feature skill — orchestrates full vertical slices"
```

---

## Task 6: Verify all skills load

- [ ] **Step 1: List all skill files**

```bash
find .claude/skills/cortex-* -type f | sort
```

Verify all 16 files exist (5 templates + gotchas + 2 SKILL.md + 2 config.json + checklist + patterns + file-layout + component-patterns + feature-checklist).

- [ ] **Step 2: Test skill trigger — ask Claude to scaffold a route**

Ask: "Create a new admin API route at /api/admin/reports that returns usage reports"
Verify Claude reads the cortex-route skill and uses the admin template.

- [ ] **Step 3: Test review trigger — edit an API route file**

Edit any route file and check that Claude references the cortex-review checklist.

- [ ] **Step 4: Final commit with all skills**

```bash
git add .claude/skills/cortex-*/
git commit -m "feat: add 3 cortex skills — route scaffolding, code review, feature orchestration"
```
