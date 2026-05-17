# PRD 01 — Architecture & Routing

**Status:** Shipped (`d39f93a8`).

## Goal

Stand up the `/admin/clients/[slug]/profile/*` route tree with a Mobbin-style left rail, nested inside the existing per-client outer shell. Every section gets a dedicated subpage; deep nesting lives inside the page (tabs / accordions), not in URLs.

## Non-goals

- No data editing in this PRD. All pages render `ProfileStub` placeholders.
- Old `/settings/*` routes stay live; new tree is built alongside.

## Structure

```
app/admin/clients/[slug]/profile/
  layout.tsx              ← rail + content shell
  page.tsx                ← redirects to /profile/overview
  overview/page.tsx
  identity/page.tsx
  assets/page.tsx
  users/page.tsx
  team/page.tsx
  deliverables/page.tsx
  notifications/page.tsx
  integrations/page.tsx
```

```
components/clients/profile/
  profile-rail.tsx        ← desktop rail + mobile horizontal strip
  profile-stub.tsx        ← placeholder used while sections are unbuilt
```

## Rail grouping

| Group | Items |
|---|---|
| Brand | Overview, Identity, Assets |
| People | Users, Team |
| Operations | Deliverables, Notifications, Integrations |

## Wiring

- Outer client shell (`components/clients/client-admin-shell.tsx`) gains a `Profile (preview)` entry with the Sparkles icon, sitting above the legacy `Info` entry so it's discoverable without disturbing the existing 5-item nav.
- Profile layout breaks out of the outer-shell gutter with negative margins, runs its own 1440-wide canvas, and re-applies horizontal padding for the content column.
- `ProfileRail` is a client component using `usePathname()` for active state. `ProfileMobileRail` mirrors it as a horizontal strip on lg- screens.

## Done criteria

- [x] Visiting `/admin/clients/<slug>/profile` redirects to `/profile/overview`.
- [x] All 8 rail items render their stub without errors.
- [x] Outer shell shows "Profile (preview)" linking to the new tree.
- [x] `npx tsc --noEmit` and `eslint` clean on new files.
