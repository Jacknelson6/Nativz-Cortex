# PRD: Client Avatar Overhaul

Two coupled PRDs. Ship in order: A before B (A populates the data B is going to render). Both can be in the same branch.

- **PRD A** — Social profile picture scrape & sync (data layer)
- **PRD B** — Universal circular avatar + no-stale fallback (visual layer)

---

## Background

Today every surface that shows a client (clients grid, brand pill in the sidebar, switcher dropdowns, share links, future PDFs/emails) hits one of three states:

1. A logo image at `clients.logo_url` (best case, mostly via og:image / apple-touch-icon scraped during onboarding in `app/api/clients/analyze-url/route.ts`).
2. A deterministic letter disc fallback rendered by `<ClientLogo>` (`components/clients/client-logo.tsx`) using `getInitials()` + an 8-color hash palette.
3. A "rounded-square globe" placeholder when a stored `logo_url` 404s or the underlying image broke (visible on Double B Hat Co. in the clients grid screenshot).

The result is mixed shapes (the brand pill in `components/layout/admin-brand-pill.tsx:277` is `rounded-md`, the grid card is circular), mixed quality (some clients get the real og:image, some fall back to a generic favicon URL pattern, some end up on the broken-globe state), and the wrong product feeling. Real prospects recognize themselves by their Instagram avatar, not by a colored letter.

Jack's spec: pull the Instagram profile picture from each client's website during the existing onboarding scrape. If no Instagram, walk Facebook → YouTube → TikTok → other detected social. Only fall back to the website's favicon if no social exists. **Never** show a letter disc or a broken globe again, those are forbidden states post-ship. And every surface in the app gets a circular avatar.

---

# PRD A — Social profile picture scrape & sync

## Goal

When a new client/prospect is created, populate `clients.logo_url` from a real social profile picture, with a deterministic fallback chain. Existing clients get a one-time backfill.

## Non-goals

- Per-platform handle management UI (out of scope, only the picture matters here).
- Periodic re-scrape / freshness cron. One scrape at creation + one manual "Refresh logo" admin action. If Jack wants a freshness cron later, it's a follow-up.
- OAuth-authenticated platform APIs. We are doing public, unauthenticated scrapes only.

## User stories

- **As a Nativz strategist** creating a prospect via the existing "Analyze URL" flow, I want the client's Instagram profile picture to land as their Cortex logo automatically, so the clients grid feels real on day one.
- **As an admin** looking at a client whose logo looks stale or wrong, I want a "Refresh logo" action that re-runs the scrape on demand.
- **As a viewer in the portal**, I should never see a colored-letter disc or a broken globe icon for my own brand. If we couldn't find anything, I see my website's favicon, full stop.

## Logo source priority

Hard-ordered fallback chain. Walk top to bottom and stop on the first one that returns a usable image (HTTP 200, content-type `image/*`, non-zero bytes, not a known "default avatar" hash, see "Stale detection" below).

1. **Instagram profile picture** (from `instagram_handle` detected on the website).
2. **Facebook profile picture** (Page or profile, from `facebook_handle`).
3. **YouTube channel avatar** (from `youtube_handle` / channel URL).
4. **TikTok profile picture** (from `tiktok_handle`).
5. **LinkedIn company logo** (from `linkedin_url`, if detected).
6. **Website favicon** — highest-resolution available. Try in order: `apple-touch-icon` (180×180+ ideally), `icon` link with largest declared size, `/favicon.ico`. **No og:image fallback here**, og:image is often a marketing hero shot, not a brand mark.
7. **Hard fail** — leave `logo_url` NULL and let the renderer decide what to show (see PRD B "No-stale rule"). Never store a placeholder URL.

The platform order (Instagram first) reflects Jack's spec and the reality that short-form video clients almost always have a populated IG avatar.

## Scraping mechanics

Three options per platform; pick the cheapest that works reliably:

| Platform  | Approach                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------- |
| Instagram | `https://www.instagram.com/{handle}/?__a=1` is gone; use the public profile HTML, parse `og:image` from `<meta property="og:image">`. Fallback: hit `https://r.jina.ai/https://www.instagram.com/{handle}/` (existing pattern in the codebase if SearXNG isn't running). |
| Facebook  | Public page HTML, parse `og:image`. Page must be public; private profiles return a generic avatar (filter via "Stale detection"). |
| YouTube   | `https://www.youtube.com/@{handle}` HTML, parse `og:image` or the `<link rel="image_src">`. Channel ID URLs (`/channel/UC...`) handled the same. |
| TikTok    | Public profile HTML, parse `og:image`. Often returns a CDN URL. |
| LinkedIn  | Public company page HTML, parse `og:image`. LinkedIn aggressively rate-limits, accept failure silently and move down the chain. |
| Favicon   | Existing logic already lives in `app/api/clients/analyze-url/route.ts`. Refactor into a shared `resolveFavicon(url)` helper. |

All scrape calls go through a single `lib/scrapers/social-avatar.ts` module with one exported function: `resolveBrandAvatar({ website, socials })` returning `{ source: 'instagram' | 'facebook' | 'youtube' | 'tiktok' | 'linkedin' | 'favicon' | null, url: string | null }`. Each platform has its own internal function with a 4s timeout and a try/catch that returns null on any failure. The orchestrator walks the chain.

## Storage & schema

Existing `clients.logo_url` stays the canonical column, every surface in PRD B reads from it.

Add two **provenance** columns so we can show "where this came from" in admin and decide later whether to re-scrape:

```sql
ALTER TABLE clients
  ADD COLUMN logo_source TEXT
    CHECK (logo_source IN ('instagram','facebook','youtube','tiktok','linkedin','favicon','manual_upload', NULL)),
  ADD COLUMN logo_resolved_at TIMESTAMPTZ;
```

`manual_upload` is reserved for the future when admins drag-drop a custom logo. `logo_resolved_at` lets a backfill job know whether to re-touch a row.

**Why we don't persist the raw social URL** for now: the picture is the only thing the product needs. If we later want a "Refresh logo" button that re-scrapes Instagram, the handle is already in the existing `social_sources` extraction (and we can add a proper `social_profiles` JSONB column in a follow-up PRD, out of scope here).

**Storage of the image itself**: store the public URL Instagram/Facebook/etc. hand us as-is in `logo_url`. Do **not** proxy through Supabase Storage. Reasons: (1) social CDN URLs are stable on a multi-month timescale and that's good enough for our cadence, (2) avoiding a mirror keeps the migration trivial. If TikTok URLs start expiring inside 30 days (it has happened historically), we add a Supabase Storage mirror as a follow-up, not a blocker.

## Stale detection

Reject these and walk to the next platform:

- HTTP non-200, or content-type not `image/*`.
- Response body under 1 KB (Instagram default-avatar is ~150 bytes).
- A known set of default-avatar hashes (start with Instagram's anonymous PNG SHA256 hash; add others as we encounter them). Maintain in `lib/scrapers/social-avatar.ts` as a const.
- For favicons, reject Google's generic globe (`gstatic.com/favicon` default) and any image under 16×16.

## Where it bolts on

- `app/api/clients/analyze-url/route.ts` — extend the existing `socials` extraction to call `resolveBrandAvatar()` and return the picked URL + source in the payload. The "Analyze URL" preview UI should show the proposed avatar circular, like it'll appear in the app.
- `app/api/clients/route.ts` (POST) — accept `logo_url` and `logo_source` in the body and write both.
- New endpoint: `POST /api/clients/:id/refresh-logo` — admin-only, re-runs `resolveBrandAvatar()` for an existing client using stored handles + website. Returns the new URL or 404 if nothing found. UI: a "Refresh logo" item in the client's overflow menu (`components/clients/client-search-grid.tsx`'s `…` dropdown).
- New script: `scripts/backfill-client-logos.ts` — iterates every client with NULL `logo_source` or `logo_source = 'favicon'` and runs the resolver. Rate-limited at 1 client / 2s. Jack runs once after deploy. Logs every flip ("Double B Hat Co.: globe → instagram").

## Success criteria

- Every new client created via "Analyze URL" lands with a non-null `logo_url` AND `logo_source` in {instagram, facebook, youtube, tiktok, linkedin, favicon}.
- Backfill resolves ≥80% of existing prospects/clients to a social source (not favicon).
- No row in `clients` has a stored `logo_url` that 404s, after backfill, within the same day.
- The "Refresh logo" action returns within 6 seconds p95.

## Risks

- **Instagram blocking**: public profile HTML can rate-limit. Mitigate with the `r.jina.ai` proxy fallback already used elsewhere in the codebase, and accept that a small % of scrapes will fall through to favicon. Don't add login/cookies.
- **TikTok URL expiry**: if we see 30-day-or-less expiries in real data, the mirror-to-Supabase-Storage follow-up jumps to top of the backlog.
- **Privacy**: only scraping publicly available profile pictures of accounts the brand itself linked from their website. No DMs, no scraping individuals.

---

# PRD B — Universal circular avatar + no-stale fallback

## Goal

Every client avatar in Cortex (admin, portal, share links, future emails/PDFs) renders as a perfect circle using the same primitive, and we eliminate two forbidden states: the letter-disc fallback and the broken-globe placeholder.

## Non-goals

- Changing avatar sizes/spacing on existing screens. Same dimensions, just circular and using the same primitive.
- Touching team-member avatars or user avatars (those aren't client logos and have their own component).

## The forbidden states

After this PRD ships, the following can never appear for a client in production:

1. A solid-color disc with the client's initials.
2. A `rounded-md` / `rounded-lg` / square wrapper around a client logo (the brand pill, the analyze-URL preview, dashboard cards, anywhere).
3. A broken image fallback (`onError` showing the alt text or a `lucide-react` `Building2` / globe icon in a square).
4. A static globe placeholder rendered server-side because `logo_url` was NULL.

The first three are pure rendering bugs we delete. The fourth is prevented by PRD A — by the time PRD B lands, `logo_url` is always populated to *something real* (social or favicon).

## What replaces the letter-disc fallback

If PRD A delivers, the letter-disc path becomes dead code for clients. We still need a graceful "image hasn't loaded yet OR is currently 404'ing transiently" UI for the half-second between mount and `<img>` resolution. The chosen pattern:

- Circular `bg-surface-muted` (a low-contrast neutral fill, matching `bg-surface` token system) with a centered, **monochrome** Lucide `Building2` icon at 50% of avatar diameter, `text-text-muted` color. Same shape, no color hash, no letters.
- This is the loading skeleton AND the worst-case "scrape returned nothing and even favicon failed" fallback. It reads as "neutral brand placeholder" rather than "Cortex couldn't find anything."

`getInitials()` + the 8-color palette get deleted from `client-logo.tsx`. Component surface stays the same (`<ClientLogo src name size />`) so callers don't change, but internals collapse to: real image OR neutral placeholder. No third branch.

## Component refactor

`components/clients/client-logo.tsx`:

- Always `rounded-full`. Remove the (unused but available) shape variants.
- Drop the `abbreviation` prop and any code that calls `getInitials()`.
- Drop `colorFor(name)` and the palette.
- `onError` swaps to the neutral placeholder, also rounded-full.
- `noBacking` prop stays (some surfaces want no border).
- Add a `'use client'`-safe `loading="lazy"` and `decoding="async"` on the `<img>`.

## Surfaces to migrate

All of these get changed to consume `<ClientLogo>` (or are already on it and just need the shape audit):

| Surface                                                                | Current                                                  | Target                                            |
| ---------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------- |
| `components/clients/client-search-grid.tsx` (clients grid card)        | `<ClientLogo>` size `lg`, circular (already correct, but globe fallback bug visible on Double B Hat Co.) | `<ClientLogo>` size `lg`. Bug solved by PRD A populating `logo_url`. |
| `components/layout/admin-brand-pill.tsx:277,286` (sidebar brand pill)  | Raw `<Image>` with `rounded-md object-cover`, square fallback bubble with `rounded-md bg-accent-surface` | `<ClientLogo size="sm">`, no `rounded-md` anywhere |
| Brand pill dropdown rows                                               | Same square `<Image>` pattern, repeats per row           | `<ClientLogo size="sm">`                          |
| `/admin/dashboard` brand chips / cards                                 | Audit pass                                               | `<ClientLogo>`                                    |
| Topbar breadcrumb client name (if logo shown)                          | Audit pass                                               | `<ClientLogo size="sm">`                          |
| Invite / connect landing pages                                         | `<ClientLogo size="xl">` already circular                | Confirm no regression, smoke test               |
| Share-link wrappers (`/c/[token]`, review modal, calendar share)       | Audit pass; some show `client.logo_url` as raw `<img>`  | `<ClientLogo>`                                    |
| Portal screens (`/portal/...`)                                         | Audit pass                                               | `<ClientLogo>`                                    |
| Email senders (`docs/email-style.md` patterns)                         | Audit pass; some include client logo inline             | Use a server-rendered circular wrapper. CSS `border-radius: 9999px` works in modern email clients; clip via `<img>` width/height + `border-radius` and accept that Outlook 2007 squares it (acceptable). |
| Branded PDFs (`project_branded_pdfs.md`)                               | Audit pass                                              | @react-pdf `<View>` with `borderRadius: avatar/2` |

The migration is mechanical, search-and-destroy every raw `<img src={client.logo_url}` and every `rounded-md`/`rounded-lg`/`rounded-xl` that wraps a logo. A grep checklist is the acceptance criterion.

## Where it bolts on

1. Refactor `components/clients/client-logo.tsx` per "Component refactor" above. One commit.
2. Sweep every file containing `client.logo_url` or `client?.logo_url` or `logo_url` and replace inline rendering with `<ClientLogo>`. One commit per surface area (admin, portal, share-links, email, PDF), so a regression is bisectable.
3. Grep-test gate (added to `npm run lint` or as a separate `scripts/check-avatar-shapes.ts`):
   - Fails if a `.tsx` file outside `components/clients/client-logo.tsx` contains `client.logo_url` rendered inside an `<img>` or `<Image>` without going through `<ClientLogo>`.
   - Fails if `getInitials` is imported anywhere in a client-rendering context.
   - Optional, can ship without if it proves too fiddly. Manual checklist below covers the same ground.

## Manual visual QA checklist (the ship gate)

Run after both PRDs land. Visit each and confirm: (a) shape is circular, (b) image is the real social/favicon avatar from PRD A, (c) no letter discs, (d) no broken globes.

- `/admin` clients grid (all status sections, grid + list view)
- `/admin/dashboard` (brand chips, recent activity rows)
- Sidebar brand pill, both states (collapsed + expanded dropdown)
- Topbar breadcrumb across `/admin/clients/[id]/...` deep routes
- `/admin/calendar` event cards
- `/admin/editing/[id]` review modal header
- `/c/[token]` calendar share, `/share/...` proposal pages
- `/portal/dashboard` and `/portal/research`
- One outbound email (drop summary or weekly recap, use existing preview tooling)
- One PDF (TopicPlan export via the branded PDF flow)

## Success criteria

- Zero `rounded-md|rounded-lg|rounded-xl|rounded-sm` on any element that contains a `client.logo_url`. Grep verified.
- Zero references to `getInitials` in client-avatar rendering paths.
- Every avatar surface in the manual QA list shows a real image (social profile pic for ≥80% of clients per PRD A, favicon for the rest, neutral Building2 placeholder only during load).

## Risks

- **PRD A delivery slips and PRD B ships first**: the neutral Building2 placeholder will look bare for every client missing a `logo_url`. Mitigation: ship A first, in the same branch. Don't merge B until A's backfill has run on staging.
- **Email circle clipping in Outlook**: see table above. We accept the regression for Outlook 2007/2010 — a fraction of a percent of opens, and the message is functionally identical with a square avatar.

---

## Sequencing summary

1. Branch off main.
2. Migration: add `logo_source` + `logo_resolved_at` columns.
3. Build `lib/scrapers/social-avatar.ts` and wire into `analyze-url` route + creation route.
4. Build `POST /api/clients/:id/refresh-logo` + UI hook in the clients-grid overflow menu.
5. Run `scripts/backfill-client-logos.ts` on staging, eyeball the diff, then prod.
6. Refactor `<ClientLogo>` to circle-only + neutral placeholder.
7. Sweep every offending surface (brand pill first, it's the most visible regression in the screenshot).
8. Manual QA checklist, then merge to main.

One branch, two PRDs, in that order.
