# Brand Review — Mobile PRD

**Route:** `/review`
**Actor:** admin + viewer (brand-scoped)
**Sidebar:** Brand tools → Content → Review

## Purpose
Single brand-scoped review queue. Shows all content awaiting strategist/editor/client action: drops in calendar approval, editing-project deliverables, paid-media review, follow-ups overdue.

## Desktop UI (UNCHANGED)
- Multi-section page: a "needs attention" hero strip at top (3-4 KPI tiles), then sectioned card lists per type (Calendar approvals, Editing deliverables, Followups, Recently approved).
- Each card uses the unified-review-modal contract (10 required surfaces: counters, last email body, full media CRUD, send/resend, delete, strategist+editor, client/title, calendar-vs-not flag, unified status).
- Side filters (platform, status, age) on a sticky right rail.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T5, T6**

### Layout
- KPI hero tiles stack 2-up at `sm+`, 1-up below `sm`. Drop the tertiary tiles below 1-up; keep top 2 always visible.
- Sections stack vertically. Section headers sticky on scroll (`max-lg:sticky max-lg:top-[var(--mobile-header-h)]`).
- Card list (T4-style) per section. Cards expose: status pill, brand-side title, client name, last activity ("commented 2h ago / sent reminder yesterday"), thumbnail (if available), kebab.

### Unified review modal
- Modal → bottom sheet (T5). 90vh max.
- Sections inside the sheet are accordion-collapsed by default except "Status & next action."
- Action buttons (Approve / Comment / Send followup / Resend / Delete) stack in a sticky footer.

### Filters
- Right rail filters → sheet opened from a "Filter (N)" button in the sticky header. Same playbook T5.

## Touch & sizing
- Card thumbnails: 56 × 56 inline left of text.
- Kebab tap target: 44 × 44.
- Status pills: keep colors as-is (memorized exception for sentiment / status colors is calendar-specific; review pills follow design tokens).

## Out of scope
- Sortable columns (no columns anymore on mobile).
- Bulk approve across cards.

## Acceptance criteria
- All 10 unified-modal required surfaces are reachable from the bottom sheet.
- "Send followup" + "Mark approved" actions confirmable in 2 taps.
- Desktop diff = 0 at `lg+`.
