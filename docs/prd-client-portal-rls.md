# PRD: Client Portal — RLS, Invite System & End-to-End Onboarding

**Date:** 2026-03-19
**Status:** Complete

## Introduction

Build the security and access management layer for the client portal so that the full end-to-end flow works: admin onboards a client → generates an invite link → client creates an account (or links an existing one) → accesses a portal scoped exclusively to their organization's data.

Nativz Cortex has a dual-dashboard architecture — admin dashboard for the internal team, client portal for clients. The portal pages (dashboard, search, ideas, reports, preferences, calendar, analyze, knowledge, settings) were already built, as were the invite token API and join page. What was missing was proper database-level security (RLS), an admin UI for managing invites and portal users, and the ability for existing users to link their accounts to invites.

**Why this matters:** Without RLS, a technically savvy portal user could bypass the app layer and read data from other clients. Without invite management UI, admins have to use API calls directly. Without account linking, clients who already have Supabase accounts can't use invite links.

## Prior Art — What Already Existed

| Component | Status before this work |
|---|---|
| Portal pages (10 routes) | Built and functional |
| `invite_tokens` table | Created, with token generation |
| `POST /api/invites` | Working — creates invite token |
| `GET /api/invites/validate` | Working — validates token status |
| `POST /api/invites/accept` | Working — creates new account + links to org |
| `/portal/join/[token]` | Working — signup form |
| `InviteButton` component | Working — in onboard review step |
| Feature flags (`clients.feature_flags`) | Working — gates portal features |
| Middleware role check | Working — admin vs viewer routing |
| RLS on `clients`, `topic_searches`, `client_knowledge_entries`, `client_strategies`, `content_pillars` | Had both admin and viewer policies |
| RLS on `contacts`, `client_assignments` | Admin-only policies (no viewer read) |
| RLS on `organizations`, `users` | **None** |
| RLS on `scheduled_posts` | **Overly permissive** — all authenticated users |

## Problem

Five gaps in the end-to-end client portal flow:

1. **RLS gaps** — `organizations` and `users` tables had no RLS at all. `scheduled_posts` let any authenticated user read/write all posts. Portal users could theoretically access data from other clients by bypassing the app layer.

2. **No invite management UI** — Admins could create invites via the `InviteButton` in the onboard review step, but couldn't list existing invites, see their status, copy old links, or revoke unused invites.

3. **No portal user management** — No way to see which portal users exist for a client, when they last logged in, or deactivate/reactivate them.

4. **No account linking** — If a client contact already has a Supabase account (from a previous invite or manual creation), clicking a new invite link would fail with "email already registered." No way to link an existing account to a new organization.

5. **Missing viewer policies** — `contacts`, `client_assignments`, and `invite_tokens` tables had admin-only policies, meaning portal queries using the Supabase client (not admin client) would return empty results.

## Solution

### 1. Database: RLS Hardening (Migration 044)

Added `is_active` column to `users` table for portal user deactivation.

**13 new policies across 6 tables:**

| Table | Policy | For | Rule |
|---|---|---|---|
| `users` | `admin_all_users` | ALL | `users.role = 'admin'` |
| `users` | `viewer_read_own_user` | SELECT | `id = auth.uid()` |
| `users` | `viewer_update_own_user` | UPDATE | `id = auth.uid()` |
| `organizations` | `admin_all_organizations` | ALL | `users.role = 'admin'` |
| `organizations` | `viewer_read_own_org` | SELECT | `id = user.organization_id` |
| `contacts` | `viewer_read_own_contacts` | SELECT | `client_id` in org's clients |
| `scheduled_posts` | `admin_all_scheduled_posts` | ALL | `users.role = 'admin'` |
| `scheduled_posts` | `viewer_read_own_scheduled_posts` | SELECT | `client_id` in org's clients |
| `invite_tokens` | `viewer_read_own_invites` | SELECT | `organization_id = user.organization_id` |
| `client_assignments` | `viewer_read_own_assignments` | SELECT | `client_id` in org's clients |

Removed: overly permissive `Authenticated users can manage scheduled_posts` policy.

### 2. API: Invite Management

**`GET /api/invites?client_id=X`** (new) — Admin-only. Lists all invites for a client with enriched status.
- Returns: `{ invites: [{ id, token, invite_url, status, expires_at, used_at, used_by: { email, full_name }, created_at }] }`
- Status computed at query time: `active` (unused + not expired), `used` (used_at set), `expired` (past expires_at)

**`DELETE /api/invites/[id]`** (new) — Admin-only. Revokes an unused invite token. Returns 400 if already used.

**`POST /api/invites/link`** (new) — Authenticated. Links an existing account to an invite's organization.
- Validates token (not used, not expired)
- Checks user isn't already linked to a different org (returns 409)
- Updates `users.organization_id` and `users.role` to `'viewer'`
- Marks token as used

**`POST /api/invites`** — Unchanged (existing).

### 3. API: Portal User Management

**`GET /api/clients/[id]/portal-users`** (new) — Admin-only. Lists all `role='viewer'` users in the client's organization.
- Returns: `{ users: [{ id, email, full_name, avatar_url, last_login, created_at, is_active }] }`

**`PATCH /api/clients/[id]/portal-users/[userId]`** (new) — Admin-only. Toggles `is_active` on a portal user.
- Validates user belongs to the client's organization
- Deactivated users are blocked by middleware on next request

### 4. Admin UI: Portal Access Panel

Expanded the existing `PortalAccessCard` (in `client-settings-section.tsx`) from just feature flag toggles to a full portal management panel with three sections:

**Invite links section:**
- "Generate link" button → creates invite → shows copyable URL
- List of all invites with status badges (Active / Used / Expired)
- Copy and revoke actions per invite
- Shows who used the invite (name + email) for used invites

**Portal users section:**
- Lists all portal users with avatar initial, name, email, last login date
- Power button to deactivate/reactivate each user
- Visual dimming for deactivated users
- User count badge

**Feature permissions section:**
- Existing toggles preserved: can_search, can_view_reports, can_edit_preferences, can_submit_ideas

### 5. Enhanced Join Flow

Updated `/portal/join/[token]` with dual-mode signup:

**Create account mode** (default):
- Existing signup form (name, email, password)
- On 409 (email exists): auto-switches to link mode with email pre-filled

**Link existing account mode:**
- Sign in with existing credentials
- Authenticates via Supabase → calls `POST /api/invites/link`
- On success: redirects to portal dashboard directly (already authenticated)

Toggle between modes via "Already have an account? / Don't have an account?" links.

### 6. Middleware: Deactivated User Blocking

When a portal user's `is_active = false`, middleware redirects them to `/portal/login?error=deactivated` on their next request.

## End-to-End Flow

```
ADMIN SIDE                                    CLIENT SIDE
─────────────────────────────────────────     ─────────────────────────────────

1. Admin onboards client
   /admin/clients/onboard
   → 5 steps: info → analyze → provision
     → strategy → review

2. Admin generates invite link
   (Review step has InviteButton,
    or Settings → Portal access panel)
   → POST /api/invites
   → Copies link to clipboard

3. Admin shares link with client              → 4. Client clicks invite link
   (email, Slack, text, etc.)                    /portal/join/{token}

                                              5a. NEW USER:
                                                  Fill form → POST /api/invites/accept
                                                  → Auth user created (email confirmed)
                                                  → users record (role=viewer, org linked)
                                                  → Token marked used
                                                  → Redirect to /portal/login

                                              5b. EXISTING USER:
                                                  Switch to "link" mode
                                                  → Sign in with existing creds
                                                  → POST /api/invites/link
                                                  → organization_id updated
                                                  → Token marked used
                                                  → Redirect to /portal/dashboard

                                              6. Client logs in
                                                 → Middleware checks role + is_active
                                                 → getPortalClient() scopes to org
                                                 → Feature flags gate pages
                                                 → RLS enforces data isolation

7. Admin manages portal access
   Settings → Portal access panel
   → View invites (active/used/expired)
   → View portal users (name, email, login)
   → Deactivate/reactivate users
   → Generate new invite links
```

## Data Isolation Model

Portal users are isolated at **three layers**:

1. **Middleware** — Checks `role = 'viewer'`, blocks if `is_active = false`
2. **App layer** — `getPortalClient()` scopes all queries by `organization_id`
3. **Database** — RLS policies enforce `organization_id` matching at the Postgres level

Even if layers 1-2 are bypassed (direct Supabase client calls), layer 3 prevents cross-org data access.

## Files Created

| File | Purpose |
|---|---|
| `supabase/migrations/044_portal_rls_hardening.sql` | RLS policies + `users.is_active` column |
| `app/api/invites/[id]/route.ts` | DELETE — revoke unused invite |
| `app/api/invites/link/route.ts` | POST — link existing account to invite org |
| `app/api/clients/[id]/portal-users/route.ts` | GET — list portal users for client |
| `app/api/clients/[id]/portal-users/[userId]/route.ts` | PATCH — toggle user active status |

## Files Modified

| File | Changes |
|---|---|
| `app/api/invites/route.ts` | Added GET method for listing invites with status |
| `app/portal/join/[token]/page.tsx` | Added dual-mode: signup + link existing account |
| `components/clients/client-settings-section.tsx` | Expanded PortalAccessCard with invite management + portal users |
| `components/clients/client-profile-form.tsx` | Pass `clientId` to PortalAccessCard |
| `middleware.ts` | Block deactivated users (`is_active = false`) |

## Non-goals

- **Email delivery of invites** — Copy-to-clipboard only. No Resend/email integration.
- **Multi-org portal users** — One user belongs to one organization. No multi-tenancy for viewers.
- **Portal user self-service** — No self-password-reset, no profile editing in portal settings.
- **Invite expiry extension** — Fixed 7-day expiry. Admin generates a new link if expired.
- **Granular RLS for knowledge_nodes** — Already has "authenticated read all" which is intentional (agency knowledge is shared).
