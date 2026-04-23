---
name: cortex-review
description: "Use when editing or creating API routes and lib files. Checks auth-before-data, portal org scoping, Zod validation, AI null-safety, usage tracking, error format, and maxDuration. Catches the specific mistakes that happen in the Nativz Cortex codebase."
---

## Overview

This skill supplements AGENTS.md and `.Codex/rules/api-routes.md` with specific code-level checks. It does NOT duplicate those docs — it adds the "check your work" layer with concrete bad/good examples so mistakes are caught before they ship.

## Checks summary

| # | Check | Severity | What to look for |
|---|-------|----------|-----------------|
| 1 | Auth before data | Critical | No DB/API calls before auth check |
| 2 | Portal org scoping | Critical | Portal routes use getPortalClient() |
| 3 | Zod before processing | Critical | safeParse() before using request data |
| 4 | AI null-safety | Warning | ?? [] / ?? '' / ?? 0 on AI fields |
| 5 | Usage tracking | Warning | logUsage() with userId for tracked services |
| 6 | Error responses | Warning | NextResponse.json({ error }) format |
| 7 | Dynamic params | Warning | await params (Next.js 15) |
| 8 | Error log format | Warning | console.error('METHOD /api/path error:', error) |
| 9 | maxDuration | Warning | Set for external/AI service calls |
| 10 | Admin client scope | Warning | createAdminClient() only when bypassing RLS |
| 11 | JSDoc | Info | @auth, @body, @returns on handlers |

## How to use

- Read `references/checklist.md` for full examples of each check (bad vs good code)
- Read `references/patterns.md` for correct code snippets to copy
- Apply checks in severity order: Critical first, then Warning, then Info

## Note

These checks supplement (not replace) the conventions in AGENTS.md and `.Codex/rules/api-routes.md`.
