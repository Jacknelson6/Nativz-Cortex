# Analytics — Mobile PRD

**Routes:** `/admin/analytics`, `/admin/analytics/overview`, `/admin/analytics/social`, `/admin/analytics/benchmarking`, `/admin/analytics/affiliates`, `/admin/analytics/zernio`
**Actor:** admin
**Sidebar:** Dashboard → Analytics

## Purpose
Cross-brand reporting. Five sub-tabs covering different lenses: overview (rolled-up KPIs), social (per-platform), benchmarking (vs. competitors), affiliates (UpPromote), zernio (publish health from the integration's POV).

## Desktop UI (UNCHANGED)
- Tab strip at top across all five sub-pages.
- Brand pill drives scope (memory: `feedback_analytics_brand_pill_only` — no in-page client picker).
- Date range selector top-right.
- Charts (Recharts) in a 2- or 3-column grid below.
- Each chart is a card with title, time range badge, chart body, legend.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T5, T6**

### Tab strip
- 5 tabs → horizontal-scroll pill row (T6). Active pill scrolls into view. Persistent on scroll (sticky header).
- Tap a pill → switches sub-page via the existing router.

### Date range selector
- Becomes a "Date" button in the sticky header. Tap → date-range sheet (T5) with preset chips (7d / 28d / 90d / This month / Custom).

### Charts
- Grid → single column. Charts keep full width.
- Recharts already responsive — set `<ResponsiveContainer width="100%">` paths to render at ~280px height on mobile (down from 320-400 on desktop).
- Legend below the chart (already on mobile in most charts; verify per chart).
- Tap a chart point/bar → tooltip stays visible until tap-outside (no hover dismiss).

### Sub-page specifics
- **Overview:** big KPI tiles 2-up, charts stacked.
- **Social:** platform tabs become a second pill row (Instagram / TikTok / YouTube / LinkedIn / Facebook) below the analytics tab strip. Or collapse into a Select dropdown if vertical space is tight.
- **Benchmarking:** vs-competitor selection chip stays at top, then chart stack.
- **Affiliates:** UpPromote sections stack; revenue tile, top affiliates list (cards), affiliate digest schedule.
- **Zernio:** publish health card on top (mirrors `/admin/ops/publish-health` widget), historical chart below.

## Touch & sizing
- Chart cards: 16px bottom margin.
- Chart bar/point tap target: standard recharts; ensure tooltip touch dismissibility.

## Out of scope
- Chart-zoom / panning gestures (out of scope; keep static).
- Side-by-side chart comparison.

## Acceptance criteria
- Switching between sub-tabs preserves date range.
- Brand pill change refreshes all charts on the current sub-tab.
- Desktop diff = 0 at `lg+`.
