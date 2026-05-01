# Spec: Self-Serve Connection Invites

Sent by an admin from the Connections matrix in Content Tools so a brand's
point of contact can land on a single page and one-tap reconnect every
account we asked for. Replaces the copy-link modal that exists today.

## Problem

Today the Connections tab in `/admin/content-tools` lets an admin click a
brand and copy per-platform connect URLs (`/connect/{slug}/{platform}`),
then forward each one to the client manually. Three pain points:

1. The admin has to send 3+ separate URLs and the client has to click
   each, log in once per platform, and confirm with the team out of band.
2. There is no signal back to the team when a client finishes connecting.
   Today we discover it only by opening the matrix and visually scanning.
3. The "Manual access" status in the matrix is misleading. It just means
   we have a profile URL on file. We do not have any actual access until
   Zernio reports the account connected. Today an operator can mistake a
   "Manual" cell for a working connection and not chase the client.

There is also no token-expiry surfacing. Zernio reports per-account
expiry on `/accounts/{id}/health`, but the matrix throws that away. Sixty
days later the token quietly dies and we find out from a failed post.

## Goal

Admin → "Send connection invite" → pick platforms → email lands in the
client's inbox → one click opens a Cortex page that lists the platforms
we asked for → client taps Connect on each → green check + thank-you →
team gets a Google Chat ping (optional) and/or admin email (optional) on
each connection.

Plus three smaller cleanups in the same surface:

- Drop the "Manual access" status. Collapse to **Connected**, **Disconnected**, **Not connected**.
- Expand the matrix beyond the five fixed columns. Top 5 (TikTok, Instagram, Facebook, YouTube, LinkedIn) stay always-visible; the rest of Zernio's supported platforms (e.g. Google Business, Pinterest, Twitter/X, Threads, Bluesky) live behind a dropdown so we can request them per-invite.
- Surface token expiry. Pull `tokenExpiresAt` from Zernio's per-account health endpoint and badge cells whose expiry is within 14 days.

## Out of scope

- Programmatic LinkedIn auth. Zernio still has no LinkedIn flow; the
  invite page renders LinkedIn as "Manual setup, ping us" rather than a
  Connect button.
- Rotating already-connected tokens automatically. The invite covers
  only the platforms the admin selects; reconnects of healthy accounts
  remain a manual decision.

## User flow

### Admin

1. Lands on `/admin/content-tools` → Connections tab.
2. Clicks a brand row → modal opens.
3. The modal lists every platform with current status (`Connected` /
   `Disconnected` / `Not connected`) and shows a Zernio expiry badge
   if applicable.
4. Admin checks the platforms to include in the invite. Defaults: every
   non-`Connected` platform from the top 5 is pre-checked. The "More
   platforms" dropdown adds rows for Google Business, Pinterest, X,
   Threads, Bluesky on demand.
5. Admin picks recipients from `contacts` rows for the brand (multi-select,
   primary contact pre-checked). Falls back to a free-text email field if
   no contact is on file.
6. Admin toggles two notify checkboxes (per-invite, defaults on if the
   destination is configured): **Google Chat** and **Email me on
   connect**.
7. Admin clicks "Send invite". Modal closes with toast, matrix refreshes.

### Client

1. Email arrives from `support@nativz.io` (Anderson alias when the brand
   is on AC). Subject: `{brand name}: connect your accounts`. CTA button:
   "Connect accounts".
2. Click → `https://cortex.nativz.io/connect/invite/{token}`. No login.
   Page header: "Hey {firstName}, let's reconnect {brand name}." One row
   per platform we asked for, with a status pill and a Connect button.
3. Tap Connect → Zernio OAuth → callback returns to the same invite page
   with a fresh ✓ check and the row dimmed to "Thanks, you're connected."
4. When all platforms in the invite are done, page swaps to a
   confirmation card: "All set. We'll take it from here."

### Team

For each successful connection, if the invite has it enabled:

- Google Chat webhook posts to the brand's `clients.chat_webhook_url`
  (falls back to a global ops webhook env var if the brand has none).
  Message: `🔌 {brand name} just reconnected {platform} as @{username}.`
- An email goes to the admin who sent the invite (read off `created_by`
  → `auth.users.email`). Same copy.

## Schema

### New table: `connection_invites`

```sql
create table connection_invites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  token text not null unique,
  platforms text[] not null,
  recipient_emails text[] not null,
  notify_chat boolean not null default true,
  notify_email boolean not null default true,
  completed_platforms text[] not null default '{}',
  expires_at timestamptz not null,
  last_opened_at timestamptz,
  completed_at timestamptz,
  sent_at timestamptz default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);
create index on connection_invites (client_id);
create index on connection_invites (token);
```

`expires_at` defaults to `now() + interval '30 days'`. `token` is a
nanoid-style 32-char URL-safe string minted server-side.

RLS: admins read/write everything. No portal access.

### Adds to `social_profiles`

```sql
alter table social_profiles
  add column token_expires_at timestamptz,
  add column token_status text;
```

`token_status` values: `'valid' | 'needs_refresh' | 'expired' | 'unknown'`.
Populated whenever the connections matrix fetches Zernio account health.

## API surface

### `POST /api/admin/connection-invites`

- Body: `{ clientId, platforms[], recipientEmails[], notifyChat, notifyEmail }`
- Auth: admin only.
- Behavior: validate client exists + has slug, mint token, insert
  invite row, send Resend email per recipient using the existing
  `sendUserEmail()` helper with the agency's branded template, return
  `{ id, token }`.
- Rate limit: minimal, just dedupe by `(client_id, recipientEmails sorted)` within the last 60s.

### `GET /api/public/connection-invites/[token]`

- No auth.
- Returns: `{ brandName, brandSlug, platforms: [{ key, label, status, username }], completed: bool }`.
- Stamps `last_opened_at` if null.
- 404 if the token is unknown or `expires_at < now()`.

### `POST /api/public/connection-invites/[token]/connect/[platform]`

- No auth, mirrors the existing slug-based kickoff.
- Validates the platform is in the invite's `platforms[]`.
- Builds an `OAuthStatePayload` with the invite token included so the
  callback can mark completion.
- Returns `{ authUrl }`.

### Updated: `GET /api/scheduler/connect/callback`

- After upserting the social profile, if the state token included an
  `invite_token`, append the platform to `completed_platforms`, fire
  the notify webhooks (per the invite's `notify_chat` / `notify_email`),
  set `completed_at` if all platforms are done, and redirect back to
  `/connect/invite/{token}?ok=1` instead of `/admin/scheduler`.

### Updated: `GET /api/admin/content-tools/connections-matrix`

- Drop the "manual" SlotStatus. A row that has a profile URL but no
  `late_account_id` becomes `'missing'` (chip color: gray).
- Pull token expiry: when a slot has a `late_account_id`, look up the
  cached `token_expires_at` and `token_status` columns and surface them
  on the response. The "Re-check" button (existing) triggers a Zernio
  `/accounts/{id}/health` sync that writes those columns, so we don't
  hammer Zernio on every matrix render.

## UI changes

### `components/admin/content-tools/connections-tab.tsx`

- `STATUS_META`: drop `manual`. Three statuses now.
- `PLATFORMS`: split into `CORE_PLATFORMS` (top 5) and `EXTRA_PLATFORMS`
  (googlebusiness, pinterest, x, threads, bluesky). Matrix table renders
  the 5 cores by default; an admin can toggle "Show all" to expand.
- `SendLinksModal` becomes `InviteBuilderModal`:
  - Multi-select platform list (status + checkbox per row).
  - Recipients: list of `contacts` for the brand with checkboxes.
  - Notify toggles (Chat + Email).
  - "Send invite" CTA. Replaces the per-row copy-to-clipboard buttons.
- `SlotCell` shows a small calendar icon if `tokenExpiresAt` is within
  14 days, with a tooltip ("Token expires in 9 days, send a reconnect
  invite").

### New page: `app/connect/invite/[token]/page.tsx`

- Public, no auth.
- Server component fetches the invite row + brand. 404s on unknown or
  expired tokens.
- Client island per platform that POSTs to the kickoff endpoint and
  redirects to the returned `authUrl`.
- After `?ok=1` param, refetch the invite to show fresh checks.
- Branded with the agency's logo (Anderson on AC slugs, Nativz everywhere
  else, inferred from `clients.agency_brand`).

## Notification format

Google Chat:
```
🔌 Avondale Private Lending just reconnected Instagram as @avondalelending.
```

Admin email subject: `Avondale Private Lending reconnected Instagram`.
Body: same one-liner plus a link to the matrix.

## Verification gates

1. `npx tsc --noEmit` clean.
2. `npm run lint` clean.
3. Dev server `localhost:3001`: matrix loads, modal opens, send fires
   (use a Jack-only test brand), invite link renders and at least one
   platform returns a valid Zernio authUrl.
4. Notify hooks: confirm Chat post lands when `LATE_WEBHOOK_SECRET`
   is set and `clients.chat_webhook_url` is configured. Skip if not.

## Build sequence

1. Migration 214: `connection_invites` table + `token_expires_at` /
   `token_status` columns on `social_profiles`.
2. Matrix API + tab UI: drop `manual`, expand platforms, show expiry
   badge.
3. Invite-builder modal replaces SendLinksModal.
4. `POST /api/admin/connection-invites` + Resend email.
5. Public invite page + connect kickoff endpoint.
6. Callback: invite-aware completion + notify hooks.
7. Health sync: small admin-only job that updates `token_expires_at` /
   `token_status` from Zernio. Triggered by the matrix "Re-check" button
   so we don't add a cron yet.
8. Typecheck, lint, smoke, commit, push.
