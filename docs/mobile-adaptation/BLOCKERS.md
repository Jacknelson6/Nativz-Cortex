# Mobile adaptation — open blockers

## 1. `/deliverables`

**File:** `app/(app)/deliverables/page.tsx`
**State:** Has uncommitted local edits (Jack's WIP, rewriting the page from the old `/credits` flow).

The loop did not touch this file because it has WIP that pre-dates the
mobile adaptation work, and the playbook forbids entangling changes
into Jack's working tree. Once his rewrite lands on main, this page
needs its own mobile pass — the PRD at
`docs/mobile-adaptation/prds/brand/deliverables.md` describes the
target shape (KPI strip 2-up, pipeline → horizontal-snap columns on
sm+, tabbed segmented control under sm, sticky bottom CTA).

**Unblock:** commit or stash Jack's WIP, then re-run iteration on this surface.

---

## 2. `/admin/content-tools`

**File:** `components/admin/content-tools/content-tools-shell.tsx`
**State:** Has uncommitted local edits (Jack's WIP) including merge conflict markers.

The shell is the 6-tab admin command surface. Same reason as
deliverables: do not touch a dirty working file. Once it merges, this
surface needs the playbook treatment per
`docs/mobile-adaptation/prds/admin/content-tools.md` (tab pill row
already uses horizontal scroll; table → card list per tab; filter chip
row sticky in mobile header).

**Unblock:** commit or stash WIP + resolve merge conflicts on the shell, then re-run iteration on this surface.

---

## Everything else

Every other PRD in `docs/mobile-adaptation/prds/**` is ticked off in
`PROGRESS.md`. The mobile foundation (bottom nav, top bar, drawer,
viewport meta, iOS keyboard scroll margin) is live; brand-scoped pages,
admin surfaces, portal/share, auth surfaces have all received their
mobile treatment, either via additive `max-md:` / `max-lg:` overrides
or via parallel `lg:hidden` / `hidden lg:flex` blocks. Desktop UI at
`lg+` is byte-identical to the pre-change baseline on every commit.
