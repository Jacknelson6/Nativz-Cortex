# Usage — Mobile PRD

**Route:** `/admin/usage`
**Actor:** admin
**Sidebar:** Admin → Usage

## Purpose
Cortex usage and cost metering. Tracks per-feature API costs (OpenRouter, Gemini, Resend, Mux), per-client breakdown, monthly totals.

## Desktop UI (UNCHANGED)
- KPI strip (monthly burn, by-feature breakdown).
- Time-series chart of cost.
- Per-client and per-feature tables below.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T4, T5**

### KPI strip
- 2-up grid.

### Chart
- Full-width recharts; height ~280px.
- Period selector (7d / 30d / 90d) as segmented control above chart.

### Tables
- Per-client and per-feature tables → card lists (T4). Each card: name, current-period total, last-period total, delta arrow.

## Out of scope
- Drill-down into raw API call logs on mobile.

## Acceptance criteria
- Monthly burn visible in first viewport.
- Chart period switching is instant.
- Desktop diff = 0 at `lg+`.
