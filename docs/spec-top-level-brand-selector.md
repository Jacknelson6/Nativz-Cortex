# Spec — Top-level brand selector + sticky sidebar collapse

**Status:** Draft for Jack's approval
**Author:** Claude (Cortex session, 2026-04-21)
**Owner:** Jack Nelson
**Linear:** _to be filed on approval_

---

## Context

Cortex today forces users to attach a client/brand at the tool level — every major tool (Strategy Lab, Ad Creatives v2, Brand DNA, etc.) has its own picker, URL segment, or per-item attach button. That means a single working session jumps between pickers and requires the user to re-state "I'm working on brand X" three or four times.

At the same time, the admin sidebar auto-expands a parent group when you're inside a sub-item and **forces it to stay open** — the user cannot manually collapse the group while on a child route. This is a small but persistent papercut.

This spec addresses both, treating them as one coherent "session context model" change.

---

## Goals

1. **One brand, one session.** Attach the working brand once, at the top of the sidebar, and have every tool in the app read from that context automatically.
2. **Admin-only is unscoped.** Admin-only surfaces (team, accounting, knowledge graph, nerd/debug, integrations, pipeline across clients, etc.) ignore the selected brand.
3. **No forced sidebar state.** The user can always collapse a parent group, even when inside one of its children.

## Non-goals

- Portal changes. Portal users are already scoped via `user_client_access` + `x-portal-active-client` cookie (`lib/portal/get-portal-client.ts`). The portal's existing `BrandSwitcher` stays as-is.
- Reworking the underlying `clients` table. The selector reads what's already there.
- Replacing per-item "attach to client" pickers (`components/search/client-selector.tsx`) — those stay for one-off assignments like logging a task against a non-current brand.

---

## UX (from Jack's reference screenshot)

Top of the sidebar, left to right:

```
[Nativz logo — static]   [Brand pill — dropdown ⌄]
```

- The Nativz logo never changes and is not interactive (or links home).
- The brand pill shows the **current brand's logo + name**, same visual weight as the RankPrompt reference. Clicking opens a popover:
  - Search input (`⌘K` hint)
  - Scrollable brand list, current brand highlighted with a role badge ("Editor" / "Viewer" / etc. — for admins this is just "Admin" or omitted)
  - Footer: **All brands** link → `/admin/clients` roster, and a primary **+ Create brand** CTA
- When no brand is selected yet, the pill reads **"Select a brand"** and the dropdown opens to the search list immediately.
- Admin-only routes render the pill in a muted/ghost state with a tooltip: "Brand context not used here."

## Behavior

### Selection persistence
- Selected brand id stored in cookie `x-admin-active-client` (mirrors the portal pattern).
- Cookie is `httpOnly: false`, `sameSite: lax`, `secure` in prod, 180-day expiry.
- URL query param `?clientId=<uuid>` **overrides** the cookie when present — this preserves deep-linking and keeps existing `/admin/strategy-lab/[clientId]` routes working without migration.

### Reading the selection
- New server util: `lib/admin/get-active-client.ts` → `getActiveAdminClient()` returns `{ client, source: 'url' | 'cookie' | 'none' }`. Handles: fall back to cookie, then to "none", and in "none" state surfaces an inline CTA at the tool level ("Select a brand to continue").
- New client hook: `useActiveBrand()` → returns `{ brand, setBrand, isLoading }` backed by a React context seeded from a server component.

### Changing the selection
- Picking a new brand:
  1. Writes cookie via a server action `setActiveAdminClient(clientId)`.
  2. If the current route is `/admin/<tool>/[clientId]/...`, the selector replaces the `[clientId]` segment with the new id (preserves the rest of the path and query).
  3. If the current route is a flat tool (e.g. `/admin/strategy-lab` with `?clientId=`), updates the query param in place.
  4. If the current route is admin-only (e.g. `/admin/team`), no navigation — the cookie updates quietly.

### Empty / new-org state
- If the user has zero brands: dropdown shows only "+ Create brand" CTA.
- If the user has brands but none selected: on first visit to any client-scoped tool, inline empty state directs them to the pill.

### Sidebar collapse fix
- Change `components/layout/admin-sidebar.tsx`:
  - Replace `const isExpanded = childActive || expandedMenus.has(item.href)` with:
    - `expandedMenus` becomes a **persisted** `Set<string>` (localStorage key `cortex.sidebar.expanded`).
    - On mount, if `childActive && !hasUserInteracted(item.href)` → seed as expanded once.
    - User toggles always win. Navigating to a child route never flips an explicitly-collapsed parent back open.
  - Add a small `collapsedByUser` companion Set (or negative flag per item) so "I explicitly collapsed this" persists even if I later click back into a child.

## Data model

No schema changes required. Reuses existing `clients` table (see `docs/database.md`).

Touched columns only:
- `clients.id`, `clients.name`, `clients.slug`, `clients.logo_url`, `clients.is_active`, `clients.hide_from_roster`, `clients.agency`.

Selector visibility rule for non-super-admins: `is_active = true AND hide_from_roster = false AND (agency = <user's agency> OR super_admin)`.

## Routes impacted

### Keep route param (lowest-churn migration)
- `/admin/strategy-lab/[clientId]`
- `/admin/ad-creatives-v2/[clientId]`
- Any other `/admin/**/[clientId]/**` route.

The selector writes the new id into the `[clientId]` slot and navigates.

### Read from context (new)
- `/admin/strategy-lab` (index) and any tool that currently prompts "pick a client" as its first screen — those prompts go away and the tool opens on the cookie-selected brand.
- Per-item attach pickers (tasks, searches, notes) stay, but their default selection is the active brand.

### Admin-only (ignore selector)
- `/admin/dashboard`, `/admin/tasks`, `/admin/pipeline`, `/admin/shoots`, `/admin/scheduler`, `/admin/accounting`, `/admin/clients`, `/admin/team`, `/admin/knowledge`, `/admin/nerd/**`, `/admin/presentations`, `/admin/notes`, `/admin/settings/**`, `/admin/integrations`.

## Security notes

- Cookie contains only the `clients.id` UUID. Server util **always re-authorizes** on read: confirms the requesting user is admin and (for non-super-admins) that the client's `agency` matches the user's agency.
- API routes do NOT trust the cookie blindly — same auth check on every request that mutates client-scoped data. The cookie is a UX convenience, not an authz primitive.
- No change to portal cookie `x-portal-active-client` — separate namespace on purpose.

---

## Implementation plan

Ordered so each step ships independently and the app stays green between steps.

### Step 1 — Sidebar collapse fix _(small, standalone, ship first)_
- Edit `components/layout/admin-sidebar.tsx` expand logic.
- Persist `expandedMenus` to localStorage.
- Add "user-collapsed wins" rule.
- Manual QA: navigate into Tools → Brand Audit, collapse Tools, confirm it stays collapsed across sub-item navigation and reloads.

**Est:** 1–2h.

### Step 2 — Context plumbing
- `lib/admin/get-active-client.ts` server util.
- `lib/admin/active-client-context.tsx` provider + `useActiveBrand()` hook.
- Server action `app/admin/_actions/set-active-client.ts`.
- Cookie util additions in `lib/supabase/cookies.ts` (or equivalent) — `x-admin-active-client`.
- Unit tests for the auth re-check.

**Est:** ~1 day.

### Step 3 — Sidebar selector UI
- New component `components/layout/admin-brand-pill.tsx`.
- Slot into `components/layout/admin-sidebar.tsx` header row next to static Nativz logo.
- Popover UI (reuse shadcn/ui Popover + Command).
- Hook to `useActiveBrand()` + `setActiveAdminClient` action.
- Empty / loading / muted-on-admin-route states.

**Est:** ~1 day.

### Step 4 — Wire tools to context
- For each `/admin/**/[clientId]` route: update the landing/index page to redirect to `/admin/tool/<cookie-clientId>` when cookie present and no param.
- For flat tools: read `useActiveBrand()` (client) or `getActiveAdminClient()` (server) instead of prompting.
- Remove per-tool "pick a client" landing screens (or convert to empty state when selector is empty).
- Tools list: Strategy Lab, Ad Creatives v2, Brand DNA, Moodboard, Ideas, Idea Generator, Knowledge (client-scoped views), Analytics (social), Ad Library, any other `?clientId=` consumer.

**Est:** 2–3 days (spread across tools; each tool is a small PR).

### Step 5 — Polish + QA
- Playwright test: login as admin → select brand → navigate across 3 tools → confirm context sticks.
- Playwright test: super-admin vs agency-scoped admin sees different brand lists.
- Visual QA pass on the pill: dark mode, empty state, long brand names, no-logo fallback.

**Est:** ~½ day.

**Total:** ~5–6 dev days, shippable in 5 PRs (one per step).

---

## Open questions for Jack

1. **Should the brand pill persist across logout/login?** Cookie expires in 180d regardless — but on logout we could clear it. Recommendation: clear on logout.
2. **Ghost state on admin-only routes:** is a muted pill + tooltip enough, or do you want the pill to disappear entirely on those routes? (Reference screenshot keeps it visible — I'm leaning visible + muted.)
3. **Keyboard shortcut `⌘K`:** the screenshot shows a `⌘K` hint. Do you want `⌘K` to open the brand switcher globally, or should global `⌘K` remain the app command palette and use a different hint (e.g. `⌘B`) for brand? (Recommendation: `⌘B` opens brand, keep `⌘K` for cmdk.)
4. **Super-admin "all agencies" view:** today `clients.agency` filters client lists. Confirm super-admins should see every brand across every agency in the pill. (My read: yes.)

---

## Acceptance criteria

- [ ] Brand pill renders in the top-left of the admin sidebar next to the static Nativz logo on every `/admin/**` route.
- [ ] Selecting a brand updates cookie + URL (when relevant) + context in one action, with no full-page reload on flat tools.
- [ ] All previously per-tool pickers default to the active brand; no tool prompts "pick a client" when the cookie is set.
- [ ] Admin-only routes show the pill in muted state and ignore its value.
- [ ] Sidebar parent groups respect explicit user collapse, even when inside a child route; collapse state survives reload.
- [ ] No portal-side regression (portal `BrandSwitcher` + `x-portal-active-client` untouched).
- [ ] Server always re-authorizes the cookie value; manipulating the cookie cannot grant access to a brand the user doesn't own.
