# Migration plan — lift brand-scoped routes to the root

**Status:** draft · Jack to sanity-check before I start moving files
**Scope:** route rename + auth-model rework; ~60 route files, ~200 internal links, two dashboards
**Out of scope:** building the new portal home UI (spec'd, not built, in this plan)

---

## Why

Today every logged-in user — admin or portal viewer — lands inside a brand. The selected brand is the center of gravity: Trend Finder, Brain, Notes, Brand Profile all operate on that one brand. The URL doesn't reflect that. `/admin/brain` reads like a team-ops page when it's actually "the brain for the brand I'm currently inside."

Goal: URLs match the mental model. Brand tools live at the root; `/admin/*` is reserved for cross-brand ops you only hit to manage the agency itself.

Secondary goal: clean split between the **portal home** (brand-scoped, what clients see on login) and the **admin dashboard** (operational — tasks, usage, proposals, notifications).

---

## The three buckets

### 1. Brand-scoped → move to root
Every route here operates on the currently selected brand. These lift out of `/admin/*` to top-level.

| Current | New |
|---|---|
**Slug brevity:** Jack prefers the shortest reasonable slug. `/admin/spying` already collapsed `/admin/competitor-intelligence` + `/admin/competitor-spying` into one dir (2026-04-24). Applying the same principle to the lifts below.

| Current | New |
|---|---|
| `/admin/finder/new` (Trend Finder) | `/finder/new` |
| `/admin/finder/monitors` (Trend Monitors) | `/finder/monitors` |
| `/admin/finder/[id]` | `/finder/[id]` |
| `/admin/strategy-lab` | `/lab` *(slug brevity)* |
| `/admin/strategy-lab/[clientId]` | `/lab/[clientId]` |
| `/admin/spying` | `/spying` |
| `/admin/ad-creatives` (Ad Generator) | `/ads` *(slug brevity — "Ads" in sidebar, /ads as URL)* |
| `/admin/brain` | `/brain` |
| `/admin/knowledge` (internal, rewritten from /brain) | `/knowledge` (dir stays; `/brain` is the public URL) |
| `/admin/brand-profile` | `/profile` *(slug brevity)* |
| `/admin/notes` | `/notes` |

### 2. Admin-only → keep under `/admin/*`
Cross-brand ops. Not brand-scoped — or brand-scoped only in a "pick a client from the list" way, not "operating on my active brand."

| Route | Purpose |
|---|---|
| `/admin/dashboard` | **Admin ops dashboard** (see §Dashboards) |
| `/admin/analytics` | Cross-brand analytics |
| `/admin/clients` | Client roster |
| `/admin/clients/[slug]/*` | Per-client admin management |
| `/admin/onboarding` | Client onboarding queue |
| `/admin/users` | Staff accounts |
| `/admin/team` | Team directory |
| `/admin/scheduling` | Shoot scheduling |
| `/admin/calendar` | Admin calendar view |
| `/admin/accounting` | Bookkeeping |
| `/admin/revenue` | Revenue hub |
| `/admin/proposals` | Proposal editor/list |
| `/admin/notifications` | Admin notifications inbox |
| `/admin/tasks` | Task board |
| `/admin/edits` | Editing pipeline |
| `/admin/shoots` | Shoots list |
| `/admin/meetings` | Meeting notes (if we keep this; see open questions) |
| `/admin/presentations` | Client presentations |
| `/admin/usage` | Platform usage (just renamed) |
| `/admin/settings` | Platform settings (Model / API key / Skills) |
| `/admin/account` | Personal account settings (just split) |
| `/admin/tools` | Internal tools |

### 3. Legacy / to-retire (Jack confirmed 2026-04-24)
| Route | Action |
|---|---|
| `/admin/moodboard` | **Retire** — functionality migrated into Notes |
| `/admin/nerd` | **Retire** — eliminated entirely |
| `/admin/ideas` | **Retire** — eliminated entirely |
| `/admin/meetings` | **Retire** — eliminated entirely |
| `/admin/pipeline` | **Retire** — renamed into existing surfaces |
| `/admin/search` | **Retire** — renamed to Trend Finder (now `/admin/finder/*`) |
| `/admin/ad-creatives` | Rename to `/admin/ad-generator` (then lift to `/ad-generator` per bucket 1) |
| `/admin/ad-creatives-v2` | Delete — see `docs/ad-creatives-v2-deprecation-checklist.md` |
| `/admin/analyze-social` | **Keep** at `/admin/analyze-social` — outbound share tokens (`/shared/analyze-social/[token]`) depend on this URL |
| `/admin/competitor-intelligence` | **Retired 2026-04-24** — collapsed into `/admin/spying` in prep commit |
| `/admin/competitor-tracking` | **Keep** (admin-only sub-rails) |
| `/admin/analytics` | **Keep** at `/admin/analytics` — cross-brand admin surface |

---

## Dashboards

Two dashboards, two URLs, one responsibility each.

### Portal home — `/` (new)
Brand-scoped. What a viewer sees on login. What an admin sees when they click the brand pill.

- Hero: the active brand's name + recent-activity strip
- Cards: recent Trend Finder runs, outstanding Strategy Lab threads, latest Notes, latest Brain updates, upcoming shoots
- No admin-only content (tasks, proposals, revenue, etc.)
- Works for both admin and viewer roles — same page, same brand context

### Admin dashboard — `/admin/dashboard` (exists, refactor)
Cross-brand ops surface. What you hit to see the state of the agency.

- Tasks (outstanding, by priority)
- Edits in progress
- Outstanding proposals (unsigned / expiring)
- Notifications (unread admin alerts)
- Usage rollup (platform cost this month, at-a-glance)
- Revenue MRR strip

Admin-only. Portal viewers never land here.

### Default redirects on login (resolved 2026-04-24)
- **One shared login** at `/login` for everyone — admin and viewer both hit the same form. The server detects the role after auth and routes:
  - Role `admin` → `/` (brand home with the pinned brand)
  - Role `viewer` → `/` (brand home scoped to their only brand)
- The current `/admin/login` and `/portal/login` routes become redirects to `/login`.
- `/admin/dashboard` stays as the ops surface, reachable from the sidebar; admins just don't *land* there by default.

---

## The auth model

Current auth model is implicit in the URL: `/admin/*` = admin, `/portal/*` = viewer, middleware redirects unauthenticated users.

New model (needs explicit middleware):

| Path prefix | Who can view | Behavior for wrong role |
|---|---|---|
| `/` (brand home) | Any logged-in user | — |
| `/<brand-tool>/*` (finder, brain, etc.) | Any logged-in user | Scopes to active brand via `getActiveBrand()` / `getPortalClient()` |
| `/admin/*` | `admin` / `super_admin` only | Redirect viewer to `/` |
| `/admin/login` | Anyone | — |
| `/portal/*` | **See §Portal fate** | — |

Implementation: promote the existing `/admin/*` auth check (per-page `createServerSupabaseClient().auth.getUser()` + role check) into either a shared `app/admin/layout.tsx` server component or `middleware.ts`. I'd lean layout — middleware is stricter on what it can do in Next 15 and the auth check is cheap.

---

## Portal fate

This is the biggest call to make. Two options:

**Resolved 2026-04-24 — Option A over two phases.**

- **Phase 1** (this plan): lift admin brand routes to root; `/portal/*` stays untouched. Admins + viewers both hit root URLs for brand tools; portal pages still exist for now.
- **Phase 2** (later): merge portal pages into the root equivalents once phase 1 has bedded in. Single implementation per feature; UI branches on role.

Rationale: one move at a time. If anything breaks in the root lift, `/portal/*` is an unchanged escape hatch for client-facing traffic. Once phase 1 is stable for a couple weeks, phase 2 lands cleanly.

---

## Rollout order (if we go Option A phase 1)

1. **Git-mv the brand-scoped directories** — `app/admin/brain → app/brain`, etc. Per the table above.
2. **Update every internal link** — `git grep "/admin/brain"` etc. for each moved route. Ditto command palette, Fyxer templates, notification deep links.
3. **Add redirect stubs** at every old path (e.g. `app/admin/brain/page.tsx` → `redirect('/brain')`), preserving querystring + dynamic segments. Same pattern I used tonight for `/admin/infrastructure` → `/admin/usage`.
4. **Promote auth to a shared layout** — `app/admin/layout.tsx` runs the role check once; pages under it stop doing their own.
5. **Create `app/layout.tsx` auth gate** — logged-out users hitting `/brain` bounce to login.
6. **Create `app/page.tsx`** — the new portal home. Spec it properly before building (not part of this plan doc).
7. **Update `admin-sidebar.tsx`** — rewire the NAV_SECTIONS to new hrefs; `ADMIN_ONLY_HREFS` now only includes `/admin/*` routes.
8. **Portal sidebar + layout** — portal still points at `/portal/*` in phase 1; no change.
9. **Test sweep** — route-matrix test updates, e2e auth boundary tests, notification deep-link tests.
10. **CLAUDE.md + architecture doc updates** — the route inventory needs to reflect the new shape.

Redirect table is append-only until bookmarks age out (~30 days per the conventions in this repo).

---

## Risk list

- **Auth regression.** Breaking the role-check during the move is a real risk. Mitigation: land the shared admin layout in its own commit *before* moving any files, so the auth change is reviewable on its own.
- **Brand-scoping leak.** A brand-scoped page at the root that forgets to scope queries to the active brand leaks data across brands. Every moved page needs a `getActiveBrand()` call at the top. Grep for `organization_id` / `client_id` filters before + after the move on each page to make sure they didn't drop on rename.
- **Share links.** `/admin/analyze-social` has outbound share tokens (`/shared/analyze-social/[token]`) that can't break. That's why it stays under `/admin`.
- **The test matrix.** `tests/route-matrix.ts` drives the e2e crawl. It'll need every new route added and every old route marked as "should redirect."
- **Bookmarks.** Existing admins + viewers have tab groups / pinned tabs. The redirect stubs catch them but feel slightly slower on first click (one extra hop). Worth it.

---

## All open questions resolved (2026-04-24)

- **Login:** unified at `/login` for both roles; post-auth routes to `/`
- **Portal fate:** Option A, phased — phase 1 lifts admin routes, phase 2 merges portal
- **Competitor Intelligence:** retired + collapsed into `/admin/spying` (shipped in prep commit)
- Retired entirely: `moodboard`, `nerd`, `ideas`, `meetings`, `pipeline`, `search`, `competitor-intelligence`
- `analytics`: keep at `/admin/analytics` (cross-brand admin)
- Slug brevity wins: `competitor-spying` → `spying`, `strategy-lab` → `lab`, `ad-creatives` → `ads`, `brand-profile` → `profile`

---

## Commit shape

I'd land this in ~4 commits so each is reviewable:

1. `feat(auth): promote admin role check to /admin/layout.tsx` — no route moves, just the auth consolidation
2. `refactor(routes): lift brand-scoped routes to root + redirects` — the big one
3. `feat(dashboard): split portal home + admin dashboard` — new `/` page + refactored `/admin/dashboard`
4. `chore: update tests, docs, sidebar, command palette for new route shape`

Each commit deploys cleanly on its own. The auth-first ordering means if anything goes wrong in the route moves, the auth boundary is already in place.
