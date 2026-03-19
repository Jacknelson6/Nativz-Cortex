# cortex-route gotchas

Non-obvious mistakes that trip people up in this codebase.

## 1. Standard routes use `createServerSupabaseClient()` NOT `createAdminClient()`

Only use `createAdminClient()` when you need to bypass RLS (e.g., reading other users' data, admin operations). Most routes should use the user-scoped client from `createServerSupabaseClient()`.

## 2. Portal routes: use `getPortalClient()`, not inline org queries

Some older routes manually query `users.organization_id`. New routes must use `getPortalClient()` from `@/lib/portal/get-portal-client`. It handles admin impersonation via cookie.

## 3. Always `await params` before using

Next.js 15 changed params to be a Promise. Do this:

```ts
const { id } = await params
```

Not this:

```ts
const { id } = params // WRONG - params is a Promise in Next.js 15
```

## 4. Zod validation BEFORE any data access

Parse the body/params first, then use the validated data. Never access `req.json()` fields directly without validation.

```ts
const body = await request.json()
const parsed = schema.safeParse(body)
if (!parsed.success) {
  return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
}
// Now use parsed.data, not body
```

## 5. `NextRequest` import only when needed

- GET routes without params or headers: use bare `()` signature
- POST routes: need `NextRequest` for `request.json()`
- Cron routes: need `NextRequest` for `request.headers`

## 6. Error log format matters

Always use this format:

```ts
console.error('POST /api/your-route error:', error)
```

Include the HTTP method and full API path. This is what the team greps for in logs.

## 7. AI response fields are NEVER safe to destructure directly

Always use null-safe defaults. OpenRouter and Gemini can return null/undefined for any field.

```ts
const topics = result.topics ?? []
const summary = result.summary ?? ''
const score = result.score ?? 0
```

## 8. Cron routes ALWAYS need `maxDuration`

Without it, Vercel's default 10-second timeout kills your job. Default to `120`, use `300` for AI-heavy crons.

```ts
export const maxDuration = 120
```

## 9. Public routes must be in the middleware allowlist

If you create a public route, add its path to the `publicPaths` array in `middleware.ts` or it will get a 401. This is easy to forget and causes confusing "unauthorized" errors in production.
