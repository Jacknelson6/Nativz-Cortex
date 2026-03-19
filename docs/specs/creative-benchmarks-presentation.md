# Creative Benchmarks 2026 -- Presentation Type PRD

**Date:** 2026-03-19
**Status:** Draft
**Author:** Jack Nelson + Claude Code

---

## 1. Feature overview

Add a new presentation type `benchmarks` to the existing Presentations feature (`/admin/presentations`). This type renders the "Creative Benchmarks 2026" report -- based on $1.3B in ad spend across 578,750 creatives and 6,015 advertisers -- as interactive charts and tables inside Nativz Cortex.

The data is static (no API calls). All benchmark data lives in a TypeScript file at `lib/benchmarks/data.ts`. The presentation type integrates with the existing create/edit/present flow alongside `slides`, `tier_list`, and `social_audit`.

### Goals

- Present benchmark data to clients during sales calls using the existing present mode
- Allow the team to toggle section visibility and reorder sections for different audiences
- Support both Nativz dark theme and AC light theme via semantic CSS variables
- All charts use Recharts (already a project dependency)

### Non-goals

- No editable data -- the benchmark numbers are static
- No API integration or database storage of benchmark data
- No PDF export (future enhancement)

---

## 2. Data model / types

### 2.1 New presentation type

The `type` field on `PresentationData` gains a fourth option: `'benchmarks'`.

**File: `app/admin/presentations/[id]/types.ts`**

```ts
// Add 'benchmarks' to the type union
export interface PresentationData {
  // ...existing fields...
  type: 'slides' | 'tier_list' | 'social_audit' | 'benchmarks';
  // New field for benchmarks configuration
  benchmark_config: BenchmarkConfig;
}

export interface BenchmarkConfig {
  visible_sections: string[];   // CH-003, CH-005, etc.
  section_order: string[];      // ordered array of section IDs
  active_vertical_filter: string | null; // null = "all verticals"
}
```

### 2.2 Zod schema update

**File: `app/api/presentations/route.ts`**

Add `'benchmarks'` to the `type` enum in `createSchema`:

```ts
type: z.enum(['slides', 'tier_list', 'social_audit', 'benchmarks']).default('slides'),
```

Add `benchmark_config` as an optional JSON field:

```ts
benchmark_config: z.object({
  visible_sections: z.array(z.string()),
  section_order: z.array(z.string()),
  active_vertical_filter: z.string().nullable(),
}).optional(),
```

### 2.3 Database

The `presentations` table already stores `type` as text and has JSONB columns for flexible data. The `benchmark_config` field can be stored in the existing `audit_data` JSONB column (repurposed as a generic config column) or added as a new column. Recommended: store it in `audit_data` to avoid a migration, since the field is only used when `type = 'social_audit'` today.

If a migration is preferred, add:

```sql
ALTER TABLE presentations
  DROP CONSTRAINT IF EXISTS presentations_type_check;

ALTER TABLE presentations
  ADD CONSTRAINT presentations_type_check
  CHECK (type IN ('slides', 'tier_list', 'social_audit', 'benchmarks'));

ALTER TABLE presentations
  ADD COLUMN IF NOT EXISTS benchmark_config jsonb DEFAULT '{}';
```

### 2.4 Static data types

**File: `lib/benchmarks/data.ts`**

```ts
// ─── Spend tiers ─────────────────────────────────────────────────────────────

export type SpendTier = 'Under $100K' | '$100K-$500K' | '$500K-$1M' | '$1M-$5M' | '$5M-$10M' | '$10M+';

export interface SpendTierRow {
  tier: SpendTier;
  advertisers: number;
  avg_creatives_tested: number;
  hit_rate_pct: number;  // percentage
}

// ─── Portfolio breakdown ─────────────────────────────────────────────────────

export interface PortfolioBreakdownRow {
  tier: SpendTier;
  losers_pct: number;      // <0.5x ROAS
  mid_range_pct: number;   // 0.5x-2x ROAS
  winners_pct: number;     // >2x ROAS
}

// ─── Spend allocation ────────────────────────────────────────────────────────

export interface SpendAllocationRow {
  tier: SpendTier;
  losers_spend_pct: number;
  mid_range_spend_pct: number;
  winners_spend_pct: number;
}

// ─── Heatmap (weekly testing volume) ─────────────────────────────────────────

export type Vertical =
  | 'eCommerce / DTC'
  | 'SaaS / Tech'
  | 'Finance / Fintech'
  | 'Health & Wellness'
  | 'Education / EdTech'
  | 'Gaming'
  | 'Media / Entertainment'
  | 'Travel / Hospitality';

export interface HeatmapCell {
  vertical: Vertical;
  tier: SpendTier;
  weekly_new_creatives: number;
}

// ─── Top 25% comparison ─────────────────────────────────────────────────────

export interface Top25ComparisonRow {
  metric: string;
  all_advertisers: string;
  top_25_pct: string;
  delta: string;
}

// ─── Visual styles ───────────────────────────────────────────────────────────

export interface VisualStyleRow {
  rank: number;
  style: string;
  usage_pct: number;
  avg_roas: number;
  trend: 'rising' | 'stable' | 'declining';
}

export interface VisualStyleByVerticalRow {
  vertical: Vertical;
  rank: number;
  style: string;
  usage_pct: number;
  avg_roas: number;
}

// ─── Hooks & headlines ───────────────────────────────────────────────────────

export interface HookRow {
  rank: number;
  hook_type: string;
  usage_pct: number;
  avg_ctr: number;
  avg_hook_rate: number;
  trend: 'rising' | 'stable' | 'declining';
}

// ─── Asset types ─────────────────────────────────────────────────────────────

export interface AssetTypeRow {
  rank: number;
  asset_type: string;
  usage_pct: number;
  avg_roas: number;
  avg_cpa_index: number; // 1.0 = average
  best_vertical: Vertical;
}

// ─── Section metadata ────────────────────────────────────────────────────────

export interface BenchmarkSection {
  id: string;           // CH-003, CH-005, etc.
  title: string;
  description: string;
  source: string;       // methodology note
  chartType: 'table' | 'stacked-bar' | 'heatmap' | 'leaderboard';
}
```

---

## 3. Component architecture

```
app/admin/presentations/[id]/
  benchmarks-editor.tsx          # Editor: reorder sections, toggle visibility
  benchmarks-viewer.tsx          # Viewer: renders all visible sections as cards

app/admin/presentations/[id]/present/
  page.tsx                       # Updated to handle type='benchmarks'

lib/benchmarks/
  data.ts                        # Static data arrays + types
  sections.ts                    # Section metadata (titles, descriptions, sources)
  charts/
    spend-tier-table.tsx         # CH-003
    portfolio-breakdown.tsx      # CH-005
    spend-allocation.tsx         # CH-006
    testing-heatmap.tsx          # CH-007
    top25-comparison.tsx         # CH-008
    visual-styles-table.tsx      # CH-009
    visual-styles-vertical.tsx   # CH-010
    hooks-headlines-table.tsx    # CH-011
    asset-types-table.tsx        # CH-012
```

### Editor props (same pattern as other editors)

```ts
export function BenchmarksEditor({
  presentation,
  saving,
  clients,
  update,
  onSave,
  onBack,
  onPresent,
}: {
  presentation: PresentationData;
  saving: boolean;
  clients: ClientOption[];
  update: (partial: Partial<PresentationData>) => void;
  onSave: () => void;
  onBack: () => void;
  onPresent: () => void;
}) { ... }
```

---

## 4. Chart specifications

### CH-003: Spend tier testing volume and hit rate

**Chart type:** Table
**Component:** `spend-tier-table.tsx`

| Spend tier | Advertisers | Avg creatives tested/month | Hit rate |
|---|---|---|---|
| Under $100K | 2,847 | 8 | 3.2% |
| $100K-$500K | 1,892 | 24 | 5.1% |
| $500K-$1M | 643 | 52 | 7.8% |
| $1M-$5M | 412 | 115 | 11.4% |
| $5M-$10M | 142 | 245 | 14.2% |
| $10M+ | 79 | 480+ | 16.8% |

**UI:** Styled table with alternating row backgrounds. Hit rate column uses a color scale (red at low end, green at high end). The "480+" value uses a `+` suffix. Include a caption: "Higher spend tiers test more creatives AND achieve higher hit rates -- volume and quality compound."

---

### CH-005: Portfolio breakdown by spend tier

**Chart type:** Stacked horizontal bar chart (Recharts `BarChart` with `layout="vertical"`)
**Component:** `portfolio-breakdown.tsx`

| Tier | Losers (<0.5x) | Mid-range (0.5-2x) | Winners (>2x) |
|---|---|---|---|
| Under $100K | 72% | 22% | 6% |
| $100K-$500K | 65% | 25% | 10% |
| $500K-$1M | 58% | 27% | 15% |
| $1M-$5M | 51% | 28% | 21% |
| $5M-$10M | 45% | 27% | 28% |
| $10M+ | 38% | 26% | 36% |

**Colors:**
- Losers: `var(--color-red-400)` / `#f87171`
- Mid-range: `var(--color-amber-400)` / `#fbbf24`
- Winners: `var(--color-emerald-400)` / `#34d399`

**Caption:** "Top spenders don't just spend more -- they build better portfolios. $10M+ advertisers have 6x the winner ratio of sub-$100K."

---

### CH-006: Spend allocation by tier

**Chart type:** Stacked horizontal bar chart
**Component:** `spend-allocation.tsx`

| Tier | Losers spend % | Mid-range spend % | Winners spend % |
|---|---|---|---|
| Under $100K | 45% | 38% | 17% |
| $100K-$500K | 35% | 37% | 28% |
| $500K-$1M | 28% | 34% | 38% |
| $1M-$5M | 20% | 30% | 50% |
| $5M-$10M | 15% | 25% | 60% |
| $10M+ | 10% | 20% | 70% |

**Key insight callout:** "Top spenders ruthlessly cut losers. $10M+ advertisers allocate 70% of spend to proven winners vs. only 17% for sub-$100K."

Same color scheme as CH-005.

---

### CH-007: Weekly testing volume heatmap

**Chart type:** Heatmap grid (custom component using CSS grid, not Recharts)
**Component:** `testing-heatmap.tsx`

Data matrix (weekly new creatives per advertiser):

| Vertical | Under $100K | $100K-$500K | $500K-$1M | $1M-$5M | $5M-$10M | $10M+ |
|---|---|---|---|---|---|---|
| eCommerce / DTC | 6 | 18 | 42 | 95 | 200 | 420 |
| SaaS / Tech | 4 | 12 | 28 | 65 | 140 | 310 |
| Finance / Fintech | 3 | 10 | 24 | 55 | 120 | 280 |
| Health & Wellness | 5 | 15 | 35 | 80 | 170 | 360 |
| Education / EdTech | 3 | 9 | 20 | 48 | 105 | 230 |
| Gaming | 8 | 22 | 50 | 110 | 240 | 500 |
| Media / Entertainment | 5 | 14 | 32 | 72 | 155 | 340 |
| Travel / Hospitality | 4 | 11 | 26 | 58 | 125 | 275 |

**Color scale:** Sequential blue palette from lightest (low volume) to darkest (high volume). Each cell shows the number. Use `bg-accent/10` through `bg-accent/90` or a custom scale:
- 0-10: `#1e3a5f` (dark blue, subtle)
- 11-50: `#1e5a8f`
- 51-100: `#2563eb`
- 101-200: `#3b82f6`
- 201-400: `#60a5fa`
- 400+: `#93c5fd`

**Caption:** "Gaming and eCommerce lead in testing velocity. Volume scales almost linearly with spend."

---

### CH-008: Top 25% vs all advertisers

**Chart type:** Comparison table with delta column
**Component:** `top25-comparison.tsx`

| Metric | All advertisers | Top 25% | Delta |
|---|---|---|---|
| Avg creatives tested/month | 38 | 145 | +3.8x |
| Hit rate | 6.2% | 14.8% | +2.4x |
| Time to kill losers | 14 days | 4 days | -71% |
| Budget on winners | 32% | 68% | +2.1x |
| Unique visual styles tested | 4.2 | 11.7 | +2.8x |
| Avg creative lifespan | 21 days | 12 days | -43% |
| New hooks tested/month | 6 | 22 | +3.7x |

**UI:** Delta column uses green for positive indicators and red for negative (shorter kill time = green because it is better). Use icon arrows (up/down) next to delta values.

---

### CH-009: Top visual styles (overall leaderboard)

**Chart type:** Sortable leaderboard table
**Component:** `visual-styles-table.tsx`

| Rank | Visual style | Usage % | Avg ROAS | Trend |
|---|---|---|---|---|
| 1 | UGC / creator-led | 34% | 2.8x | Rising |
| 2 | Product demo / showcase | 18% | 2.4x | Stable |
| 3 | Before / after | 12% | 3.1x | Rising |
| 4 | Testimonial / review | 10% | 2.6x | Stable |
| 5 | Lifestyle / aspirational | 8% | 1.9x | Declining |
| 6 | Text-heavy / educational | 7% | 2.2x | Rising |
| 7 | Meme / trend-jacking | 5% | 2.0x | Rising |
| 8 | Comparison / vs | 3% | 2.7x | Stable |
| 9 | Behind-the-scenes | 2% | 1.8x | Rising |
| 10 | Animation / motion graphics | 1% | 1.5x | Declining |

**Trend icons:**
- Rising: green up arrow
- Stable: gray horizontal dash
- Declining: red down arrow

**Sortable columns:** Usage %, Avg ROAS (click column header to sort).

---

### CH-010: Visual styles by vertical

**Chart type:** Filterable per-vertical tables
**Component:** `visual-styles-vertical.tsx`

Each vertical has its own top-5 ranking. Render as a tab-selectable view or dropdown filter.

**eCommerce / DTC:**

| Rank | Style | Usage % | Avg ROAS |
|---|---|---|---|
| 1 | UGC / creator-led | 38% | 3.2x |
| 2 | Product demo / showcase | 22% | 2.8x |
| 3 | Before / after | 15% | 3.5x |
| 4 | Testimonial / review | 12% | 2.9x |
| 5 | Lifestyle / aspirational | 8% | 2.1x |

**SaaS / Tech:**

| Rank | Style | Usage % | Avg ROAS |
|---|---|---|---|
| 1 | Product demo / showcase | 30% | 2.6x |
| 2 | Text-heavy / educational | 22% | 2.8x |
| 3 | UGC / creator-led | 18% | 2.2x |
| 4 | Comparison / vs | 12% | 3.0x |
| 5 | Testimonial / review | 10% | 2.4x |

**Finance / Fintech:**

| Rank | Style | Usage % | Avg ROAS |
|---|---|---|---|
| 1 | Testimonial / review | 28% | 2.9x |
| 2 | Text-heavy / educational | 24% | 2.5x |
| 3 | UGC / creator-led | 20% | 2.3x |
| 4 | Before / after | 14% | 3.2x |
| 5 | Comparison / vs | 8% | 2.7x |

**Health & Wellness:**

| Rank | Style | Usage % | Avg ROAS |
|---|---|---|---|
| 1 | Before / after | 32% | 3.8x |
| 2 | UGC / creator-led | 28% | 3.0x |
| 3 | Testimonial / review | 18% | 2.8x |
| 4 | Product demo / showcase | 12% | 2.4x |
| 5 | Lifestyle / aspirational | 6% | 1.9x |

**Education / EdTech:**

| Rank | Style | Usage % | Avg ROAS |
|---|---|---|---|
| 1 | Text-heavy / educational | 35% | 2.7x |
| 2 | UGC / creator-led | 22% | 2.4x |
| 3 | Product demo / showcase | 18% | 2.3x |
| 4 | Testimonial / review | 14% | 2.6x |
| 5 | Before / after | 8% | 2.9x |

**Gaming:**

| Rank | Style | Usage % | Avg ROAS |
|---|---|---|---|
| 1 | UGC / creator-led | 40% | 3.4x |
| 2 | Meme / trend-jacking | 20% | 2.8x |
| 3 | Product demo / showcase | 15% | 2.2x |
| 4 | Behind-the-scenes | 12% | 2.0x |
| 5 | Animation / motion graphics | 8% | 1.8x |

**Media / Entertainment:**

| Rank | Style | Usage % | Avg ROAS |
|---|---|---|---|
| 1 | UGC / creator-led | 35% | 2.9x |
| 2 | Behind-the-scenes | 20% | 2.5x |
| 3 | Meme / trend-jacking | 15% | 2.3x |
| 4 | Lifestyle / aspirational | 14% | 2.0x |
| 5 | Product demo / showcase | 10% | 2.1x |

**Travel / Hospitality:**

| Rank | Style | Usage % | Avg ROAS |
|---|---|---|---|
| 1 | Lifestyle / aspirational | 30% | 2.8x |
| 2 | UGC / creator-led | 25% | 2.6x |
| 3 | Before / after | 18% | 3.0x |
| 4 | Product demo / showcase | 15% | 2.3x |
| 5 | Behind-the-scenes | 8% | 1.9x |

---

### CH-011: Top hooks and headlines

**Chart type:** Leaderboard table
**Component:** `hooks-headlines-table.tsx`

| Rank | Hook type | Usage % | Avg CTR | Avg hook rate | Trend |
|---|---|---|---|---|---|
| 1 | Question / curiosity gap | 22% | 2.8% | 45% | Stable |
| 2 | Bold claim / statistic | 18% | 3.2% | 42% | Rising |
| 3 | Problem / pain point | 16% | 2.6% | 48% | Stable |
| 4 | Social proof / "X people..." | 12% | 2.4% | 38% | Declining |
| 5 | "You need to see this" / intrigue | 10% | 3.5% | 52% | Rising |
| 6 | Controversy / hot take | 8% | 3.8% | 55% | Rising |
| 7 | Tutorial / "How to..." | 7% | 2.1% | 35% | Stable |
| 8 | Unboxing / reveal | 4% | 2.9% | 50% | Rising |
| 9 | Story / narrative | 2% | 1.8% | 32% | Declining |
| 10 | Direct CTA / offer | 1% | 1.5% | 28% | Declining |

**Definitions:**
- **Hook rate:** % of viewers who watch past the first 3 seconds
- **CTR:** Click-through rate on the ad

---

### CH-012: Top asset types

**Chart type:** Leaderboard table
**Component:** `asset-types-table.tsx`

| Rank | Asset type | Usage % | Avg ROAS | CPA index | Best vertical |
|---|---|---|---|---|---|
| 1 | Short-form video (<30s) | 35% | 2.9x | 0.85 | Gaming |
| 2 | Mid-form video (30-60s) | 22% | 2.6x | 0.92 | eCommerce / DTC |
| 3 | Static image | 18% | 2.0x | 1.10 | Finance / Fintech |
| 4 | Carousel / multi-image | 10% | 2.3x | 0.95 | eCommerce / DTC |
| 5 | Long-form video (60s+) | 8% | 2.1x | 1.15 | Education / EdTech |
| 6 | GIF / cinemagraph | 4% | 1.8x | 1.05 | Media / Entertainment |
| 7 | Interactive / playable | 2% | 3.2x | 0.78 | Gaming |
| 8 | Collection ad | 1% | 2.4x | 0.90 | eCommerce / DTC |

**CPA index:** 1.0 = average across all asset types. Below 1.0 = cheaper acquisition. Color code: green < 1.0, gray = 1.0, red > 1.0.

---

## 5. UI wireframe descriptions

### 5.1 Create flow

In the "Create new presentation" modal (`presentations/page.tsx`), add a fourth option:

```
[BarChart2 icon] Creative benchmarks
Interactive charts and tables from $1.3B in ad spend data
```

- Icon: `BarChart2` from lucide-react
- Color: `bg-orange-500/15`, `text-orange-400`
- On click: creates a new presentation with `type: 'benchmarks'` and default `benchmark_config` (all sections visible, default order)

### 5.2 Editor view (`benchmarks-editor.tsx`)

**Header bar** (same pattern as other editors):
- Back arrow, title input, client picker, status badge, Save button, Present button

**Section list** (left sidebar or main content):
- Vertical list of all benchmark sections (CH-003 through CH-012)
- Each item shows: drag handle, section title, eye icon toggle (visible/hidden)
- Drag to reorder (use same DnD pattern as tier list if available, or simple up/down buttons)
- Click a section to preview it in the main area

**Main preview area:**
- Shows the currently selected section rendered as a card
- Card layout: title at top, description subtitle, chart/table below, source/methodology footer
- Full-width within the editor content area

### 5.3 Present mode

**Navigation:** Same left/right arrow keys and progress dots as existing slide presentations, but each "slide" is a benchmark section.

**Layout per section:**
- Full-screen dark background (`bg-[#0a0a0f]`)
- Section title large and centered at top
- Chart/table centered in the middle (max-width 1100px)
- Source note small at bottom
- Animate in with a subtle fade

**Special behavior:**
- CH-010 (visual styles by vertical): In present mode, show a vertical filter dropdown in the top-right corner so the presenter can switch verticals live
- Heatmap (CH-007): Scale to fill available width

### 5.4 Card component (shared)

Every section renders inside a `BenchmarkCard`:

```tsx
interface BenchmarkCardProps {
  section: BenchmarkSection;
  children: React.ReactNode;
  className?: string;
}
```

- Dark theme: `bg-surface` card with `border-nativz-border`, rounded-xl
- Title: `text-lg font-semibold text-text-primary`
- Description: `text-sm text-text-muted mt-1`
- Source footer: `text-xs text-text-muted/60 mt-4 pt-3 border-t border-nativz-border/50`
- Chart content area: `mt-6` with appropriate padding

---

## 6. Implementation steps (ordered)

### Step 1: Static data file

Create `lib/benchmarks/data.ts` with all TypeScript types and static data arrays for CH-003 through CH-012. Create `lib/benchmarks/sections.ts` with section metadata (id, title, description, source, chartType).

### Step 2: Update types and schemas

- Add `'benchmarks'` to the type union in `app/admin/presentations/[id]/types.ts`
- Add `BenchmarkConfig` interface to types
- Update the Zod schema in `app/api/presentations/route.ts` to accept `'benchmarks'`
- Update the Zod schema in `app/api/presentations/[id]/route.ts` similarly

### Step 3: Update presentations list page

- Add `benchmarks` to `typeConfig` in `app/admin/presentations/page.tsx`
- Add the fourth option to the create modal
- Add `'benchmarks'` to the `PresentationItem` type union and `handleCreate` function
- Set default `benchmark_config` on creation (all sections visible, default order CH-003 through CH-012)

### Step 4: Build chart components

Create `lib/benchmarks/charts/` directory with one component per chart. All components are `'use client'` and accept their data as props. Build in this order (simplest first):

1. `spend-tier-table.tsx` (CH-003) -- simple styled table
2. `top25-comparison.tsx` (CH-008) -- comparison table with deltas
3. `visual-styles-table.tsx` (CH-009) -- sortable leaderboard
4. `hooks-headlines-table.tsx` (CH-011) -- leaderboard table
5. `asset-types-table.tsx` (CH-012) -- leaderboard with CPA color coding
6. `portfolio-breakdown.tsx` (CH-005) -- Recharts stacked bar
7. `spend-allocation.tsx` (CH-006) -- Recharts stacked bar
8. `visual-styles-vertical.tsx` (CH-010) -- filterable tables with tab/dropdown
9. `testing-heatmap.tsx` (CH-007) -- CSS grid heatmap

### Step 5: Build the BenchmarkCard wrapper

Create a shared `BenchmarkCard` component in `lib/benchmarks/charts/benchmark-card.tsx` used by all charts.

### Step 6: Build the benchmarks viewer

Create `app/admin/presentations/[id]/benchmarks-viewer.tsx` that maps visible sections in order to their chart components wrapped in `BenchmarkCard`.

### Step 7: Build the benchmarks editor

Create `app/admin/presentations/[id]/benchmarks-editor.tsx` with:
- Header bar (back, title, client picker, save, present buttons)
- Section list with visibility toggles and reorder controls
- Preview area showing selected section

### Step 8: Wire editor into the router page

Update `app/admin/presentations/[id]/page.tsx` to import and render `BenchmarksEditor` when `presentation.type === 'benchmarks'`.

### Step 9: Update present mode

Update `app/admin/presentations/[id]/present/page.tsx` to handle `type === 'benchmarks'`:
- Load benchmark config from presentation data
- Render each visible section as a "slide" in order
- Support arrow key navigation between sections
- Add vertical filter overlay for CH-010

### Step 10: Theme compatibility

Verify all chart components render correctly in both Nativz dark theme and AC light theme. Use only semantic CSS variables (`text-text-primary`, `bg-surface`, `border-nativz-border`, etc.) -- never hardcode hex colors except for chart data series (losers red, winners green, etc.) which should use CSS variables where possible.

---

## 7. Testing checklist

### Functional

- [ ] Can create a new benchmarks presentation from the create modal
- [ ] Benchmarks presentation appears in the presentations list with correct icon and label
- [ ] Editor loads with all 9 sections visible by default
- [ ] Can toggle section visibility (hidden sections do not render in viewer or present mode)
- [ ] Can reorder sections (order persists after save)
- [ ] Auto-save works (changes save after 1s debounce)
- [ ] Manual save works (Save button)
- [ ] Present mode renders all visible sections as navigable slides
- [ ] Arrow keys and spacebar navigate between sections in present mode
- [ ] Escape exits present mode
- [ ] Progress dots in present mode match number of visible sections
- [ ] Duplicate, archive, unarchive, and delete work from the list page

### Charts

- [ ] CH-003: Table renders with correct data, hit rate color scale works
- [ ] CH-005: Stacked bar renders with correct percentages, legend shows
- [ ] CH-006: Stacked bar renders with correct percentages
- [ ] CH-007: Heatmap grid renders with correct color scale, all cells show numbers
- [ ] CH-008: Comparison table shows deltas with correct color coding (green = good)
- [ ] CH-009: Table is sortable by Usage % and Avg ROAS columns
- [ ] CH-010: Vertical filter works, switching verticals shows correct data
- [ ] CH-011: Table renders with trend icons
- [ ] CH-012: CPA index column has correct color coding

### Theme

- [ ] All charts are legible in Nativz dark theme
- [ ] All charts are legible in AC light theme (if brand mode is active)
- [ ] No hardcoded colors that break in either theme

### Responsive

- [ ] Editor is usable on tablet-width screens (1024px)
- [ ] Present mode fills the screen at all aspect ratios
- [ ] Tables scroll horizontally on narrow screens rather than breaking layout

### Edge cases

- [ ] Presentation with all sections hidden shows an empty state in present mode
- [ ] Benchmark config survives round-trip through API (save and reload)
- [ ] Old presentations (slides, tier_list, social_audit) are unaffected by the type union change

---

## Appendix: Methodology notes

These should be displayed in a collapsible "Methodology" section at the bottom of the editor view and optionally as a final slide in present mode.

- **Data source:** Aggregated from $1.3B in tracked ad spend across Meta, TikTok, and Google platforms
- **Time period:** January 2025 -- December 2025
- **Sample size:** 578,750 unique creatives from 6,015 advertisers
- **ROAS calculation:** Revenue attributed to ad / ad spend, using platform-reported attribution (7-day click, 1-day view)
- **Hit rate:** Percentage of creatives that achieve >2x ROAS within 14 days of launch
- **Spend tiers:** Based on total annual ad spend across all tracked platforms
- **Verticals:** Self-reported by advertisers during onboarding; each advertiser assigned to one primary vertical
- **Visual style classification:** AI-assisted tagging validated by human reviewers (>90% agreement rate)
- **Hook classification:** First 3 seconds of video content or headline text for static assets, classified by primary persuasion mechanism
- **CPA index:** Normalized cost-per-acquisition where 1.0 = weighted average across all asset types

---

## Appendix: Source mapping

| Chart ID | Section | Primary data table |
|---|---|---|
| CH-003 | Spend tier volume + hit rate | `SPEND_TIER_DATA` |
| CH-005 | Portfolio breakdown | `PORTFOLIO_BREAKDOWN_DATA` |
| CH-006 | Spend allocation | `SPEND_ALLOCATION_DATA` |
| CH-007 | Weekly testing heatmap | `HEATMAP_DATA` |
| CH-008 | Top 25% vs all | `TOP25_COMPARISON_DATA` |
| CH-009 | Visual styles overall | `VISUAL_STYLES_DATA` |
| CH-010 | Visual styles by vertical | `VISUAL_STYLES_BY_VERTICAL_DATA` |
| CH-011 | Hooks and headlines | `HOOKS_DATA` |
| CH-012 | Asset types | `ASSET_TYPES_DATA` |

Each constant name above corresponds to the exported array in `lib/benchmarks/data.ts`.
