# Portal — Mobile PRD

**Routes:** `/portal/analytics`, `/portal/research/formats`, `/portal/research/formats/[id]`
**Actor:** viewer
**Sidebar:** Surfaced via the unified `(app)` shell with viewer role; these `/portal/*` routes also work as direct deep links.

## Purpose
Viewer-only portal carve-outs. Most viewer functionality lives in the unified `(app)` shell, but a few surfaces still live at `/portal/*` for legacy or scope reasons: analytics deep-link and the research/formats explorer.

## Desktop UI (UNCHANGED)
- Same look as their `(app)` counterparts.
- `/portal/analytics` = analytics report scoped to the viewer's brand.
- `/portal/research/formats[/...]` = formats library (read-only) scoped to viewer access.

## Mobile transformations
**Apply per:** inherit from `admin/analytics.md` (analytics) + `brand/viral-formats.md` (formats).

### Specific to portal
- Brand pill is locked to the viewer's single brand (or first-of-multi if applicable). The pill still appears in the top bar but doesn't expand the "Create brand" footer (per the fix landed at `271b91ca`).
- "All brands / Create brand" footer hidden for viewers in the brand pill (already implemented).

## Out of scope
- Admin-only portal admin tooling.

## Acceptance criteria
- Portal user can open analytics + formats on phone without seeing any admin-only affordances.
- Desktop diff = 0 at `lg+`.
