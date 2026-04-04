# PRD: Client Portal Launch Checklist

> **Status:** Pre-launch
> **Target:** Tomorrow (April 4, 2026)
> **Audience:** Jack (manual steps before sending invite links to clients)

---

## What's Ready (Code Complete)

- Unified login page (admin + portal) at `/admin/login`
- Portal search with history sidebar rail (matches admin layout)
- Subtopics keyword picker for portal users (llm_v1 pipeline)
- Multi-client brand switcher in portal sidebar
- Brand-aware email templates (Nativz vs Anderson Collaborative)
- Password reset flow (admin + portal)
- Supabase Auth Hook for branded transactional emails
- Role cookie security (scoped by user ID, cleared on logout)
- Org-scoped API routes (security hardening across 14+ routes)
- No approval gate — clients see completed reports immediately
- Agency-neutral copy throughout portal (no more hardcoded "Nativz")

---

## Manual Steps Required Before Launch

### 1. Supabase Auth Hook (CRITICAL — enables branded emails)

1. Go to **Supabase Dashboard** → **Authentication** → **Hooks**
2. Click **Add Hook** → **Send Email**
3. Configure:
   - **Type:** HTTPS
   - **URL:** `https://cortex.nativz.io/api/auth/send-email`
   - **HTTP Headers:** Add `Authorization: Bearer <your-AUTH_HOOK_SECRET>`
4. Set the `AUTH_HOOK_SECRET` env var in Vercel:
   - Go to **Vercel Dashboard** → **Settings** → **Environment Variables**
   - Add `AUTH_HOOK_SECRET` = a random secure string (e.g. `openssl rand -hex 32`)
   - Make sure it matches what you put in the Supabase hook header
5. **Redeploy** after adding the env var

### 2. Resend Domain Verification (if not already done)

Check these domains are verified in [Resend Dashboard](https://resend.com):
- `nativz.io` — likely already verified
- `andersoncollaborative.com` — needs DKIM, SPF, DMARC records

**DNS records needed for andersoncollaborative.com:**
- Go to Resend → Domains → Add Domain → `andersoncollaborative.com`
- Add the DNS records Resend provides (DKIM TXT records, SPF include)
- Wait for verification (usually 5-15 minutes)

### 3. Create Client Invites

For each client to onboard:
1. Go to **Admin Dashboard** → **Clients** → select client
2. Click **Portal access** → **Create invite**
3. Copy the invite URL
4. Send to the client contact

**Important:** The invite URL uses the domain you're on. If you create it from `cortex.nativz.io`, the invite link will be `cortex.nativz.io/portal/join/...`. If from `cortex.andersoncollaborative.com`, it'll be that domain. Make sure you're on the right domain for the right brand.

### 4. Test the Full Flow (Do This Before Sending Any Invites)

1. **Create a test invite** for a test client
2. **Open the invite link** in an incognito window
3. **Register** with a test email
4. **Verify you land on** `/portal/search/new` with the sidebar
5. **Run a search** — verify it goes through subtopics → processing → results
6. **Check settings** — verify it shows the correct client's brand profile
7. **Check search history** — verify previous searches appear in the sidebar
8. **Log out** — verify you land on the unified login page
9. **Log back in** — verify you see the portal (not admin dashboard)
10. **Test password reset** — click "Forgot password?", check email arrives with correct branding

### 5. Verify Email Branding

After the Auth Hook is configured:
1. Trigger a password reset from `cortex.andersoncollaborative.com`
2. Check that the email comes from `cortex@andersoncollaborative.com` with AC branding
3. Trigger a password reset from `cortex.nativz.io`
4. Check that the email comes from `notifications@nativz.io` with Nativz branding

### 6. Clean Up Test Users

After testing:
- Delete test `user_client_access` rows if the test user was linked to wrong clients
- Deactivate test users via admin → client profile → portal users section
- Or delete them from Supabase Dashboard → Authentication → Users

---

## Known Limitations

1. **SearXNG not available in production** — Topic searches use OpenRouter web search (not SearXNG) on Vercel. This works but may be slower.
2. **LLM JSON failures** — The merger step can sometimes fail with invalid JSON. Auto-retry (2 attempts) is now built in. Users can also click "Try again."
3. **Video frame extraction** — `ffmpeg-static` works locally but may return 0 frames on Vercel. Carousel images won't show but search results still work.
4. **No Google Sign-In yet** — Users must use email/password. Google OAuth needs a Google Cloud Console OAuth app first.

---

## Post-Launch Monitoring

After clients start using the portal:
1. Check **Vercel Logs** for any `[auth/send-email]` errors
2. Check **Resend Dashboard** for email delivery status
3. Monitor **Supabase Logs** for any auth hook failures
4. Watch for any `[topic_search_llm_v1]` merger failures in logs

---

## Quick Reference

| URL | Purpose |
|-----|---------|
| `cortex.nativz.io/admin/login` | Unified login (admin + portal) |
| `cortex.andersoncollaborative.com/admin/login` | Same login, AC branding |
| `cortex.nativz.io/portal/search/new` | Portal research page |
| `cortex.nativz.io/portal/search/history` | Portal search history |
| `cortex.nativz.io/portal/settings` | Portal settings |

| Env Var | Purpose |
|---------|---------|
| `AUTH_HOOK_SECRET` | Supabase Auth Hook verification |
| `RESEND_API_KEY` | Resend email sending |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin client access |
