# Spec — Infrastructure / Pipelines redesign (2026-04-24)

Combines three asks Jack raised in a single autonomous pass:

1. **Scraper-volume card redesign** — proper brand icons, quieter chrome, auto-save, cost visualization, live per-unit pricing
2. **Pipelines tab deletion** — its content (volumes, recent runs) moves to the Trend finder tab where it belongs
3. **Global admin chrome cleanup** — drop the "CORTEX · ADMIN" eyebrow everywhere; drop the Infrastructure page's description paragraph

## Current state (as of [`907ae5e`](https://github.com/Jacknelson6/Nativz-Cortex/commit/907ae5e))

- `/admin/infrastructure?tab=pipelines` renders `TopicSearchTab` which contains:
  - `ScraperVolumesSection` (4 platform cards with Lucide/colored icons, subtext under each input, manual "Save volumes" button, static `≈ $0.0005/unit` badges)
  - A "How these knobs work" explainer card (in `trend-finder-settings-tab.tsx` lines 101–128)
  - A "Recent runs" table (from `topic_searches` — currently in `topic-search-tab.tsx` lines 141–412)
- Every admin page (via `components/admin/section-tabs.tsx` `SectionHeader`) renders `CORTEX · ADMIN` eyebrow above the H1
- Infrastructure page has a paragraph: *"Every backend Cortex runs on, in one place — so you never have to open Vercel, Supabase, or Apify to see how we're doing. Summaries up top, details on tap."*
- `lib/search/scraper-cost-constants.ts` holds hardcoded per-unit prices (measured 2026-04-23)
- `apify_runs` table already logs `cost_usd` + `dataset_items` per run (see [`147_apify_runs.sql`](supabase/migrations/147_apify_runs.sql))

## Target state

### Navigation
- **Delete the Pipelines tab** from `INFRASTRUCTURE_TABS`
- Everything that was there folds into the existing **Trend finder** tab
- Result: `Overview · Compute · AI · Scrapers · Trend finder · Integrations` (6 tabs, down from 7)

### Trend finder tab (new layout, top to bottom)

```
┌──────────────────────────────────────────────────────┐
│ Platform volumes                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │
│  │ Reddit  │ │ YouTube │ │ TikTok  │ │  Web    │     │
│  │ [icon]  │ │ [icon]  │ │ [icon]  │ │ [icon]  │     │
│  │ (ⓘ tip) │ │ (ⓘ tip) │ │ (ⓘ tip) │ │ (ⓘ tip) │     │
│  │ inputs  │ │ inputs  │ │ inputs  │ │ inputs  │     │
│  │ $/unit  │ │ $/unit  │ │ $/unit  │ │ $/unit  │     │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘     │
│  Cost per search: $X.XX  [pie chart breakdown]       │
│  Per-unit pricing  [↻ refresh from Apify]            │
│                                                      │
│ Recent runs                                          │
│  ... (table moved from Pipelines tab)                │
└──────────────────────────────────────────────────────┘
```

### Platform volume card (new design)

Each card:
- **Brand SVG** (from `components/search/platform-icon.tsx` — already has Reddit/YT/TikTok, Web uses Lucide Globe). These are monochrome SVGs that adopt the brand accent. No colored backgrounds.
- **Title** (Reddit / YouTube / TikTok / Web) at 16–18px, semibold
- **No subtext** — a tooltip (ⓘ icon next to title) opens a short explainer on hover. Tooltip content mirrors what was in the removed subtext.
- **Inputs** get larger labels (13px) + larger numeric input (16px, tabular numbers). No wrapping at mid widths — card is minimum 220–240px and grid is `grid-cols-2 xl:grid-cols-4` so 4-across on desktop, 2-across on tablet, 1-col mobile.
- **Per-unit cost** as a small badge bottom-right of card (subtle, `text-text-muted`)
- **Auto-save**: `onChange` handler debounces 600ms then PUTs `/api/admin/scraper-settings`. A tiny saving-state indicator (spinner → check) appears top-right of the card while saving. On error, toast + revert value. No more "Save volumes" button.

### Cost visualization

Below the card grid, a single row with:
- Big number: `≈ $X.XX per search` (from `estimateSearchCost()` in scraper-settings lib)
- Sparkline or small pie chart: platform breakdown (Reddit 45% / YT 30% / TikTok 20% / Web 5%). Use Recharts (already a dep). Legend doubles as per-platform cost.

### Per-unit pricing refresh

A small "Pricing" strip under the cost row:
```
Per-unit pricing (last updated 2 min ago)    [↻ Refresh]
  Reddit  $0.0005    YouTube  $0.0005    TikTok  $0.0003    Web  free
```

Refresh action:
1. Calls new endpoint `POST /api/admin/scraper-settings/refresh-pricing`
2. Server-side: reads `apify_runs` rows from the last 30 days, groups by `actor_id`, computes `mean(cost_usd / NULLIF(dataset_items, 0))` → that's the live per-unit cost for each actor. Also fetches `GET https://api.apify.com/v2/acts/{actorId}` with Jack's token as a sanity check for posted price.
3. Writes the live prices to a new `scraper_unit_prices` row (or extends `scraper_settings`).
4. UI re-pulls + re-renders.

If no runs exist for an actor in the last 30 days, keep the hardcoded constant. Refresh is a no-op in that case (toast: "No recent runs to compute pricing from").

### Recent runs

Same component as today — just relocated into the Trend finder tab after the cost row. No functional change.

### Global chrome cleanup

- `SectionHeader` in [components/admin/section-tabs.tsx](components/admin/section-tabs.tsx) drops the `<p>Cortex · admin</p>` eyebrow. Title is the first line now. Applies to every page that uses `SectionHeader` (Infrastructure, Onboarding, AI settings, Notifications, Accounting, Users, Clients).
- Infrastructure page ([app/admin/infrastructure/page.tsx](app/admin/infrastructure/page.tsx)) drops its description string. Just title + tabs.
- Optional: add a 1-line human-friendly subtitle only when it's actually useful per page. Default to bare title.

### "How these knobs work" card

Deleted. The tooltip + the cost visualization make the explainer redundant.

## Data / schema

- Store refreshed prices: extend `scraper_settings` with `last_refreshed_at TIMESTAMPTZ` and optionally per-platform `*_price_per_unit NUMERIC(10,6)`. Migration 154.
- OR simpler: keep `scraper-cost-constants.ts` as the defaults, write refreshed values to a new `scraper_unit_prices` singleton table that the settings lib prefers when present. Simpler to revert. **Going with this.**

## Implementation order

1. `SectionHeader` eyebrow removal + Infrastructure page subtext removal — touches every admin page, do first so everything else layers on
2. Migration 154 + `scraper_unit_prices` table
3. New `PUT /api/admin/scraper-settings/refresh-pricing` endpoint
4. Rewrite `ScraperVolumesSection` — brand icons, tooltips, auto-save, remove subtext + save button
5. Add cost visualization (pie + total) under the cards
6. Add per-unit pricing refresh strip
7. Move "Recent runs" into Trend finder tab
8. Delete Pipelines tab from `INFRASTRUCTURE_TABS` + `app/admin/infrastructure/page.tsx` routing
9. Delete the "How these knobs work" card
10. Typecheck + smoke test

## Out of scope for this pass

- OpenRouter pricing refresh (kept simple: Apify-only for this round; OpenRouter lives in AI settings anyway)
- Visual polish of recent runs table beyond relocation
- Per-search cost tracking (already logged via `apify_runs`; could surface on the runs row later)
