# Pipeline — Mobile PRD

**Route:** `/admin/pipeline`
**Actor:** admin
**Sidebar:** Not in sidebar.

## Purpose
Operations pipeline view across all clients. Aggregates state of deliverables, scheduled posts, in-flight projects.

## Desktop UI (UNCHANGED)
- Kanban board with columns per stage; cards per item.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T6, T7**

### Layout
- Kanban → tabbed list. Tab strip = stage names (horizontal scroll). Active tab's cards stack.
- Card: client chip, item title, ETA, last touch, owner avatars, kebab.

### Move actions
- Long-press a card (T7) → "Move to stage" sheet with stage list.

## Out of scope
- Multi-card drag-drop (mobile uses long-press → sheet instead).

## Acceptance criteria
- Stage tabs persist on scroll.
- Move action confirmable in 2 taps.
- Desktop diff = 0 at `lg+`.
