# Content Tools — Mobile PRD

**Route:** `/admin/content-tools`
**Actor:** admin
**Sidebar:** Admin → Content Tools

## Purpose
Cross-brand content command surface. Six-tab shell aggregating: All projects (share-link oversight), Calendar, Editing, Quick schedule (Monday-approved queue), History, Connections (integration health). Notification config absorbed here on 2026-05-03.

## Desktop UI (UNCHANGED)
- 6-tab horizontal pill nav at top.
- Each tab has its own dense table or board view.
- Cross-brand scope (no brand pill influence).

## Mobile transformations
**Apply from playbook: T1, T2, T3, T4, T5, T6**

### Tab nav
- 6 tabs → horizontal-scroll pill row (T6) with active-into-view scroll.

### Per-tab
- **All projects:** table → card list. Card: client logo, project name, type (calendar / editing), strategist, last touch, status pill, kebab.
- **Calendar:** cross-brand drop list. Card: brand chip, drop title, scheduled-at, platforms, status. Group by date (sticky date headers on scroll).
- **Editing:** cross-brand editing projects. Card mirrors `/deliverables` cards.
- **Quick schedule:** EM-approved queue from Monday. List of ready-to-schedule items; each card has a "Schedule now" sticky-right CTA.
- **History:** chronological feed; card list with date dividers.
- **Connections:** integration health grid → card list. Card: integration logo, last sync, status pill, "View / Reconnect" action.

### Filters & search
- Per-tab filter chip row below the tab strip (T6).
- Cross-brand search in the sticky header.

## Touch & sizing
- Sticky date headers: 32px tall, secondary text style.
- "Schedule now" CTA: 44 × 44 minimum, brand accent.

## Out of scope
- Multi-select bulk actions.
- Side-by-side tab views (impossible on mobile).

## Acceptance criteria
- Each tab is reachable in one tap from any other tab.
- Card list virtualizes if >50 entries (desktop already virtualizes).
- Desktop diff = 0 at `lg+`.
