# Scheduler — Mobile PRD

**Route:** `/admin/scheduler`
**Actor:** admin
**Sidebar:** Not in sidebar.

## Purpose
Cross-brand schedule overview. Lists all scheduled posts in the near future across every client.

## Desktop UI (UNCHANGED)
- Table or timeline of scheduled posts; columns for date, brand, platform, title, status.
- Date range picker; brand filter.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T4, T5, T6**

### Layout
- Table → grouped card list. Group cards by date (sticky date dividers).
- Card: brand chip, platform icons, title, scheduled time, status pill, kebab.
- Filter chips (platform, status, brand) below the page header (T6).
- Date range button in header → sheet (T5).

### Per-card actions
- Kebab: Open in calendar, Reschedule, Unschedule, Mark failed, Force re-publish.

## Out of scope
- Timeline gantt view (desktop power feature).
- Drag a card to reschedule on mobile — replace with kebab → "Reschedule" sheet.

## Acceptance criteria
- Cross-brand scope visible at a glance.
- Date dividers sticky.
- Desktop diff = 0 at `lg+`.
