---
name: cortex-route
description: "Use when creating a new API route, endpoint, or handler. Scaffolds correct auth, Zod validation, error handling, usage tracking, and maxDuration for this project. Covers standard, admin, portal, cron, and public variants."
---

# cortex-route

Scaffolds a new API route for Nativz Cortex with the correct auth pattern, validation, error handling, and conventions.

## 1. Variant selection

| Variant | When to use | Auth | Template path |
|---------|------------|------|---------------|
| `standard` | Default for most routes | `supabase.auth.getUser()` | `references/templates/standard.ts` |
| `admin` | Routes that modify sensitive data or need service-role access | getUser + role check | `references/templates/admin.ts` |
| `portal` | Any route under `/api/portal/` | getUser + org scoping | `references/templates/portal.ts` |
| `cron` | Scheduled background jobs | Bearer token | `references/templates/cron.ts` |
| `public` | Webhooks, shared links, public endpoints | None | `references/templates/public.ts` |

## 2. How to use

1. Pick the variant based on the table above.
2. Read the template file at `references/templates/<variant>.ts`.
3. Adapt it: replace TODO placeholders, add Zod fields, add business logic.
4. For dynamic routes with `[id]` params: use `{ params }: { params: Promise<{ id: string }> }` then `const { id } = await params`.

## 3. When to add logUsage()

If the route calls any of these services, add `logUsage()` with `userId: user.id, userEmail: user.email ?? undefined`:

- openrouter, groq, gemini, brave, apify, cloudflare, resend, youtube

```ts
import { logUsage } from '@/lib/ai/usage'

// Call non-blocking after the main response logic
logUsage({
  userId: user.id,
  userEmail: user.email ?? undefined,
  service: 'openrouter',
  operation: 'describe-what-it-does',
  tokensIn: usage?.prompt_tokens ?? 0,
  tokensOut: usage?.completion_tokens ?? 0,
}).catch(() => {})
```

## 4. When to add maxDuration

- Any route calling external services or AI: `export const maxDuration = 60`
- AI-heavy routes (multi-step, long generation): `export const maxDuration = 300`
- Cron routes: always set it (default `120`)

Place the export at the top of the file, after imports.

## 5. Reference

See `references/gotchas.md` for common mistakes and non-obvious pitfalls specific to this codebase.
