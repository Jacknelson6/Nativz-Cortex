# Ad Creative Wizard v2 — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the ad creative wizard with always-visible vertical stepper, full-site brand crawling, editable brand context, ChatGPT-style gallery generation, and batch history.

**Architecture:** The wizard becomes a top-to-bottom stepper where every section is visible at once. Brand crawling is async (background job with polling). Generation transitions directly to the gallery with brand-colored placeholder cards that crossfade to real images. The hub remembers recent clients and defaults returning users to their gallery.

**Tech Stack:** Next.js 15 App Router, Supabase, cheerio (DOM parsing), Tailwind CSS, lucide-react

**Spec:** `docs/superpowers/specs/2026-03-20-ad-creative-wizard-v2-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/051_ad_batch_placeholder_config.sql` | Add `placeholder_config` jsonb column to `ad_generation_batches` |
| `lib/ad-creatives/crawl-site.ts` | Full-site crawler: sitemap discovery, link extraction, product/brand scraping across all pages |
| `lib/ad-creatives/extract-logo.ts` | Cheerio-based logo extraction from nav/header with priority cascade |
| `app/api/ad-creatives/crawl-brand/route.ts` | Async crawl endpoint — kicks off crawl via `after()`, returns crawlId |
| `app/api/ad-creatives/scrape-product/route.ts` | Single-page product scrape endpoint |
| `app/api/ad-creatives/brand-context/route.ts` | Save edited brand context back to knowledge |
| `components/ad-creatives/brand-editor.tsx` | Inline-editable brand card (name, logo, colors, description) |
| `components/ad-creatives/product-grid.tsx` | Product selection grid with add/paste-URL/toggle |
| `components/ad-creatives/template-grid.tsx` | Always-visible template grid sorted by aspect ratio |
| `components/ad-creatives/variation-strip.tsx` | Per-template variation count strip |
| `components/ad-creatives/gallery-placeholder.tsx` | Brand-colored shimmer placeholder card with crossfade |
| `components/ad-creatives/generation-banner.tsx` | Active generation banner for hub |

### Modified files
| File | Change |
|------|--------|
| `lib/ad-creatives/scrape-brand.ts` | Refactor: extract shared utilities, add cheerio-based logo detection |
| `lib/ad-creatives/orchestrate-batch.ts` | Read per-template counts from `config.templateVariations` |
| `components/ad-creatives/ad-creatives-hub.tsx` | Recent clients, default to gallery for returning clients, active generation banner |
| `components/ad-creatives/ad-wizard.tsx` | Complete rewrite: vertical stepper composing brand-editor, product-grid, template-grid, variation-strip |
| `components/ad-creatives/creative-gallery.tsx` | Placeholder cards, batch grouping, crossfade transitions, poll during generation |
| `app/api/clients/[id]/ad-creatives/generate/route.ts` | Accept `templateVariations`, write `placeholder_config` |
| `app/admin/ad-creatives/page.tsx` | Add recent clients query |

### Removed files
| File | Reason |
|------|--------|
| `components/ad-creatives/generation-progress.tsx` | Replaced by gallery placeholder cards |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/051_ad_batch_placeholder_config.sql`

- [ ] **Step 1: Write migration**

```sql
-- 051_ad_batch_placeholder_config.sql
-- Add placeholder_config for gallery placeholders during generation

ALTER TABLE ad_generation_batches
  ADD COLUMN IF NOT EXISTS placeholder_config jsonb DEFAULT NULL;

COMMENT ON COLUMN ad_generation_batches.placeholder_config IS
  'Brand colors and template thumbnails for rendering gallery placeholders during generation';
```

- [ ] **Step 2: Apply migration**

Run: `npx supabase db push` or apply via Supabase MCP `apply_migration`

- [ ] **Step 3: Commit**

```
feat: add placeholder_config column to ad_generation_batches
```

---

## Task 2: Logo Extraction with Cheerio

**Files:**
- Create: `lib/ad-creatives/extract-logo.ts`

- [ ] **Step 1: Implement cheerio-based logo extractor**

The function takes HTML string + base URL, returns the best logo URL using the priority cascade:
1. `<img>` inside `<nav>` or `<header>` with "logo" in class/alt/src
2. `<svg>` with "logo" in class/id (extract as data URI or find a linked asset)
3. apple-touch-icon
4. og:image
5. Favicon

Use `cheerio.load(html)` for DOM traversal. Resolve relative URLs against base URL.

- [ ] **Step 2: Test manually against a few real sites**

Run a quick script that fetches goldback.com, crystalcreekcattle.com, and toastique.com and logs the extracted logo URL. Verify each is the actual brand logo (not favicon or random image).

- [ ] **Step 3: Commit**

```
feat: cheerio-based logo extraction with nav/header priority
```

---

## Task 3: Full-Site Crawler

**Files:**
- Create: `lib/ad-creatives/crawl-site.ts`
- Modify: `lib/ad-creatives/scrape-brand.ts` — extract shared utilities (extractProducts, extractColors, etc.)

- [ ] **Step 1: Extract shared scraping utilities from scrape-brand.ts**

Move `extractProducts`, `extractJsonLdProducts`, `extractOgProduct`, `extractHeuristicProducts`, `extractColors`, `extractMeta`, and HTML-parsing helpers into a shared module or keep them exported from `scrape-brand.ts`. The crawler needs to reuse these per-page.

- [ ] **Step 2: Implement the full-site crawler**

`crawl-site.ts` exports `crawlSite(url: string, options?: { signal?: AbortSignal })`:

1. Fetch homepage, parse with cheerio
2. Extract all internal `<a>` links from nav, footer, and body
3. Try fetching `${origin}/sitemap.xml` — parse for additional URLs
4. Deduplicate all discovered URLs
5. Crawl all pages (5 concurrent, shared AbortSignal with 240s timeout)
6. For each page: extract products (reuse `extractProducts`), collect images, detect brand signals
7. Aggregate: merge all products (deduplicate by name similarity ratio > 0.85), collect all unique images, take best brand info from homepage
8. Use `extractLogo` from Task 2 for logo (run on homepage HTML)
9. Return `{ brand: ScrapedBrand, products: ScrapedProduct[], mediaUrls: string[] }`

Product deduplication: inline Levenshtein ratio function (~20 lines), threshold 0.85.

- [ ] **Step 3: Test the crawler against Crystal Creek Cattle**

Crystal Creek's products are on sub-pages, not the homepage. Verify the crawler finds them.

- [ ] **Step 4: Commit**

```
feat: full-site crawler with sitemap discovery and product extraction
```

---

## Task 4: Crawl Brand API Route (Async)

**Files:**
- Create: `app/api/ad-creatives/crawl-brand/route.ts`

- [ ] **Step 1: Implement the async crawl endpoint**

`POST /api/ad-creatives/crawl-brand`

```typescript
export const maxDuration = 300;
```

Request body: `{ url: string, clientId?: string }`

Flow:
1. Auth check
2. If `clientId` provided, check `client_knowledge_entries` for existing `brand_profile` with `metadata.ad_creative_context`. If found, return cached data immediately: `{ status: 'cached', brand, products }`.
3. If no cache, generate a `crawlId` (UUID), create an in-memory or DB record to track status.
4. Use `after()` to run `crawlSite(url)` in background.
5. On completion: persist to `client_knowledge_entries` as `type: 'brand_profile'` with `metadata.ad_creative_context`.
6. Return `{ crawlId, status: 'crawling' }`.

For simplicity, use the `ad_generation_batches` pattern but lighter: store crawl status in a simple in-memory Map (survives the request via module scope) keyed by crawlId. The crawl result is also written to knowledge, so polling can check knowledge directly.

Actually, simpler approach: the UI polls `GET /api/ad-creatives/crawl-brand?clientId=X` which just checks if a `brand_profile` with `ad_creative_context` exists for that client. When the `after()` job finishes writing, the next poll finds it.

- [ ] **Step 2: Create the poll endpoint**

`GET /api/ad-creatives/crawl-brand` with query param `clientId`.

Returns `{ status: 'ready', brand, products }` if knowledge entry exists, or `{ status: 'crawling' }` if not.

- [ ] **Step 3: Commit**

```
feat: async brand crawl API with knowledge persistence
```

---

## Task 5: Single-Page Product Scrape Route

**Files:**
- Create: `app/api/ad-creatives/scrape-product/route.ts`

- [ ] **Step 1: Implement the product scrape endpoint**

`POST /api/ad-creatives/scrape-product`

Request body: `{ url: string }`

Fetches the single URL, runs product extraction (reuse `extractProducts` from scrape-brand.ts), returns the first product found: `{ product: ScrapedProduct | null }`.

- [ ] **Step 2: Commit**

```
feat: single-page product scrape endpoint
```

---

## Task 6: Brand Context Save Route

**Files:**
- Create: `app/api/ad-creatives/brand-context/route.ts`

- [ ] **Step 1: Implement the brand context save endpoint**

`PATCH /api/ad-creatives/brand-context`

Request body: `{ clientId: string, brand: { name, logoUrl, colors, description } }`

Finds the existing `client_knowledge_entries` record with `type: 'brand_profile'` for this client. Updates `metadata.ad_creative_context` with the new brand info. If no record exists, creates one.

- [ ] **Step 2: Commit**

```
feat: save edited brand context to knowledge
```

---

## Task 7: Generate Route — Per-Template Variations + Placeholder Config

**Files:**
- Modify: `app/api/clients/[id]/ad-creatives/generate/route.ts`
- Modify: `lib/ad-creatives/orchestrate-batch.ts`

- [ ] **Step 1: Update the Zod schema**

Replace `templateIds` + `numVariations` with `templateVariations`:

```typescript
const bodySchema = z.object({
  templateVariations: z.array(z.object({
    templateId: z.string().uuid(),
    count: z.number().int().min(1).max(10),
  })).min(1, 'At least one template is required'),
  templateSource: z.enum(['kandy', 'custom']),
  productService: z.string().min(1).max(500),
  offer: z.string().max(300).optional(),
  aspectRatio: z.enum(['1:1', '9:16', '4:5']),
  onScreenTextMode: z.enum(['ai_generate', 'manual']),
  manualText: manualTextSchema.optional(),
  products: z.array(productInfoSchema).max(20).optional(),
  brandUrl: z.string().url().optional(),
});
```

Derive `templateIds` and `totalCount` from `templateVariations`. Build `placeholder_config` from brand colors + template thumbnails and write to batch record.

- [ ] **Step 2: Update the orchestrator**

In `orchestrate-batch.ts`, change `buildWorkItems` to read `config.templateVariations` instead of iterating `templates × numVariations`. Each template gets its own count.

- [ ] **Step 3: Update the wizard's fetch call**

The wizard currently sends `templateIds` + `numVariations`. Update to send `templateVariations` array.

- [ ] **Step 4: Commit**

```
feat: per-template variation counts in generate API + orchestrator
```

---

## Task 8: Brand Editor Component

**Files:**
- Create: `components/ad-creatives/brand-editor.tsx`

- [ ] **Step 1: Build the inline-editable brand card**

Props: `brand: ScrapedBrand`, `onBrandChange: (brand: ScrapedBrand) => void`, `clientId?: string`

Renders:
- Logo (clickable → file upload or URL paste)
- Brand name (click to edit → inline text input)
- Color swatches (click for color picker, "+" to add, "×" to remove)
- Description (click to edit → inline textarea)
- "Save to brand" button (visible when clientId is set, calls PATCH /api/ad-creatives/brand-context)

All edits call `onBrandChange` immediately (session state). "Save to brand" persists to knowledge.

Dark theme: `bg-surface` card, `text-text-primary`, `border-nativz-border`.

- [ ] **Step 2: Commit**

```
feat: inline-editable brand card component
```

---

## Task 9: Product Grid Component

**Files:**
- Create: `components/ad-creatives/product-grid.tsx`

- [ ] **Step 1: Build the product selection grid**

Props: `products: ScrapedProduct[]`, `selectedIndices: Set<number>`, `onToggle: (index: number) => void`, `onAddProduct: (product: ScrapedProduct) => void`

Renders:
- Grid of product cards (image, name, description truncated, price)
- Click to toggle selection (blue border + checkmark)
- "+ Add product" button → inline form (name, image URL/upload, description)
- "Paste product URL" button → text input, on submit calls `/api/ad-creatives/scrape-product`, adds result to grid
- Empty state: "No products found. Add manually or paste a product URL."

- [ ] **Step 2: Commit**

```
feat: product selection grid with manual add and URL paste
```

---

## Task 10: Template Grid Component (Always Visible, Aspect Ratio Sorted)

**Files:**
- Create: `components/ad-creatives/template-grid.tsx`

- [ ] **Step 1: Build the always-visible template grid**

Props: `templates: KandyTemplate[]`, `selectedIds: Set<string>`, `onToggle: (id: string) => void`, `onUpload: (files: FileList) => void`, `uploading: boolean`

Renders:
- Templates grouped by aspect ratio: Square (1:1), Story (9:16), Portrait (4:5)
- Section headers with count badge showing selected in that section
- Aspect ratio filter bar at top — clicking scrolls to section + highlights, others dim (opacity-50)
- Vertical filter dropdown within each section
- Upload button in header (drag-drop zone + file picker)
- "Your uploads" section at top if any custom templates exist
- Each template card: thumbnail, collection name, click to select (blue border + checkmark)

This is the largest UI component. Keep it focused — no copy/format logic, just template display and selection.

- [ ] **Step 2: Fix uploaded templates not appearing**

After upload completes, append the returned templates to local state immediately (optimistic update), then background-refresh from API.

- [ ] **Step 3: Commit**

```
feat: always-visible template grid sorted by aspect ratio
```

---

## Task 11: Variation Strip Component

**Files:**
- Create: `components/ad-creatives/variation-strip.tsx`

- [ ] **Step 1: Build the per-template variation strip**

Props: `templates: KandyTemplate[]` (only selected ones), `variations: Map<string, number>`, `onVariationChange: (templateId: string, count: number) => void`, `onRemove: (templateId: string) => void`

Renders:
- Horizontal scrollable strip of selected templates
- Each: small thumbnail (48px), template name, stepper (1–10, default 2), remove "×"
- Below strip: "**N ads total** (M templates: x + y + z)"

- [ ] **Step 2: Commit**

```
feat: per-template variation count strip
```

---

## Task 12: Gallery Placeholder Cards + Crossfade

**Files:**
- Create: `components/ad-creatives/gallery-placeholder.tsx`
- Modify: `components/ad-creatives/creative-gallery.tsx`

- [ ] **Step 1: Build the placeholder card component**

Props: `brandColors: string[]`, `templateThumbnailUrl?: string`, `status: 'generating' | 'completed' | 'failed'`, `imageUrl?: string`

Renders based on status:
- `generating`: Gradient background from brandColors[0] → brandColors[1], shimmer animation, template thumbnail at 20% opacity, "Generating..." spinner overlay
- `completed`: Crossfade transition — placeholder fades out, real image fades in (0.5s CSS transition using opacity + transform)
- `failed`: Red-tinted placeholder with "Failed — Retry" button

CSS: Use `@keyframes shimmer` for the loading effect. Crossfade via `transition: opacity 0.5s ease-in-out`.

- [ ] **Step 2: Update creative-gallery.tsx**

Add support for:
- Receiving `activeBatchId` and `placeholderConfig` props
- When `activeBatchId` is set, render placeholder cards for expected creatives
- Poll every 3s for batch progress (reuse existing polling pattern from generation-progress.tsx)
- As creatives complete, replace placeholder cards with real CreativeCard components (crossfade)
- Group creatives by batch with collapsible headers (date, status badge, count)

- [ ] **Step 3: Commit**

```
feat: gallery placeholder cards with brand-colored shimmer and crossfade
```

---

## Task 13: Generation Banner Component

**Files:**
- Create: `components/ad-creatives/generation-banner.tsx`

- [ ] **Step 1: Build the active generation banner**

Props: `clientId: string`, `onViewGallery: () => void`

Polls `GET /api/clients/{clientId}/ad-creatives/batches?status=generating` every 5s. If any active batch found, renders a sticky banner:

"Generating N ads for [client]... (X/Y done)" → [View →]

Auto-dismisses when no active batches remain. Subtle slide-down animation on appear, slide-up on dismiss.

- [ ] **Step 2: Commit**

```
feat: active generation banner component
```

---

## Task 14: Hub Rewrite — Recent Clients + Gallery Default

**Files:**
- Modify: `app/admin/ad-creatives/page.tsx`
- Modify: `components/ad-creatives/ad-creatives-hub.tsx`

- [ ] **Step 1: Add recent clients query to server component**

In `page.tsx`, add a Supabase query for recent clients with creative counts:

```sql
SELECT DISTINCT ON (b.client_id) b.client_id,
  COUNT(ac.id) as creative_count
FROM ad_generation_batches b
LEFT JOIN ad_creatives ac ON ac.batch_id = b.id
WHERE b.status IN ('completed', 'partial')
GROUP BY b.client_id
ORDER BY b.client_id, MAX(b.created_at) DESC
LIMIT 6
```

Join with the existing clients data. Pass `recentClients` prop to hub.

- [ ] **Step 2: Update hub landing page**

Add "Recent" section below the client picker showing up to 6 clients with:
- Client logo + name
- Creative count badge
- Click → sets clientId AND switches to gallery tab

- [ ] **Step 3: Default to gallery for returning clients**

When a client is selected (either from recent or picker), check if they have existing creatives. If yes, default `activeTab` to `'gallery'` instead of `'generate'`.

- [ ] **Step 4: Add the animated counter to the landing headline**

"Generate limitless ad creatives" with a counter that ticks 1 → 10K on log scale over 3 seconds. Use `useEffect` with `requestAnimationFrame` for smooth animation.

- [ ] **Step 5: Wire generation banner into hub**

Render `<GenerationBanner>` at the top of the hub (after header, before tabs) when a client is selected. Pass `onViewGallery` to switch to gallery tab.

- [ ] **Step 6: Commit**

```
feat: hub rewrite — recent clients, gallery default, animated counter, generation banner
```

---

## Task 15: Wizard Rewrite — Vertical Stepper

**Files:**
- Modify: `components/ad-creatives/ad-wizard.tsx` (complete rewrite)

- [ ] **Step 1: Rewrite the wizard as a vertical stepper**

The wizard composes the components from Tasks 8-11:

```
<div className="space-y-8">
  <WizardSection step={1} title="Brand" status={brandStatus}>
    <BrandEditor brand={brand} onBrandChange={setBrand} clientId={clientId} />
  </WizardSection>

  <WizardSection step={2} title="Products" status={productStatus}>
    <ProductGrid products={...} selectedIndices={...} onToggle={...} onAddProduct={...} />
  </WizardSection>

  <WizardSection step={3} title="Templates" status={templateStatus}>
    <TemplateGrid templates={...} selectedIds={...} onToggle={...} onUpload={...} />
  </WizardSection>

  {selectedTemplateIds.size > 0 && (
    <>
      <WizardSection step={4} title="Copy & Format" status={formatStatus}>
        {/* Aspect ratio radio buttons + copy mode */}
      </WizardSection>

      <WizardSection step={5} title="Generate" status="ready">
        <VariationStrip templates={...} variations={...} />
        <Button onClick={handleGenerate}>Generate {totalCount} ads</Button>
      </WizardSection>
    </>
  )}
</div>
```

`WizardSection` is a small wrapper: step number circle (empty/blue-pulse/green-check), title, content. All sections always visible and editable.

- [ ] **Step 2: Wire up the generate flow**

On generate:
1. Build `templateVariations` from the variation strip state
2. POST to generate endpoint with new schema
3. Set `activeBatchId` and `placeholderConfig` in hub state
4. Hub switches to Gallery tab (the gallery receives these as props and shows placeholders)

- [ ] **Step 3: Wire up brand crawl polling**

When the wizard mounts with a client that has no brand context:
1. Call `POST /api/ad-creatives/crawl-brand` with the client's website_url
2. Poll `GET /api/ad-creatives/crawl-brand?clientId=X` every 3s
3. When ready, populate brand + products in wizard state

If brand context exists in knowledge, load it immediately (no crawl).

- [ ] **Step 4: Commit**

```
feat: wizard rewrite — vertical stepper with all sections visible
```

---

## Task 16: Remove Generation Progress Component

**Files:**
- Remove: `components/ad-creatives/generation-progress.tsx`
- Modify: `components/ad-creatives/ad-wizard.tsx` — remove import and usage
- Modify: `components/ad-creatives/ad-creatives-hub.tsx` — remove any references

- [ ] **Step 1: Remove the file and all references**

The gallery placeholder cards (Task 12) replace this component entirely.

- [ ] **Step 2: Commit**

```
refactor: remove generation-progress component (replaced by gallery placeholders)
```

---

## Task 17: Integration Testing + QA

- [ ] **Step 1: Run `npx tsc --noEmit`** — fix any type errors
- [ ] **Step 2: Run `npm run lint`** — fix any lint errors
- [ ] **Step 3: Run `npm run build`** — verify production build succeeds
- [ ] **Step 4: Browser QA with Playwright MCP**

Walk through the full flow:
1. Navigate to `/admin/ad-creatives`
2. Verify animated counter on landing
3. Pick a client (Crystal Creek Cattle — products on sub-pages)
4. Verify brand crawl finds products across multiple pages
5. Verify logo is from navbar, not favicon
6. Edit a color swatch
7. Add a product manually
8. Verify templates are visible without clicking (always-open grid)
9. Select 2 templates, set different variation counts
10. Generate → verify gallery shows placeholder cards with brand colors
11. Wait for completion → verify crossfade
12. Navigate away → verify generation banner appears
13. Return → verify gallery shows existing creatives
14. Pick the same client again from recent clients → verify gallery loads directly

- [ ] **Step 5: Commit any fixes**

```
fix: QA fixes for ad creative wizard v2 phase 1
```
