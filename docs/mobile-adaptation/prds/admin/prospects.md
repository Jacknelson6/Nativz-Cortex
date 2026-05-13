# Prospects — Mobile PRD

**Routes:** `/admin/prospects/new`, `/admin/prospects/[id]/present`, `/admin/prospects/alerts`, `/admin/prospects/digests`, `/admin/prospects/digests/stats`
**Actor:** admin
**Sidebar:** Not in sidebar.

## Purpose
Prospect prospecting: feed of leads, scheduled outreach digests, alert thresholds, prospect-present mode for sales calls.

## Desktop UI (UNCHANGED)
- List + detail pages similar to clients but with sales-stage lifecycle.
- Digest editor and scheduler.
- Alerts config.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T5**

### `/prospects/new`
- Form sheet pattern with stepper.

### `/prospects/[id]/present`
- Same treatment as `/admin/presentations/[id]/present` — hint best-viewed on desktop. Read-only on mobile.

### `/prospects/alerts`
- Form sheet pattern with each alert rule as a card; edit via sheet.

### `/prospects/digests`
- List of digests, each editable via sheet.

### `/prospects/digests/stats`
- Stats page: KPI tiles + chart. Same treatment as `/admin/analytics/*`.

## Out of scope
- Pixel-perfect prospect presenting on phone.

## Acceptance criteria
- New prospect form completable on phone.
- Digest preview readable.
- Desktop diff = 0 at `lg+`.
