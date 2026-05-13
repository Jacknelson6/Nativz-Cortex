# Admin Dashboard — Mobile PRD

**Route:** `/admin/dashboard`
**Actor:** admin
**Sidebar:** Dashboard → Dashboard

## Purpose
Agency-wide cockpit. KPI tiles, pipeline state, recent activity, ops alerts, drop calendar at a glance.

## Desktop UI (UNCHANGED)
- 3-column grid of KPI cards across the top (clients, drops in flight, monthly capacity, etc.).
- Pipeline strip (project counts by stage).
- Activity feed (recent client touches, scheduler events).
- Ops alert cards (publish failures, missing platforms).

## Mobile transformations
**Apply from playbook: T1, T2, T3**

### Layout
- KPI grid → 2-up at `sm+`, 1-up below. Keep the 4 most impactful tiles; collapse tertiary into a "More KPIs" expand.
- Pipeline strip becomes a horizontal-scroll snap row.
- Activity feed and ops alerts stack as full-width sections.

### Tile content
- Tiles keep their primary number large + label. Sub-stat ("vs last week +12%") stays.
- Trend sparkline on each tile: keep height 32px; clip width to fit.

### Activity feed
- Each item: avatar (32 × 32), 2-line summary, timestamp. Tap → deep-link to the underlying entity.

### Ops alerts
- Card list with status pill. Tap → opens detail (publish-health sheet or whichever route applies).

## Touch & sizing
- KPI tile tap target: full tile (each links to deeper analytics).
- Activity row: 64px tall.

## Out of scope
- Live-updating WebSocket charts (still poll; mobile follows existing polling cadence).
- Drag-to-reorder dashboard tiles.

## Acceptance criteria
- All P0 KPIs visible in the first scroll on iPhone SE.
- Tap-to-deep-link works for every tile + activity item.
- Desktop diff = 0 at `lg+`.
