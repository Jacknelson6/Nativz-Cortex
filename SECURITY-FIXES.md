# Security Fixes — Priority Order

Apply these fixes to the Nativz Cortex codebase. Each fix should be a clean, minimal change.

## CRITICAL — Fix Immediately

### C1. XSS via dangerouslySetInnerHTML
**File:** `components/moodboard/nodes/sticky-node.tsx` (lines ~204, 213)
**Fix:** Install `dompurify` and `@types/dompurify`. Sanitize all `dangerouslySetInnerHTML` usage:
```typescript
import DOMPurify from 'dompurify';
// Replace all instances:
dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content || '') }}
```
Also grep the entire codebase for any other `dangerouslySetInnerHTML` usage and sanitize those too.

### C3. OAuth Callback Missing CSRF Validation (Meta/TikTok)
**File:** `app/api/social/callback/[platform]/route.ts`
**Reference:** `app/api/google/callback/route.ts` (this one does it correctly)
**Fix:** Before redirecting to OAuth provider, generate a random CSRF token, store in httpOnly cookie. In the callback, validate the state parameter contains the matching CSRF token. Follow the same pattern as the Google callback.

### H2. Wildcard Image Remote Patterns — SSRF
**File:** `next.config.ts` (lines ~19-22)
**Fix:** Replace `hostname: '**'` with specific allowed domains:
```typescript
remotePatterns: [
  { protocol: 'https', hostname: '*.supabase.co' },
  { protocol: 'https', hostname: '*.fbcdn.net' },
  { protocol: 'https', hostname: '*.cdninstagram.com' },
  { protocol: 'https', hostname: '*.tiktokcdn.com' },
  { protocol: 'https', hostname: 'i.ytimg.com' },
  { protocol: 'https', hostname: 'yt3.ggpht.com' },
  { protocol: 'https', hostname: '*.googleusercontent.com' },
  { protocol: 'https', hostname: 'p16-sign-*.tiktokcdn-us.com' },
  { protocol: 'https', hostname: 'tikwm.com' },
],
```
Check the codebase for any other image sources and add their domains.

## HIGH — Fix This Sprint

### H1. In-Memory Rate Limiting
**File:** `lib/api-keys/rate-limit.ts`
**Fix:** Replace the in-memory Map with Supabase-based rate limiting using atomic increments. Create a `rate_limits` table with columns: `key TEXT PRIMARY KEY, count INTEGER, window_start TIMESTAMPTZ`. Use upsert with window checks.

### H4. Token Storage in Plain Text
**Files:** Token storage in `social_profiles` and `google_tokens` tables
**Fix:** Create `lib/encryption.ts` with AES-256-GCM encrypt/decrypt using an `ENCRYPTION_KEY` env var. Wrap token reads/writes through encrypt/decrypt. Add the env var to `.env.example`.

### H5. Role Cached in Cookie — Not Signed
**File:** `middleware.ts` (lines ~68-89)
**Fix:** HMAC-sign the role cookie value using a `COOKIE_SECRET` env var. On read, verify the signature before trusting the role.

### H6. Webhook Endpoints Missing Signature Verification
**Files:** `app/api/monday/webhook/route.ts`, `app/api/calendar/webhook/route.ts`
**Fix:** Add `MONDAY_WEBHOOK_SECRET` and `NANGO_WEBHOOK_SECRET` env vars. Verify webhook signatures before processing. Follow the pattern in `app/api/vault/webhook/route.ts`.

### H7. Vault Webhook Skips Verification When Secret Not Set
**File:** `app/api/vault/webhook/route.ts` (lines ~18-19)
**Fix:** When secret is not set, return `false` (fail closed) instead of `true`.

## MEDIUM — Quick Wins

### M2. Password Hashing Uses SHA-256
**Files:** `app/api/moodboard/boards/[id]/share/route.ts`, `app/api/shared/moodboard/[token]/route.ts`
**Fix:** Install `bcryptjs`. Replace SHA-256 hashing with bcrypt. Update both the hash-creation and hash-comparison logic.

### M6. Admin Invite Accept Creates Admin by Default
**File:** `app/api/team/invite/accept/route.ts` (line ~64-71)
**Fix:** Use the role from the team_members record instead of hardcoding 'admin'.

### M7. Social Profiles Route Missing Role Check
**File:** `app/api/social/profiles/route.ts` (lines ~9-44)
**Fix:** Add role-based access check — verify the authenticated user has access to the requested clientId.

## After All Fixes

1. Run `npm run build` to verify no type errors
2. Run `npm run lint` if available
3. Create a `.env.example` file listing all required env vars (no values)
4. Commit with message: `fix: security audit remediation — XSS, CSRF, SSRF, rate limiting, encryption`
