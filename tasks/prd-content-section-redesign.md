# Content section redesign — Calendar + Review with admin/viewer modes

**Owner:** Jack · **Started:** 2026-04-29 · **Branch:** main (push direct)

## Why

The "Calendar" surface has grown beyond a single page. Editors need to schedule + automate; clients (viewers) need to review, edit captions, retime, and look back at older campaigns. We also have an emerging pattern of sending paid-media content for review through `/c/[token]` share links, but no way to discover or manage them after creation. Both audiences currently get the same UI, which is confusing for clients (they see automation buttons they can't use) and limiting for editors (no review-link inventory).

This PRD splits the surface into a "Content" nav group with two subpages — **Calendar** (schedule + browse) and **Review** (share-link inventory) — and gates capabilities by role on the calendar itself. It also fixes a month-grid overflow bug and re-skins the public review page so AC clients see AC branding.

## Out of scope

- Moving `/admin/calendar` to a brand-root `/calendar` URL — that's the separate "brand-root migration" project and stays paused.
- Reworking the underlying drop / scheduled-post / Mux pipeline.
- Adding new automations to the auto-schedule UI.

## Audience model

| Role | What they see on Calendar | What they see on Review |
|---|---|---|
| **admin / super_admin** | Full scheduler. Auto-schedule, new content, library, share-link creation, automation tools. | Full bento. Create new share link, drill into review threads, see expired links. |
| **viewer** (client portal) | Same calendar layout — read-only on schedule slots. Edit captions, tags, collaborators, dates (drag/drop). No "schedule new content", no auto-schedule, no library import, no automation panels. | Bento (read-only). Open links to view feedback / approval state. Cannot create or revoke. |

A viewer dragging a post to a new date is treated the same as an admin doing it — it just patches `scheduled_posts.scheduled_at`. The platform-side schedule (Zernio / Monday push) still happens on admin commit.

## Routes

Keep current admin URLs to avoid breaking bookmarks. Viewer URLs follow the brand-root convention already established by `app/(app)/calendar`.

| Sidebar label | Admin URL | Viewer URL | File(s) |
|---|---|---|---|
| Content → Calendar | `/admin/calendar` (existing) | `/calendar` (rebuilt) | `app/admin/calendar/page.tsx`, `app/(app)/calendar/page.tsx` |
| Content → Review | `/admin/calendar/review` (new) | `/calendar/review` (new) | `app/admin/calendar/review/page.tsx`, `app/(app)/calendar/review/page.tsx` |

The library subpage (`/admin/calendar/library`) and per-drop detail (`/admin/calendar/[id]`) stay where they are — they're admin-only utilities, not nav-worthy.

## Sidebar change

In `components/layout/admin-sidebar.tsx`, replace the flat `Calendar` row with a `Content` parent that has two children:

```ts
{
  href: '/admin/calendar',          // default child
  label: 'Content',
  icon: CalendarDays,
  children: [
    { href: '/admin/calendar',         label: 'Calendar', icon: CalendarDays },
    { href: '/admin/calendar/review',  label: 'Review',   icon: MessagesSquare },
  ],
},
```

`VIEWER_UNIFIED_HREFS` already remaps `/admin/calendar` → `/calendar`. Extend it for `/admin/calendar/review` → `/calendar/review` so the viewer sidebar lands on the correct routes.

## Phase plan

### Phase 1 — Sidebar restructure
- Edit `admin-sidebar.tsx` per above.
- Extend `VIEWER_UNIFIED_HREFS` to cover the Review child.
- Manual: confirm the parent expands, both children navigate, and viewer mode hides nothing it shouldn't (Review must be visible to viewers).

### Phase 2 — Review subpage (admin + viewer)
Build `/admin/calendar/review` and `/calendar/review`. Same component, role-gated CTAs.

**Layout:** Bento grid of cards, one per share link, ordered by `created_at desc`.

Card shows:
- Drop date range (e.g. "Apr 28 → May 5")
- Brand name (admin only — viewers are already brand-scoped)
- Post count + per-status counters (approved / changes-requested / pending)
- Status pill: `revising` (any changes_requested unresolved), `ready for review` (default), `approved` (all approved), `expired` (past expires_at)
- Last viewed at (from `content_drop_share_links.last_viewed_at`)
- "Open" link → `/c/[token]` (opens in new tab)

**Admin extras:**
- "Create new share link" button (top right) → opens existing share dialog (whatever `/admin/calendar` uses today; reuse it directly).
- Per-card overflow menu: Copy link · Revoke (sets `expires_at` to now) · View comments inline (lazy-loaded).

**Data source:** new GET endpoint `/api/calendar/review` that returns share links scoped by:
- admin: all (or by active brand if one is selected)
- viewer: filtered to `client.organization_id` of caller

Status derivation runs server-side (cheap aggregate over `post_review_comments` joined to `post_review_link_map`).

### Phase 3 — Calendar admin/viewer mode
The current `SchedulerContent` (419 LOC) renders both sides today via `app/(app)/calendar/page.tsx` (which is currently a static drop list, not the rich grid).

- Promote `app/(app)/calendar/page.tsx` from "drop list" to "full SchedulerContent in viewer mode."
- Add a `mode: 'admin' | 'viewer'` prop to `SchedulerContent`. Default `'admin'` to keep existing call sites unchanged.
- Inside the component, gate by mode:
  - Hide: "Auto-schedule", "Import from library" / new media upload, "Approve & schedule batch", platform-connection prompts, anything that posts to Zernio/Monday.
  - Keep: month/week/day toggles, drag-to-reschedule, click-to-open-post-editor, caption/tag/collaborator edits, scheduled-time edits.
- Server checks: every PATCH that a viewer can hit (caption, tags, collabs, schedule) must verify `user_client_access` for the post's client_id. If none of these endpoints exist yet for the viewer route, add them under `/api/calendar/...` with the viewer-friendly auth path.
- The viewer page's `redirect('/admin/calendar')` for admins stays — admins keep the rich admin URL.

### Phase 4 — Month-grid overflow bug
Bug: in April view, May 1 has a post but the spillover cells at the bottom of the grid render blank.

Root cause: `useSchedulerData.fetchPosts(clientId, startDate, endDate)` is called with `[monthStart, monthEnd]` — May 1 isn't in the result set. The grid cells *do* render (they're just opacity-40), so it's purely a data-window problem.

Fix: in the parent of `<CalendarView>` (likely `scheduler-content.tsx`), compute `gridStart = first Monday on/before monthStart` and `gridEnd = last Sunday on/after monthEnd`, then call `fetchPosts(clientId, gridStart, gridEnd)`. Same fix applies to week view trivially (it already uses a 7-day window).

Verify: switch to April with May 1 post, confirm the May 1 spillover cell shows the post badge.

### Phase 5 — AC re-skin for `/c/[token]`
The public review page imports `useBrandMode()` but doesn't use it. Two AC-specific things need to change when `brandMode === 'anderson'`:

1. **Logo:** swap the hardcoded Nativz `<img src="/nativz-logo.png">` for `/anderson-logo-dark.svg` (already in `public/`).
2. **Color tokens:** the page uses the global `accent-text`, `accent-surface`, `bg-surface` tokens — those are already brand-mode-aware via `data-brand-mode` on `<html>`. Confirm by viewing the page on `cortex.andersoncollaborative.com` and verifying the accent shifts. Any hardcoded `bg-blue-…` / `text-blue-…` classes in the file get swapped to tokens (`accent-surface`, `accent-text`).
3. **Title / page metadata:** `clientName` already drives the H1; the surrounding chrome ("Nativz" wordmark in the header / share footer) needs to read from `useBrandMode()` and switch to "Anderson Collaborative" when AC.

Brand resolution is already done by middleware (hostname → `data-brand-mode`), so the share link itself doesn't need any new data. Reviewers on `cortex.andersoncollaborative.com/c/[token]` get AC; reviewers on `cortex.nativz.io/c/[token]` get Nativz.

## Verification gates per phase

For each phase:

```
npx tsc --noEmit
npm run lint
# manual smoke: dev visual on /admin/calendar, /admin/calendar/review, /calendar, /calendar/review, /c/[token]
git commit -m "..."
```

Phase 5 also verifies on `cortex.andersoncollaborative.com` (or by toggling brand mode locally via the DevTools `data-brand-mode` attribute).

## Open questions (resolved during build, not blockers)

- **Q:** Does Review include expired links? **A:** Yes, with greyed-out card + "Expired" pill. Admins can rotate expiration via the overflow menu.
- **Q:** Does viewer Review show *all* their org's links or only ones they can access? **A:** All — viewers in a portal share an org. If we ever introduce per-user link gating, scope it then.
- **Q:** Does the admin Review page filter by active brand pill? **A:** Yes — same active-brand-pill convention as `/admin/calendar`. Nullable filter ("All brands" view) for the cross-brand inbox use case.

## Done = shipped

- Sidebar shows "Content > Calendar / Review" for both roles
- Both subpages render with role-appropriate features
- Month grid shows posts in spillover cells
- Public review page on AC subdomain shows AC logo + tokens
- Type-checks pass, lint passes, all changes pushed to main
