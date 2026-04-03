# PRD: Multi-Brand Email System (AC vs Nativz)

> **Status:** Draft — blocker for AC client launch
> **Priority:** Critical
> **Blocker:** AC clients will see Nativz branding in auth emails without this

---

## Problem Statement

Cortex serves two brands on separate domains:
- **Nativz** at `cortex.nativz.io`
- **Anderson Collaborative** at `cortex.andersoncollaborative.com`

Supabase Auth sends ALL transactional emails (signup confirmation, password reset, magic link, 2FA, invite) from a single sender with a single template. AC clients receiving emails branded as "Nativz" breaks the white-label experience and damages brand trust.

---

## Requirements

1. **Signup/invite emails** must match the brand the user signed up from
2. **Password reset / magic link emails** must match the user's brand
3. **No cross-brand leakage** — AC users never see "Nativz", Nativz users never see "Anderson Collaborative"
4. **Sender address** should ideally match the brand domain
5. **Email templates** should use each brand's logo, colors, and copy

---

## Current State

- Supabase Auth handles all transactional emails
- Single SMTP sender configured in Supabase Dashboard
- Email templates in Supabase Dashboard → Authentication → Email Templates
- No per-domain or per-user customization
- Portal invites use `invite_tokens` table → `/portal/join/[token]`
- Resend is available (`RESEND_API_KEY` configured, `lib/email/resend.ts` exists)

---

## Proposed Solution

### Option A: Resend Custom SMTP in Supabase (Fastest)

1. Configure Resend as Supabase's custom SMTP provider
2. Set sender to a neutral address (e.g., `noreply@cortex.io` or `noreply@nativz.io`)
3. Make Supabase email templates brand-neutral (no logos, generic copy)
4. Downside: AC clients still see `@nativz.io` sender — not ideal

### Option B: Custom Email Flow via Resend (Recommended)

1. **Disable Supabase Auth emails** (or make them minimal/generic)
2. **Send all transactional emails through Resend** from application code
3. **Detect brand from user's organization** → choose template + sender
4. **Two sender domains:** `noreply@nativz.io` and `noreply@andersoncollaborative.com`
5. **Two template sets:** Nativz (dark theme, blue accent) and AC (light theme, AC brand colors)

#### Email types to handle:
| Email | Trigger | Brand detection |
|-------|---------|-----------------|
| Portal invite | Admin invites client user | Client's `agency` field |
| Signup confirmation | User signs up | Domain they signed up from (`x-agency` header) |
| Password reset | User requests reset | User's `organization_id` → client → `agency` |
| Magic link | User requests login link | Same as password reset |
| 2FA code | User logs in with 2FA | Same as password reset |

#### Implementation:
1. Create `lib/email/brand-templates.ts` — two template configs (AC + Nativz) with logo URL, colors, sender address, company name
2. Create email templates using React Email (`@react-email/components`) for each email type
3. Hook into Supabase Auth webhooks OR override the email sending:
   - **For invites:** Already custom code — update to use Resend with brand detection
   - **For auth emails (reset, confirm, magic link):** Use Supabase's "Custom Email Hook" (Auth Hooks) to intercept and send via Resend
   - **For 2FA:** Supabase Auth Hook for `send_email` event
4. Verify both domains in Resend (DNS records for `nativz.io` and `andersoncollaborative.com`)

### Option C: Supabase Auth Hooks (Cleanest)

Supabase supports [Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook) that intercept email sending. A Postgres function or HTTP endpoint receives the email event and can route it to Resend with custom branding.

1. Create a `send-email` Auth Hook (HTTP type) pointing to `/api/auth/send-email`
2. The endpoint receives: `{ user, email_data: { token, redirect_to, ... }, email_action_type }`
3. Detect brand from user metadata or organization
4. Send via Resend with the appropriate template and sender
5. Return `200` to tell Supabase the email was handled

---

## Brand Assets Needed

| Asset | Nativz | Anderson Collaborative |
|-------|--------|----------------------|
| Logo URL | `/nativz-logo.svg` (or hosted) | `/anderson-logo-dark.svg` (or hosted) |
| Primary color | `#5ba3e6` (blue) | AC brand color from tokens |
| Background | Dark (`#0f1117`) | Light (`#F4F6F8`) |
| Company name | Nativz | Anderson Collaborative |
| Sender email | `noreply@nativz.io` | `noreply@andersoncollaborative.com` |
| Support email | `support@nativz.io` | `support@andersoncollaborative.com` |

---

## DNS Requirements

Both domains need Resend DNS verification:
- `nativz.io` — likely already verified if Resend is in use
- `andersoncollaborative.com` — needs DKIM, SPF, DMARC records added

---

## Implementation Order

1. **Verify both domains in Resend** (DNS records)
2. **Create brand template config** (`lib/email/brand-templates.ts`)
3. **Create React Email templates** for each email type (invite, reset, confirm, magic link)
4. **Set up Supabase Auth Hook** (`send-email` type → `/api/auth/send-email`)
5. **Update portal invite flow** to use Resend with brand detection
6. **Test end-to-end** on both domains
7. **Make Supabase default templates generic** as fallback

---

## Open Questions

1. Is `andersoncollaborative.com` DNS accessible for adding Resend verification records?
2. Do we have separate support email addresses for each brand?
3. Should the email footer include different physical addresses per brand?
4. Are there any other email types we send (notifications, reports) that need branding?

---

## Estimated Effort

- Domain verification: 15 min (+ DNS propagation time)
- Brand template config: 15 min
- React Email templates: 45 min (5 email types × 2 brands)
- Supabase Auth Hook: 30 min
- Portal invite update: 15 min
- Testing: 30 min
- **Total: ~2.5 hours**
