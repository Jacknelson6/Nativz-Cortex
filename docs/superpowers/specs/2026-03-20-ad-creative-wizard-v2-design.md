# Ad Creative Wizard v2 — Design Spec

> Phase 1 of 3. Phases 2 (Template Library overhaul) and 3 (Generation refinement) follow.

## Problem

The current ad creative wizard has UX friction that blocks fast, high-quality ad generation:

- Brand scan only crawls the homepage — misses products, pulls favicon instead of logo
- Brand context is not editable — wrong colors/logo can't be fixed
- Template picker is hidden behind a click — requires expanding to see options
- All config options (copy mode, aspect ratio) are collapsed into clickable pills
- Generation shows a progress bar screen with no way to leave or return
- Gallery is inaccessible without re-walking the entire wizard
- No generation history or batch resumability
- Uploaded templates don't appear in the picker after upload
- Single global "ads per template" count — no per-template control

## Solution

Redesign the wizard as a vertical, always-visible stepper with editable brand context, full-site crawling (persisted to knowledge), ChatGPT-style gallery generation, and batch history.

---

## 1. Landing Page

**Headline:** "Generate limitless ad creatives"

**Animated counter:** Ticks from 1 → 10,000 on a logarithmic scale (1, 10, 50, 100, 500, 1K, 5K, 10K) over ~3 seconds. Settles at 10,000 with a subtle glow. Communicates scale before the user starts.

**URL / client picker:** Unchanged — toggle between "Website URL" and "Existing client". Works well.

**Recent clients section:** Below the picker, show up to 6 recently-used clients with creative count badges. Clicking a recent client goes directly to their gallery (not the wizard).

---

## 2. Brand Context — Full-Site Crawl + Editable

### Full-site crawl

When a brand is scanned (either via URL input or client selection with a website_url):

1. **Check knowledge first.** Query `client_knowledge_entries` for an existing `brand_profile` entry for this client where `metadata.ad_creative_context` is not null. If found, skip the crawl — use cached data.
2. **Crawl all pages (async).** If no cached context exists:
   - The `POST /api/ad-creatives/crawl-brand` route kicks off the crawl via `after()` and returns immediately with `{ crawlId, status: 'crawling' }`. The UI polls for completion (same pattern as generation batches).
   - `maxDuration = 300` on the route. The crawl logic uses a shared `AbortController` with a 240s wall-clock timeout.
   - Fetch the homepage, parse with **cheerio** (already a dependency) to extract all internal links from nav, footer, and `<a>` tags.
   - Discover sitemap.xml and parse for additional URLs.
   - Crawl all discovered pages (respect robots.txt, 5 concurrent fetches, shared timeout).
   - Extract from each page: products (JSON-LD, OG tags, heuristics), images, brand signals.
   - Deduplicate products by normalized name similarity (lowercase, trim, ratio > 0.85 using a simple inline Levenshtein ratio function — no external library needed).
3. **Persist to knowledge.** Save the crawl results as a `client_knowledge_entries` record with `type: 'brand_profile'` and `metadata.ad_creative_context` containing: brand info, colors, logo, products, media URLs. Uses the existing `brand_profile` type which is already in the DB constraint. This is a one-time operation per brand.
4. **Subsequent visits** load from knowledge instantly — no re-crawl.

### Logo extraction priority

Uses **cheerio** (already installed) to parse the HTML DOM:

1. `<img>` inside `<nav>` or `<header>` with "logo" in class, alt, or src
2. `<svg>` with "logo" in class or id
3. apple-touch-icon link tag
4. og:image meta tag
5. Favicon (last resort)

### Editable brand card

After scan completes (or loads from cache), the brand section renders as an inline-editable card:

- **Brand name** — click to edit text field
- **Logo** — click to replace via file upload or URL paste
- **Colors** — clickable swatches: click to open color picker, "+" to add, "×" to remove
- **Description** — click to edit textarea

Edits update the session state. If the client has a knowledge entry, edits can optionally be saved back ("Save to brand" button).

---

## 3. Product Discovery — Full Crawl + Manual Add

Products are extracted during the full-site crawl and displayed as a toggleable grid.

### Product card

Each product shows: thumbnail image, name, description (truncated), price if found. Click to toggle selection (blue border + checkmark when selected).

### Manual product entry

- **"+ Add product" button** — opens inline form: name (required), image (file upload or URL), description (optional)
- **"Paste product URL" button** — paste any URL, calls `POST /api/ad-creatives/scrape-product` (new route) which scrapes that single page for product data only (no brand extraction) and returns `{ product: ScrapedProduct }`. Added to the grid client-side.

### Persistence

Products discovered during crawl are persisted to knowledge (part of the `brand_profile` entry). Manually added products for this session are ephemeral unless "Save to brand" is clicked.

---

## 4. Wizard Layout — Vertical Stepper, Always Visible

Replace the current conversational pills with a vertical stepper. All sections visible at once, flowing top to bottom:

| Step | Section | Content |
|------|---------|---------|
| 1 | **Brand** | Editable brand card (§2) |
| 2 | **Products** | Product grid with selection + add (§3) |
| 3 | **Templates** | Full template grid, always visible (§5) |
| 4 | **Copy & Format** | Aspect ratio + copy mode, visible once ≥1 template selected |
| 5 | **Generate** | Per-template variation counts + generate button (§6) |

Each section has a status indicator:
- Empty circle — not started
- Blue pulse — current / needs input
- Green check — configured

Sections auto-scroll into view as the user progresses. All sections remain visible and editable (no accordion collapse).

---

## 5. Template Section — Sorted by Aspect Ratio

### Layout

Templates are displayed in a full-width grid, always visible (no click-to-expand). Grouped by aspect ratio:

- **Square (1:1)** — section header + grid
- **Story (9:16)** — section header + grid
- **Portrait (4:5)** — section header + grid

Within each section, templates are sorted by collection/brand source.

### Filtering

An aspect ratio filter bar highlights the active section. Selecting "Story" scrolls to and highlights the Story section — other sections dim but remain visible so the user sees what's available.

Vertical filter (e-commerce, health, etc.) is a secondary dropdown within each section.

### Selection

Click a template to select it (blue border + checkmark). Selected count badge shows in the section header. Multi-select is the default.

### Upload

Upload button in the section header. Supports:
- File drag-drop (PNG, JPG, WebP — up to 50 at once)
- Multiple file picker

Uploaded templates appear immediately in the grid after upload (fix current bug). They go into a "Your uploads" section at the top.

### Bug fix

Current issue: `handleFileUpload` calls `fetchTemplates()` after upload, but the API may return stale data due to caching. Fix: append the newly uploaded templates to local state immediately, then background-refresh from API.

---

## 6. Per-Template Variation Count

### Summary strip

Once templates are selected, a summary strip appears below the template grid showing each selected template:

- Thumbnail (small, 48px)
- Template name / collection
- Stepper control: 1–10 variations (default: 2)
- Remove button (×)

### Total count

Below the strip: "**14 ads total** (3 templates: 5 + 5 + 4)"

Real-time update as user adjusts counts.

---

## 7. Copy & Format Section

### Aspect ratio

Three radio-style buttons (Square, Story, Portrait) with icons. Always visible, no dropdown.

**Aspect ratio auto-match:** If all selected templates share the same aspect ratio, auto-set the format to match. If mixed, default to Square with a note: "Mixed template ratios — output will be generated in your selected format."

### Copy mode

Two options:
- **AI-generated** (default) — "Headlines, subheadlines, and CTAs will be generated from your brand voice"
- **Manual** — Inline text fields for headline, subheadline, CTA

No click-to-expand. Both options visible as radio buttons with the relevant controls shown inline.

---

## 8. Generation → Gallery Transition

### No more progress screen

Hitting "Generate" immediately switches to the Gallery tab. The gallery shows placeholder cards for each expected creative.

### Placeholder cards

Each placeholder:
- Background: gradient using the brand's primary + secondary colors
- Subtle shimmer/pulse animation
- Shows the template thumbnail at 20% opacity as a hint of what's coming
- Text overlay: "Generating..." with a small spinner

### Image arrival

When a creative completes on the server:
- Gallery polls every 3 seconds (existing pattern)
- Completed creative crossfades in: placeholder blurs out → real image fades in (0.5s CSS transition)
- Failed generations show a red-tinted placeholder with "Failed — Retry" button

### Active generation banner

If the user navigates away from the gallery while generation is running, a small sticky banner appears at the top of the Ad Creatives page:

> "Generating 4 ads for Goldback... (2/4 done)" → [View →]

Banner auto-dismisses when the batch completes.

---

## 9. Generation History + Resumable Batches

### Gallery grouping

Creatives in the gallery are grouped by batch with a collapsible header:
- Date + time
- Template count
- Status badge: Completed (green), Partial (yellow), Failed (red), Generating (blue pulse)
- Total images in batch

Most recent batch at top.

### Returning to a client

When a user selects a client that has existing creatives:
- Default to the **Gallery tab** (not Generate)
- Gallery loads their existing creatives immediately
- Generate tab is available via the tab bar for new batches

### Recent clients on landing

Landing page shows up to 6 recent clients below the picker:
- Client logo + name
- Creative count badge (e.g., "24 ads")
- Click → goes to their gallery directly

---

## 10. Technical Changes

### New API routes

| Route | Method | Purpose |
|-------|--------|---------|
| `POST /api/ad-creatives/crawl-brand` | POST | Full-site crawl (async via `after()`), persists to knowledge. Returns `{ crawlId, status }`. `maxDuration = 300`. |
| `GET /api/ad-creatives/crawl-brand/[crawlId]` | GET | Poll crawl status. Returns `{ status, brand?, products? }`. |
| `POST /api/ad-creatives/scrape-product` | POST | Single-page product scrape. Accepts `{ url }`, returns `{ product: ScrapedProduct }`. |
| `PATCH /api/ad-creatives/brand-context` | PATCH | Save edited brand context back to knowledge entry. |

### API schema change: per-template variation counts

The `POST /api/clients/[id]/ad-creatives/generate` route Zod schema changes from:

```
numVariations: z.number().int().min(1).max(20)
```

to:

```
templateVariations: z.array(z.object({
  templateId: z.string().uuid(),
  count: z.number().int().min(1).max(10),
})).min(1)
```

The `templateIds` field is removed (derived from `templateVariations`). The orchestrator (`lib/ad-creatives/orchestrate-batch.ts`) changes `buildWorkItems` to read per-template counts from `config.templateVariations` instead of a single `config.numVariations`.

### Recent clients query

The landing page's "recent clients" section is powered by a server component query:

```sql
SELECT DISTINCT ON (b.client_id) b.client_id, c.slug, c.logo_url,
  COUNT(*) OVER (PARTITION BY b.client_id) as creative_count,
  MAX(b.created_at) OVER (PARTITION BY b.client_id) as last_used
FROM ad_generation_batches b
JOIN clients c ON c.id = b.client_id
WHERE b.status IN ('completed', 'partial')
ORDER BY b.client_id, b.created_at DESC
LIMIT 6
```

This runs in the `AdCreativesPage` server component and is passed as a prop to the hub.

### Active generation banner

The banner is scoped to the `AdCreativesHub` component (not a global layout concern). The hub already polls for batch status when a batch is active. The banner is a conditional render at the top of the hub when any batch for the current client has `status = 'generating'`. This is queried via the existing `GET /api/clients/[id]/ad-creatives/batches` endpoint. No new global state infrastructure needed.

### Modified files

| File | Change |
|------|--------|
| `lib/ad-creatives/scrape-brand.ts` | Add full-site crawler with cheerio DOM parsing, sitemap discovery, nav logo extraction |
| `lib/ad-creatives/orchestrate-batch.ts` | Read per-template counts from `config.templateVariations` |
| `components/ad-creatives/ad-creatives-hub.tsx` | Recent clients section, default to gallery for returning clients, active generation banner |
| `components/ad-creatives/ad-wizard.tsx` | Complete rewrite: vertical stepper, editable brand, always-visible templates, per-template counts |
| `components/ad-creatives/generation-progress.tsx` | Remove (replaced by gallery placeholder cards) |
| `components/ad-creatives/creative-gallery.tsx` | Add placeholder cards, batch grouping, crossfade transitions |
| `app/api/clients/[id]/ad-creatives/generate/route.ts` | Accept `templateVariations`, return `placeholder_config` in response |
| `app/admin/ad-creatives/page.tsx` | Add recent clients query to server component |

### Database

No new tables. Crawl results stored in existing `client_knowledge_entries` table with `type: 'brand_profile'` and `metadata.ad_creative_context`.

#### Migration: `051_ad_batch_placeholder_config.sql`

```sql
ALTER TABLE ad_generation_batches
  ADD COLUMN IF NOT EXISTS placeholder_config jsonb DEFAULT NULL;

COMMENT ON COLUMN ad_generation_batches.placeholder_config IS
  'Brand colors and template thumbnails for rendering gallery placeholders during generation';
```

The `placeholder_config` shape:

```typescript
{
  brandColors: string[];       // hex colors from brand context
  templateThumbnails: {        // one per expected creative
    templateId: string;
    imageUrl: string;          // template reference image
    variationIndex: number;
  }[];
}
```

---

## Non-goals (Phase 1)

- Ad Library scraper (Phase 2)
- Brand-organized template library (Phase 2)
- Prompt editor / review before generation (Phase 3)
- Brand media library with uploads (Phase 3)
- Interactive vs auto mode toggle (Phase 3)
- IG/FB post image puller (Phase 2)

---

## Success criteria

- Full wizard flow completable without any click-to-expand interactions
- Brand scan finds products on multi-page sites (e.g., Crystal Creek Cattle)
- Logo pulled from navbar, not favicon
- Brand colors/logo/description editable inline
- Generate → gallery transition with brand-colored placeholders
- Returning to a client with existing creatives shows gallery immediately
- Active generation banner visible when navigating away
- Uploaded templates appear in the grid immediately after upload
- Per-template variation count working
