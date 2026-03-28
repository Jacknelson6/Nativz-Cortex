# Nativz Cortex QA Report (Full Deep Dive)
**Date:** March 11, 2026
**Tester:** Atlas
**Environment:** localhost:3000, Next.js 15.5.12, production Supabase, production env vars from Vercel
**Method:** curl API testing, source code review, security probing, browser testing, load testing

---

## 🔴 CRITICAL BUGS

### BUG-1: API keys show "Revoked" immediately after creation
- **File:** `app/api/api-keys/route.ts` (POST handler)
- **Root cause:** POST response `.select()` omits `is_active`. Frontend checks `!key.is_active` which is `undefined` (falsy) → "Revoked" badge.
- **Fix:**
  ```diff
  - .select('id, name, key_prefix, scopes, created_at, expires_at')
  + .select('id, name, key_prefix, scopes, is_active, created_at, expires_at')
  ```

### BUG-2: /api/v1/clients GET returns 500
- **File:** `app/api/v1/clients/route.ts`
- **Root cause:** Queries nonexistent `abbreviation` column.
- **Fix:**
  ```diff
  - .select('id, name, slug, abbreviation, agency, ...')
  + .select('id, name, slug, agency, ...')
  ```

### BUG-3: /api/notifications returns 401 on every page (broken notification bell)
- **File:** `middleware.ts` (matcher config)
- **Root cause:** Middleware matcher doesn't include `/api/*` (only `/api/v1/*`). Supabase session cookies aren't refreshed for internal API calls.
- **Fix:** Add `/api/:path*` to matcher. Verify webhook routes (`/api/calendar/webhook`, `/api/monday/webhook`) still work since they don't have user sessions — may need to short-circuit those paths in middleware.

### BUG-4: XSS stored via task title (and likely other text fields)
- **File:** `app/api/v1/tasks/route.ts` (POST handler), rendered in `components/tasks/task-row.tsx`
- **Root cause:** `<img src=x onerror=alert(1)>` successfully stored as task title and rendered in UI. No HTML sanitization on input or output.
- **Fix:** Add input sanitization (strip HTML tags) on all text inputs before DB insert. Or use `dangerouslySetInnerHTML` never and rely on React's default escaping (verify all render paths use `{text}` not `innerHTML`).
- **Severity:** HIGH — any user can inject JS that executes for all other users viewing the task list.

### BUG-5: Cron endpoints are publicly accessible (no auth in dev/staging)
- **Files:** `app/api/cron/shoot-planner/route.ts`, `publish-posts/route.ts`, `sync-reporting/route.ts`, `check-velocity/route.ts`
- **Root cause:** Auth check is `if (cronSecret && authHeader !== ...)` — when `CRON_SECRET` is undefined (any non-Vercel environment), the check passes for everyone. Anyone can trigger shoot planning, post publishing, reporting sync, velocity checks.
- **Fix:** Flip the logic: deny by default.
  ```typescript
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  ```

### BUG-6: SVG upload allows stored XSS
- **File:** `app/api/clients/upload-logo/route.ts`
- **Root cause:** Allows `image/svg+xml` uploads. SVGs can contain `<script>` tags. When the logo URL is rendered in `<img>` tags this is mostly safe, but if anyone opens the Supabase Storage URL directly, the SVG executes JS.
- **Fix:** Remove `image/svg+xml` from `ALLOWED_TYPES`, or sanitize SVG before upload (strip `<script>`, event handlers, etc.).

---

## 🟡 MEDIUM BUGS

### BUG-7: No rate limiting on API keys (in-memory counter resets per cold start)
- **File:** `lib/api-keys/rate-limit.ts`
- **Root cause:** Uses `new Map()` in-memory counter. On Vercel serverless, each invocation may be a fresh instance, resetting the counter. Tested 110 rapid requests with zero rate limiting.
- **Fix:** Use Redis/Upstash for rate limiting, or Vercel's built-in rate limiting. The current implementation is effectively non-functional in serverless.

### BUG-8: Todoist sync creates duplicate tasks
- **File:** `lib/todoist/sync.ts` (line ~180)
- **Root cause:** `INSERT INTO tasks` with no `ON CONFLICT` clause and no `UNIQUE` constraint on `todoist_task_id`. If sync runs twice before the task gets a `todoist_task_id`, duplicates. Currently 4 duplicate tasks in production.
- **Fix:** Add unique index: `CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_todoist_id ON tasks (todoist_task_id) WHERE todoist_task_id IS NOT NULL;` and use upsert in the sync logic.

### BUG-9: Pipeline folder links broken (prefixed URLs)
- **File:** `components/pipeline/pipeline-view.tsx` (lines 702-717)
- **Root cause:** Monday link columns store `"April - https://drive.google.com/..."`. Rendered as-is into `href`.
- **Fix:**
  ```typescript
  function extractUrl(raw: string | null): string | null {
    if (!raw) return null;
    const match = raw.match(/https?:\/\/[^\s]+/);
    return match ? match[0] : raw;
  }
  ```

### BUG-10: DELETE /api/v1/tasks/[id] returns 500 for non-existent task
- **File:** `app/api/v1/tasks/[id]/route.ts`
- **Root cause:** No existence check before delete. Should return 404.

### BUG-11: PUT /api/v1/tasks/[id] returns 500 for non-existent task
- **File:** `app/api/v1/tasks/[id]/route.ts`
- **Root cause:** Same as above — no existence check. Should return 404.

### BUG-12: Malformed JSON body returns 500 instead of 400
- **Files:** Multiple POST endpoints
- **Root cause:** `await request.json()` throws on malformed JSON, not caught before Zod validation.
- **Fix:** Wrap in try/catch:
  ```typescript
  let body;
  try { body = await request.json(); } 
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  ```

### BUG-13: Shared links return 500 for invalid tokens (should be 404)
- **Files:** `app/shared/moodboard/[token]/page.tsx`, `report/[token]`, `join/[token]`, `calendar/[token]`
- **Root cause:** Client components crash when the API call for the token fails. No error handling for invalid/expired tokens.
- **Fix:** Add error boundary or loading state that shows "Link expired or invalid" instead of 500.

### BUG-14: /api/v1/posts returns 500 with non-UUID client_id
- **File:** `app/api/v1/posts/route.ts`
- **Fix:** UUID regex validation before query.

---

## 🟠 SECURITY ISSUES

### SEC-1: No security headers configured
- **Files:** `next.config.ts`, `vercel.json`
- **Missing:** `X-Frame-Options`, `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`
- **Risk:** Clickjacking, MIME sniffing, missing HSTS
- **Fix:** Add headers in `next.config.ts`:
  ```typescript
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
  ```

### SEC-2: images.remotePatterns allows any hostname
- **File:** `next.config.ts`
- **Root cause:** `hostname: '**'` means Next.js image optimizer proxies any URL. While Next.js blocks `localhost` and metadata IPs, this still allows bandwidth abuse and potential SSRF against non-standard internal services.
- **Fix:** Restrict to known domains:
  ```typescript
  remotePatterns: [
    { protocol: 'https', hostname: '*.supabase.co' },
    { protocol: 'https', hostname: '*.googleapis.com' },
  ],
  ```

### SEC-3: Calendar API endpoint has no scope enforcement
- **File:** `lib/api-keys/validate.ts`
- **Root cause:** `SCOPE_MAP` doesn't include `calendar`. Any valid API key can access calendar data regardless of assigned scopes.
- **Fix:** Add `calendar: 'calendar'` to SCOPE_MAP and create a "calendar" scope option.

### SEC-4: Query parameter validation missing (limit, offset)
- **Files:** All GET endpoints in `app/api/v1/`
- **Root cause:** `limit=-1`, `limit=0`, `limit=abc`, `limit=999999` all return data (Supabase ignores invalid limits). No server-side validation.
- **Fix:** Parse and clamp: `const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50'), 1), 100);`

### SEC-5: 28 POST endpoints have no Zod/input validation
- See list above (file uploads, webhook handlers, sync endpoints, invite flows)
- Most are auth-gated, but still should validate input shape.
- **Priority:** Medium — focus on user-facing endpoints first.

### SEC-6: ESLint disabled during builds
- **File:** `next.config.ts` — `ignoreDuringBuilds: true`
- **Risk:** Potential bugs and security issues going undetected.
- **Fix:** Enable ESLint, fix any errors.

### SEC-7: Portal login has no brute force protection
- Supabase handles rate limiting at their level, but the app itself doesn't implement progressive delays, CAPTCHA, or account lockout.
- **Priority:** Low (Supabase does limit eventually, just at a high threshold).

---

## ⚡ PERFORMANCE

### PERF-1: /admin/clients/onboard is 554 kB (677 kB first load) — 10x any other page
- **Root cause:** `@react-pdf/renderer` eagerly imported.
- **Fix:** `next/dynamic` with `ssr: false` on `PdfDownloadButton`.
- **Impact:** Drops to ~120KB.

### PERF-2: API key validation hits DB on every request (no caching)
- **File:** `lib/api-keys/validate.ts`
- **Root cause:** Every API call does a Supabase query to validate the key hash.
- **Fix:** LRU cache with 60s TTL for validated keys.

### PERF-3: API response times (tasks: 654ms, shoots: 574ms)
- **Root cause:** Cold Supabase queries + API key validation overhead.
- **Fix:** Cache API key validation (see PERF-2), add DB indexes if missing.

### PERF-4: Settings page is 1,224 lines (monolithic)
- **Fix:** Split into sub-components per section.

### PERF-5: 5 routes missing loading.tsx
- **Routes:** moodboard, tasks, shoots, nerd, search/new
- **Fix:** Add skeleton loading states.

---

## 📊 DATA ISSUES

### DATA-1: 4 duplicate tasks from Todoist sync
- "swap getlate to coles card" (x2), "Send payroll" (x2), "medicate" (x3)
- **Root cause:** No unique constraint on `todoist_task_id` (see BUG-8)
- **Fix:** Deduplicate existing records, add unique index.

### DATA-2: Pipeline status mismatch with Monday.com
- Pipeline shows "Not started" for ASAB/CSS, but Monday shows "EM Approved".
- **Root cause:** Sync may be stale or status mapping is wrong.

### DATA-3: Most clients show "Unassigned" for agency
- Should be "Nativz" or "AC". Needs backfill from Monday Clients board.

---

## 🟢 IMPROVEMENTS

### IMP-1: API docs page shows localhost as base URL
- **File:** `/admin/nerd/api`
- **Fix:** Use `window.location.origin` or `NEXT_PUBLIC_APP_URL`.

### IMP-2: Missing error boundaries for moodboard, calendar, analytics
- **Fix:** Add `error.tsx` to each route.

### IMP-3: 7 console.log statements in API routes
- **Fix:** Replace with structured logging or remove.

### IMP-4: 2 npm vulnerabilities (minimatch ReDoS)
- **Fix:** `npm audit fix`

### IMP-5: publish-posts TODO: email service not configured
- Line 237: `// TODO: Send actual email via Resend/SendGrid when email service is configured`

---

## IMPLEMENTATION PRIORITY

### Immediate (deploy blockers)
1. **BUG-5** — Cron auth bypass (anyone can trigger post publishing)
2. **BUG-4** — Stored XSS via task titles
3. **BUG-6** — SVG upload XSS
4. **SEC-1** — Add security headers

### High (broken features)
5. **BUG-2** — /api/v1/clients 500
6. **BUG-1** — API keys "Revoked" display
7. **BUG-3** — Notifications 401 everywhere
8. **BUG-8** — Todoist duplicate tasks

### Medium (bad behavior)
9. **BUG-7** — Rate limiting is fake
10. **BUG-9** — Pipeline broken links
11. **BUG-10/11** — 500s instead of 404s
12. **BUG-12** — Malformed JSON 500s
13. **BUG-13** — Shared links 500 on invalid tokens
14. **SEC-2** — Image proxy open to any host
15. **SEC-3** — Calendar scope gap

### Lower (polish)
16. **PERF-1** — Onboard 554KB bundle
17. **PERF-2** — API key caching
18. **SEC-4** — Query param validation
19. **PERF-4/5** — Settings split, loading states
20. **Everything else**

---

## WHAT WORKS WELL

- Auth flow: login → redirect → role-based access all correct
- All 21 pages render without crashes
- API key generation and validation works (despite display bug)
- TypeScript compiles clean (zero errors)
- Production build succeeds cleanly
- No service role key leaks in client bundles
- No hardcoded secrets in source
- No open redirects found
- Concurrent operations handled correctly (10 parallel creates, no race conditions)
- getSession in middleware / getUser in API routes is the correct pattern
- Pipeline loads real Monday data with 22 clients
- Zod validation on the v1 API routes that have it is solid

---

## TEST MATRIX

| Category | Tests | Pass | Fail |
|----------|-------|------|------|
| Page renders (admin + portal) | 21 | 21 | 0 |
| Console errors | 21 | 0 | 21 |
| API v1 GET endpoints | 7 | 5 | 2 |
| API v1 POST endpoints | 5 | 3 | 2 |
| API v1 DELETE/PUT | 2 | 0 | 2 |
| Internal API auth | 25 | 25 | 0 |
| Cron endpoints | 5 | 0 | 5 |
| Webhook endpoints | 3 | 3 | 0 |
| Shared link tokens | 4 | 0 | 4 |
| Security headers | 6 | 0 | 6 |
| Input validation (edge cases) | 12 | 5 | 7 |
| Rate limiting | 1 | 0 | 1 |
| XSS injection | 2 | 0 | 2 |
| SQL injection | 2 | 2 | 0 |
| SSRF | 2 | 2 | 0 |
| Open redirects | 3 | 3 | 0 |
| Auth bypass | 4 | 4 | 0 |
| Concurrent ops | 1 | 1 | 0 |
| Build + TypeScript | 2 | 2 | 0 |
| Data integrity | 2 | 0 | 2 |
| Dependency audit | 1 | 0 | 1 |
| **TOTAL** | **131** | **76** | **55** |
