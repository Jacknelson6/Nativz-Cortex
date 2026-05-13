# Deliverables — Mobile PRD

**Route:** `/deliverables`
**Actor:** admin + viewer (brand-scoped)
**Sidebar:** Not in rail; reached via brand pill workflows and deep links.

## Purpose
Monthly production scope / package usage for the active brand. Shows what's promised (tier package), what's in flight, what's shipped, capacity remaining. The client-facing language is "deliverables / production capacity / monthly output" — internal language is "credits" (memory: directional pivot 2026-05-02).

## Desktop UI (UNCHANGED)
- Top KPI strip: package tier, this-month progress bar, in-flight count, shipped count.
- Pipeline column view: 4 columns (Queued / In production / In review / Shipped). Cards per deliverable.
- Editor attribution + strategist visible on each card.
- "Request another" CTA respecting the no-SaaS-billing aesthetic.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T5, T6**

### KPI strip
- Becomes a stack of 2 prominent tiles + a thin progress bar tile. `max-lg:grid-cols-2`.

### Pipeline (4 columns)
- Convert to a horizontal-scroll snap-column view at `sm+`: each column 80vw wide, full height.
- At `max-sm`, collapse to a tabbed view (T6, segmented control): Queued / In production / In review / Shipped. Active tab's cards fill the viewport.
- Each card: thumbnail (if video preview available), title, strategist+editor avatars, status pill, "view" tap → opens editing-project review sheet (mirrors `/review` modal — T5).

### "Request another"
- Becomes a sticky bottom CTA. Tap → opens a sheet for the request brief.

## Touch & sizing
- Editor + strategist avatars: 32 × 32 stacked.
- Status pills: keep semantic colors.

## Out of scope
- Drag-to-reorder pipeline cards (long-press → assign-to menu on mobile).
- Bulk advance multiple cards at once.

## Acceptance criteria
- Visible in-flight count is glanceable in the first viewport on iPhone SE.
- Tapping a card opens the unified review sheet with all 10 required surfaces.
- Desktop diff = 0 at `lg+`.
