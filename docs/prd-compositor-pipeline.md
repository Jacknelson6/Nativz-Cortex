# PRD: Nativz Cortex Creative OS — From Ad Generator to Self-Improving Creative Engine

## The Vision: What We're Actually Building

This isn't a feature. This is the transformation of Cortex from an "ad generator" into a **Creative Operating System** — a platform that gets better at making ads the more you use it, per client, per industry, per style.

Here's the endgame: A franchise owner logs in, clicks "Generate 20 ads for our March pizza special," and gets 20 creatives where 15+ are immediately usable. Not because the AI got lucky, but because the system has learned from 200 previous creatives what works for this brand — what compositions their audience responds to, what color palettes match their vibe, what copy structures their creative director keeps vs deletes.

That's Creative OS. The ad generation is table stakes. The intelligence layer is the product.

### What "Success" Looks Like — The Creative Quality Framework

To build a self-improving system, you need a definition of what "better" means that the system can actually measure. Without this, the recursive loop has no objective function — it's just collecting data with no direction.

We define success across 5 dimensions. These aren't aspirational metrics — they're concrete, measurable signals that the system tracks and optimizes against at every level.

---

### Dimension 1: Usability Rate (The North Star)

**Definition:** Of all creatives generated in a batch, what percentage does the admin keep (favorite or download) without manual editing?

**Why this is the north star:** This is the single number that tells you whether the system is working. If an admin generates 20 ads and favorites 3, usability rate is 15%. That's bad — the admin wasted time reviewing 17 rejects. If they favorite 14, usability rate is 70%. That's a product people pay for.

**How to measure:**
```
Usability Rate = (favorited + downloaded) / total_generated × 100
```

Tracked per batch, per client, and globally. Stored in batch metadata after the admin has reviewed (>60% of batch has signals).

**Targets by system maturity:**

| Stage | Usability Rate | What It Means |
|-------|---------------|---------------|
| Baseline (no compositor, no intelligence) | 15-25% | Current state — most ads have text issues or wrong vibes |
| After compositor (Phase 1-7) | 35-50% | Text is always perfect, but style/composition still varies |
| After intelligence loop (Phase 8, low confidence) | 45-60% | System avoids known-bad styles, nudges toward winners |
| After intelligence loop (high confidence, 100+ signals) | 60-80% | System "knows" the client's aesthetic |
| With reference imports + high confidence | 70-85% | Cold start solved, every batch is informed |

**How the recursive loop uses this:** After each batch review, the system calculates usability rate and stores it on the batch record. The winner analyzer compares usability rates across batches to detect whether the intelligence loop is actually improving output quality over time. If usability rate plateaus or drops, the system flags it for the admin: "Style memory may be stale — consider uploading new reference ads."

---

### Dimension 2: First-Pass QA Rate

**Definition:** Of all creatives in a batch, what percentage pass QA on the first Gemini generation attempt (no retries needed)?

**Why it matters:** Each retry costs money (another Gemini API call) and time (~15-30 seconds). First-pass QA rate directly correlates with generation speed and cost efficiency. With the compositor handling text, this metric should jump dramatically because the #1 QA failure mode (garbled/misspelled/missing text) is eliminated by construction.

**How to measure:**
```
First-Pass QA Rate = creatives_passed_first_attempt / total_generated × 100
```

Already trackable from existing `metadata.qa_passed` field + retry count.

**Targets:**

| Stage | First-Pass QA Rate | Primary Failure Mode |
|-------|-------------------|---------------------|
| Current (no compositor) | 40-60% | Text garble, duplicate logos, wrong hero |
| After compositor | 75-90% | Wrong hero imagery, bad composition (text issues gone) |
| After intelligence + compositor | 85-95% | Rare composition edge cases only |

**How the recursive loop uses this:** The intelligence loop tracks which Nano Banana styles have the highest first-pass QA rates per client. Styles that consistently fail QA (even after text is handled by compositor) indicate a mismatch between the template's style direction and the brand's visual identity. The winner analyzer flags these: "stat-hero template fails QA 40% of the time for this client — consider removing from defaults."

---

### Dimension 3: Style Consistency Score

**Definition:** How visually consistent are the creatives within a single batch? Measured by the similarity of composition patterns, color usage, and visual tone across the batch.

**Why it matters:** Franchises need consistent brand presence. If a batch of 20 ads looks like 20 different brands designed them, the output is useless even if each individual ad is high quality. Consistency is what separates a "creative system" from "random AI art."

**How to measure:** This is harder to quantify automatically, so we use two proxy metrics:

1. **Template concentration:** What percentage of the batch uses the top 3 template styles? Higher concentration = more consistent look.
   ```
   Template Concentration = creatives_using_top_3_styles / total × 100
   ```

2. **Style memory alignment:** What percentage of the batch's templates are in the client's "preferred" list?
   ```
   Memory Alignment = creatives_using_preferred_styles / total × 100
   ```

**Targets:**

| Stage | Template Concentration | Memory Alignment |
|-------|----------------------|------------------|
| Current (random selection) | 30-40% | N/A (no memory) |
| With intelligence (medium confidence) | 50-65% | 40-60% |
| With intelligence (high confidence) | 65-80% | 70-90% |

**How the recursive loop uses this:** When the admin selects "Use recommended styles" and the batch scores high on both usability AND consistency, the system reinforces those template selections in the next analysis. When templates produce inconsistent results (high variance in QA scores within the same batch), the analyzer notes this pattern and may move those templates from "preferred" to "neutral."

---

### Dimension 4: Generation Efficiency

**Definition:** Cost and time per usable creative. Not per generated creative — per KEPT creative.

**Why it matters:** Generating 100 ads to get 15 keepers is expensive. Generating 20 ads to get 15 keepers is 5x more efficient. The intelligence loop's job is to increase the ratio of keepers to total generations.

**How to measure:**
```
Cost Per Usable = total_batch_api_cost / usable_count
Time Per Usable = total_batch_generation_time / usable_count
```

API cost can be estimated:
- Gemini Flash: ~$0.002 per image generation
- Gemini QA check: ~$0.001 per check
- Claude copy generation: ~$0.003 per batch
- Claude analysis (intelligence): ~$0.005 per analysis run

**Targets:**

| Stage | Cost Per Usable | Time Per Usable |
|-------|----------------|-----------------|
| Current | ~$0.08-0.12 | ~45-90 seconds |
| After compositor (fewer retries) | ~$0.04-0.06 | ~25-40 seconds |
| After intelligence (higher hit rate) | ~$0.02-0.04 | ~20-30 seconds |

**How the recursive loop uses this:** The system tracks cost-per-usable across batches. If a new style memory version INCREASES cost (more retries, lower usability), the system detects regression and can auto-rollback to the previous style memory version. This is why we version style memory — it's a safety net against bad analysis.

---

### Dimension 5: Learning Velocity

**Definition:** How quickly does the system's usability rate improve as more feedback accumulates?

**Why it matters:** This is the meta-metric — it measures whether the recursive loop itself is working. A system that collects feedback but never improves has a broken loop. A system where usability rate climbs from 25% to 60% over 5 batches has a healthy loop.

**How to measure:**
```
Learning Velocity = (usability_rate_last_3_batches - usability_rate_first_3_batches) / number_of_batches
```

Positive = improving. Zero = stalled. Negative = degrading.

**Targets:**

| Batches Completed | Expected Usability Trend |
|-------------------|------------------------|
| 1-3 (cold start) | 20-35% (baseline, learning) |
| 4-6 (low confidence) | 35-50% (first intelligence kicks in) |
| 7-10 (medium confidence) | 50-65% (clear improvement visible) |
| 10+ (high confidence) | 60-80% (plateaus at client's quality ceiling) |

**How the recursive loop uses this:** The winner analyzer tracks learning velocity as part of its analysis. If velocity stalls (5+ batches with no improvement), the analysis prompt includes this context: "Usability rate has plateaued at X%. The current style direction may be too narrow. Consider broadening template variety or updating reference ads to shift the aesthetic."

This is how the system avoids getting stuck in a local optimum — it detects stagnation and recommends exploration.

---

### The Framework Summary: How These 5 Dimensions Drive the Loop

```
                    ┌─────────────────────────┐
                    │    GENERATE BATCH        │
                    │  (compositor + prompts)  │
                    └───────────┬──────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │    MEASURE                │
                    │  • Usability Rate (D1)   │
                    │  • First-Pass QA (D2)    │
                    │  • Consistency (D3)      │
                    │  • Efficiency (D4)       │
                    └───────────┬──────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │    ANALYZE               │
                    │  Winner patterns +       │
                    │  dimension trends        │
                    │  → Updated style memory  │
                    └───────────┬──────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │    ADAPT                 │
                    │  • Inject style direction│
                    │  • Bias template select  │
                    │  • Adjust defaults       │
                    │  • Flag stagnation (D5)  │
                    └───────────┬──────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │    GENERATE NEXT BATCH   │
                    │  (informed by memory)    │
                    └─────────────────────────┘
```

Each dimension serves a specific role in the loop:
- **D1 (Usability)** is the objective function — what are we maximizing?
- **D2 (First-Pass QA)** is the quality floor — are we wasting retries?
- **D3 (Consistency)** is the brand constraint — are outputs coherent?
- **D4 (Efficiency)** is the cost check — are we getting smarter or just spending more?
- **D5 (Learning Velocity)** is the meta-check — is the loop itself working?

The winner analyzer receives ALL 5 dimensions as context when building its analysis. This means the style direction it produces isn't just "what looks good" — it's "what looks good AND passes QA AND is consistent AND is cost-efficient AND represents improvement over last time."

---

### Dimension Tracking: Where the Numbers Live

All 5 dimensions are stored on the batch record after review is complete. Add these fields to the `ad_generation_batches` table:

```sql
ALTER TABLE ad_generation_batches ADD COLUMN IF NOT EXISTS metrics JSONB DEFAULT NULL;
-- metrics schema:
-- {
--   "usability_rate": 0.65,
--   "first_pass_qa_rate": 0.85,
--   "template_concentration": 0.72,
--   "memory_alignment": 0.80,
--   "cost_per_usable": 0.035,
--   "time_per_usable_seconds": 28,
--   "total_api_cost_estimate": 0.52,
--   "review_completeness": 0.90,  // % of batch with signals
--   "computed_at": "2026-03-28T..."
-- }
```

Compute metrics when review completeness exceeds 60% (>60% of creatives have been favorited, deleted, or downloaded). Store once, reference in subsequent analysis runs.

A utility function computes all metrics from the batch's creatives and feedback:

```typescript
export async function computeBatchMetrics(batchId: string): Promise<BatchMetrics | null> {
  // Fetch all creatives for this batch
  // Fetch all feedback for these creative IDs
  // Calculate each dimension
  // Return null if review completeness < 60%
  // Store on batch record
}
```

The winner analyzer receives the last 10 batches' metrics alongside individual creative feedback. This gives it both the macro trend (are we improving?) and the micro detail (which specific creatives won/lost?).

---

### How the Framework Makes the Recursive Loop Self-Correcting

Without the framework, the loop can go wrong in predictable ways:

**Failure mode 1: Overfitting to one style.** The admin favorites 5 "headline" style ads early on. The system locks into headline-only recommendations. Future batches are all headline, and usability stalls because there's no variety.

**How the framework catches it:** D5 (Learning Velocity) detects the plateau. D3 (Consistency) scores high but D1 (Usability) stops climbing. The analyzer sees: "High consistency, stalled usability — the style palette is too narrow. Recommend introducing 2-3 styles outside current preferences for A/B testing."

**Failure mode 2: Bad analysis corrupts style memory.** A small sample of 6 signals produces a misleading pattern. The system starts avoiding a style that was actually fine — the 3 deletions were for unrelated reasons (bad copy, not bad template).

**How the framework catches it:** D4 (Efficiency) degrades — cost per usable increases because the system is now avoiding viable templates. D5 (Learning Velocity) goes negative. The system flags: "Metrics degraded after style memory v3. Consider rolling back to v2." The version history in `ad_style_memory` makes rollback trivial.

**Failure mode 3: The compositor produces technically correct but visually boring ads.** Text is perfect, logo is right, but the compositions are all safe/generic because the layout engine defaults to the same archetype.

**How the framework catches it:** D1 (Usability) stays moderate but doesn't climb past 50%. The analyzer sees the pattern: "High QA pass rate (D2: 90%) but moderate usability (D1: 48%). Creatives are technically correct but not compelling. Style direction should emphasize bolder compositions — larger headlines, more saturated backgrounds, product closer to camera."

This is the power of having multiple dimensions. No single metric can be gamed or misinterpreted because the others serve as cross-checks.

---

## The Problem We're Solving (Read This First)

Right now, Nativz Cortex generates static ads by asking Gemini (an AI image generation model) to do **everything in one shot**: create the background scene, render the product, AND paint text (headline, subheadline, CTA button, offer line, brand logo) directly into the image. This is the root cause of almost every quality issue we have.

Here's why this architecture fails:

1. **AI image models are bad at text.** Even the best models (Gemini 3.1 Flash Image, DALL-E, Midjourney) struggle with typography. They misspell words, garble letterforms, clip text at edges, render gibberish, and can't do precise font selection. Our QA layer (`qa-check.ts`) exists specifically because text rendering fails often enough that we need to OCR-verify every generated image and retry up to 2 more times. That means in the worst case, we're making **3 Gemini API calls per creative** just to get readable text — and it still sometimes fails.

2. **Our prompt is bloated with defensive instructions.** Open `gemini-static-ad-prompt.ts` and count how many lines say "do NOT" something. The prompt is ~3000-4000 tokens, and over half is telling Gemini not to: duplicate logos, render fake UI, add URLs, garble text, create dashboard screenshots, etc. Every QA retry adds MORE negative instructions via `qa-retry-hint.ts`. We're in a spiral where the model makes mistakes → we add more "don't do this" rules → the prompt gets longer → the model has more to ignore → it makes different mistakes.

3. **Text is deterministic, not creative.** The headline, subheadline, CTA, and offer text are KNOWN STRINGS. We already have them before generation starts. There's zero reason to ask a probabilistic AI model to "draw" known text when we can render it with pixel-perfect precision using a typography engine.

### The Solution: Separate What AI Is Good At From What Code Is Better At

The advertising industry has solved this problem for decades. It's called **compositing** — layering different elements from different sources into a final image. Photoshop does it. Figma does it. Every ad production pipeline does it.

Our new architecture:

| What | Who Does It | Why |
|------|------------|-----|
| Background scene, mood, lighting | Gemini (AI) | Creative, generative — AI excels here |
| Product/subject placement | Gemini (AI) | Needs to look natural in the scene |
| Headline text | Sharp + Satori (code) | Known string, needs pixel-perfect rendering |
| Subheadline text | Sharp + Satori (code) | Known string, needs readable at small size |
| CTA button | Sharp + Satori (code) | Known string, needs exact button shape |
| Offer line | Sharp + Satori (code) | Known string, legal compliance matters |
| Brand logo | Sharp (code) | Uploaded asset, must be exact |
| Legal/disclaimer | Sharp (code) | Compliance-critical, must be exact |

After this change:
- Gemini generates a **"clean canvas"** — the background scene with product/subject, no text, no logo
- Our compositor overlays all text and branding as crisp vector-rendered layers
- QA retries for text issues **disappear entirely** (text is always correct by construction)
- The Gemini prompt shrinks by ~60% because we remove all typography, CTA formatting, logo placement, and "don't add fake text" instructions
- Cost per creative drops because we stop burning retries on text failures

## What We Already Have (Don't Rebuild These)

Before you write any code, understand what already exists in the codebase:

### Font resolution (`lib/ad-creatives/resolve-fonts.ts`)
We already have a font resolver that fetches Google Fonts as TTF ArrayBuffers for satori rendering. It caches fonts in memory, handles fallback to Inter, and returns a `ResolvedFontPair` with display (headline) and body fonts including weight. **Use this directly.** Don't build a new font system.

### Satori (`package.json` → `"satori": "^0.25.0"`)
Satori is already installed. It converts React-like JSX (as plain objects) to SVG. Combined with Sharp, it gives us a full typography pipeline: Satori renders text to SVG → Sharp converts to PNG → Sharp composites onto the AI image. Satori supports custom fonts, which is why `resolve-fonts.ts` exists.

### Sharp (`package.json` → `"sharp": "^0.34.5"`)
Already installed and used throughout the codebase (wireframe generation, QA dimension checks, visual extraction). Sharp handles PNG/JPEG composition, resizing, overlaying transparent layers, and format conversion.

### Brand context (`lib/knowledge/brand-context.ts`)
`getBrandContext()` returns the full brand profile including:
- `visualIdentity.colors` — array of `{ hex, name, role }` (primary, secondary, accent, etc.)
- `visualIdentity.fonts` — array of `{ family, weight, role }` (display, body)
- `visualIdentity.logos` — array of `{ url, type }` (primary, icon, wordmark)
- `verbalIdentity` — tone, voice attributes
- `clientName`, `clientIndustry`, `clientWebsiteUrl`

### Brand logo URLs (`lib/ad-creatives/brand-reference-images.ts`)
`brandLogoImageUrlsForGeneration()` already resolves up to 2 official logo URLs from Brand DNA. These are currently sent to Gemini as inline image references. The compositor should fetch and overlay them instead.

### Types (`lib/ad-creatives/types.ts`)
All the types you need exist: `OnScreenText` (headline, subheadline, cta), `AdPromptSchema` (layout zones including ctaPosition, textPosition), `AspectRatio`, and the dimension constants in `ASPECT_RATIOS`.

### The orchestrator (`lib/ad-creatives/orchestrate-batch.ts`)
This is the main pipeline controller. It currently: resolves brand context → generates copy → builds prompts → calls Gemini → runs QA → retries on failure → uploads to storage. The compositor will be inserted between "calls Gemini" and "uploads to storage." The orchestrator already has all the data the compositor needs (brand context, on-screen text, aspect ratio, template schema).

## Architecture of the Compositor

### File Structure

Create these files:

```
lib/ad-creatives/compositor/
├── index.ts              — Main entry point, exports compositeAdCreative()
├── text-renderer.ts      — Satori + Sharp text-to-PNG pipeline
├── logo-renderer.ts      — Logo fetch, resize, and positioning
├── cta-renderer.ts       — CTA button rendering (pill/rect with text)
├── layout-engine.ts      — Decides where each element goes based on AdPromptSchema
├── color-utils.ts        — Contrast checking, color manipulation
└── types.ts              — Compositor-specific types
```

### Why This File Structure

Each file has a single responsibility. The layout engine is separate from renderers because layout decisions (where things go) are independent from rendering decisions (how things look). This matters because different templates need different layouts but the rendering logic stays the same. Color utilities are separate because contrast checking is used by multiple renderers (headline needs contrast against background, CTA needs contrast against button fill).

---

## Implementation — Phase 1: Text Renderer (`text-renderer.ts`)

### What It Does

Takes a text string, font, size, color, and maximum width → returns a transparent PNG buffer of that rendered text. This is the foundational building block. Every text element (headline, subheadline, offer) goes through this.

### How It Works (Step by Step)

1. Accept params: `{ text, fontData, fontName, fontSize, fontWeight, color, maxWidth, maxHeight, align, lineHeight }`
2. Build a satori element (plain JS object, NOT JSX — this runs server-side with no React):
   ```typescript
   const element = {
     type: 'div',
     props: {
       style: {
         display: 'flex',
         flexDirection: 'column',
         justifyContent: 'center',
         width: maxWidth,
         maxHeight: maxHeight,
         color: color,
         fontSize: fontSize,
         fontFamily: fontName,
         fontWeight: fontWeight,
         lineHeight: lineHeight ?? 1.2,
         textAlign: align ?? 'left',
         wordWrap: 'break-word',
         overflow: 'hidden',
       },
       children: text,
     },
   };
   ```
3. Call `satori(element, { width: maxWidth, height: maxHeight, fonts: [{ name: fontName, data: fontData, weight: fontWeight }] })` → returns SVG string
4. Convert SVG to PNG buffer via `sharp(Buffer.from(svgString)).png().toBuffer()`
5. Return the PNG buffer and its actual rendered dimensions (width × height after text wrapping)

### Why Satori Instead of Canvas API or Direct SVG

- Satori handles **text wrapping, line breaking, and font metrics** automatically. If you try to do this with raw SVG `<text>` elements, you have to calculate line breaks yourself (SVG has no word-wrap). Canvas API (`node-canvas`) requires native dependencies (Cairo) that complicate deployment on Vercel/Cloud Run. Satori is pure JS, already installed, and already has font resolution built.
- Satori outputs SVG which Sharp can convert to any raster format at any resolution. This means our text renders are resolution-independent until the final composite step.

### Font Size Strategy

Don't hardcode font sizes. Calculate them relative to the canvas dimensions:

```typescript
function computeFontSize(role: 'headline' | 'subheadline' | 'cta' | 'offer', canvasHeight: number): number {
  const ratios = {
    headline: 0.065,      // ~70px on 1080px canvas
    subheadline: 0.032,   // ~35px on 1080px canvas
    cta: 0.030,           // ~32px on 1080px canvas
    offer: 0.028,         // ~30px on 1080px canvas
  };
  return Math.round(canvasHeight * ratios[role]);
}
```

Why ratios instead of fixed sizes: We support 5 aspect ratios (1080×1080, 1080×1350, 1080×1920, 1920×1080, 1200×628). Fixed pixel sizes would look too big on small canvases and too small on large ones. Ratios scale naturally.

### Auto-Sizing for Long Headlines

Sometimes AI-generated copy produces a headline that's too long to fit at the default size. The renderer should have a fallback:

1. Render at default size
2. If the rendered height exceeds `maxHeight`, reduce fontSize by 15% and try again
3. Repeat up to 3 times (minimum 60% of original size)
4. If still too tall, truncate with ellipsis (this shouldn't happen with well-generated copy, but we need a safety net)

This is important because the copy generator (`generate-copy.ts`) targets max 8 words for headlines, but doesn't enforce pixel-level fit. The compositor is the last line of defense.

---

## Implementation — Phase 2: CTA Renderer (`cta-renderer.ts`)

### What It Does

Renders a CTA button as a transparent PNG: a filled rounded rectangle (pill or rect) with centered text inside.

### How It Works

1. Accept params: `{ text, fontData, fontName, fontSize, fontWeight, textColor, backgroundColor, borderRadius, paddingX, paddingY, maxWidth }`
2. Use satori to render a div with:
   - `backgroundColor` fill
   - `borderRadius` for pill shape
   - `paddingLeft/Right` for horizontal breathing room
   - `paddingTop/Bottom` for vertical padding
   - Centered text child
3. Convert SVG → PNG via Sharp
4. Return PNG buffer and dimensions

### Why a Separate Renderer for CTA

The CTA is the only text element that has a **background shape**. Headlines and subheadlines are text-only (they sit on the AI-generated background). The CTA sits on a colored button. This means it needs different rendering logic (background fill, border radius, padding calculation). Keeping it separate also lets us easily add button variants later (outlined, gradient, shadow).

### Button Style Resolution

The `AdPromptSchema.ctaStyle.buttonShape` field tells us what shape the template expects. Map it:

```typescript
function resolveButtonStyle(shape: string): { borderRadius: number; paddingX: number; paddingY: number } {
  const normalized = shape.toLowerCase();
  if (normalized.includes('pill') || normalized.includes('round')) {
    return { borderRadius: 999, paddingX: 40, paddingY: 14 }; // full pill
  }
  if (normalized.includes('square') || normalized.includes('sharp')) {
    return { borderRadius: 4, paddingX: 32, paddingY: 12 }; // sharp rect
  }
  return { borderRadius: 12, paddingX: 36, paddingY: 13 }; // default soft rounded
}
```

### Button Colors

The CTA button color should come from the brand's accent or primary color. Resolution order:

1. Brand color with role `accent` → use as background
2. Brand color with role `primary` → use as background
3. First brand color → use as background
4. Fallback: `#111111` (near-black)

Text color: calculate whether white or black text has better contrast against the chosen background (use WCAG contrast ratio formula). This is why `color-utils.ts` exists.

---

## Implementation — Phase 3: Logo Renderer (`logo-renderer.ts`)

### What It Does

Fetches the brand's official logo, resizes it to fit the designated zone, and returns it as a transparent PNG buffer ready for compositing.

### How It Works

1. Get logo URL from `brandLogoImageUrlsForGeneration(brandContext)` (already exists)
2. Fetch the image (with timeout, same pattern as `generate-image.ts` uses `fetchImageAsBase64`)
3. Use Sharp to:
   - Convert to PNG with alpha channel (in case source is JPEG)
   - Resize to fit within a max bounding box (typically 15-20% of canvas width)
   - Maintain aspect ratio (`sharp.resize({ fit: 'inside' })`)
4. Return the buffer and actual dimensions

### Why We Fetch Instead of Embedding

Logos are stored in Supabase Storage or on the client's website. We can't bundle them. The fetch is fast (usually <500ms from Supabase CDN) and we can cache the buffer for the duration of a batch (same logo used across all creatives in a batch).

### Logo Caching Within a Batch

Add a simple Map cache keyed by URL. The orchestrator creates one compositor instance per batch, so the cache lives for the batch lifetime. This prevents fetching the same logo 20 times for a 20-creative batch.

```typescript
const logoCache = new Map<string, Buffer>();
```

---

## Implementation — Phase 4: Layout Engine (`layout-engine.ts`)

### What It Does

This is the brain of the compositor. Given the canvas dimensions and the `AdPromptSchema`, it decides exactly where each element (headline, subheadline, CTA, offer, logo) gets placed on the canvas. It outputs a `CompositeLayout` — a map of element positions.

### Why This Is the Hardest Part

Different templates have radically different layouts:
- Some have text on the left, product on the right (split-screen)
- Some have text centered over a full-bleed background
- Some have text at the top, CTA at the bottom
- Some have headline at bottom with product hero taking 70% of the frame

The layout engine must interpret the `AdPromptSchema.layout` fields (which are natural language strings like "text-left with hero right" or "centered stack") and convert them to pixel coordinates.

### Layout Strategy: Zone-Based

Don't try to pixel-perfect match every possible layout description. Instead, define a small set of layout archetypes and map schema descriptions to them:

```typescript
type LayoutArchetype =
  | 'left_stack'      // Text stacked on left 45%, hero right 55%
  | 'right_stack'     // Text stacked on right 45%, hero left 55%
  | 'center_overlay'  // Text centered over full-bleed background
  | 'top_text'        // Text top 40%, hero bottom 60%
  | 'bottom_text'     // Hero top 60%, text bottom 40%
  | 'full_overlay';   // All text overlaid on full background with gradient
```

Each archetype defines zones as percentage-based rectangles:

```typescript
interface ElementZone {
  x: number;      // percentage of canvas width (0-1)
  y: number;      // percentage of canvas height (0-1)
  width: number;  // percentage of canvas width
  height: number; // percentage of canvas height
}

interface CompositeLayout {
  headline: ElementZone;
  subheadline: ElementZone;
  cta: ElementZone;
  offer: ElementZone | null;  // null if no offer
  logo: ElementZone;
}
```

### Archetype Detection

Parse the schema's `layout.textPosition` and `layout.visualHierarchy` strings to classify:

```typescript
function detectArchetype(schema: AdPromptSchema): LayoutArchetype {
  const text = `${schema.layout.textPosition} ${schema.layout.visualHierarchy}`.toLowerCase();

  if (/\bleft\b/.test(text) && /\bstack\b|\bcolumn\b/.test(text)) return 'left_stack';
  if (/\bright\b/.test(text) && /\bstack\b|\bcolumn\b/.test(text)) return 'right_stack';
  if (/\btop\b/.test(text) && /\bbottom\b.*\b(cta|hero)\b/.test(text)) return 'top_text';
  if (/\bbottom\b/.test(text) && /\btop\b.*\bhero\b/.test(text)) return 'bottom_text';
  if (/\bcenter\b|\boverlay\b/.test(text)) return 'center_overlay';

  // Default: full overlay (safest — text with shadow over background)
  return 'full_overlay';
}
```

### Margin and Padding Constants

Define these as percentages of canvas size (not pixels) so they scale across aspect ratios:

```typescript
const MARGIN = 0.06;              // 6% margin from edges
const ELEMENT_GAP = 0.025;        // 2.5% gap between text elements
const LOGO_MAX_WIDTH = 0.18;      // Logo max 18% of canvas width
const LOGO_MAX_HEIGHT = 0.08;     // Logo max 8% of canvas height
const CTA_MAX_WIDTH = 0.45;       // CTA button max 45% of canvas width
```

### Why Percentages, Not Pixels

We serve 5 aspect ratios. A 60px margin looks right on 1080×1080 but cramped on 1920×1080 and way too small on 1080×1920. Percentages adapt automatically. Multiply by canvas width/height at composite time to get final pixel values.

---

## Implementation — Phase 5: Color Utilities (`color-utils.ts`)

### What It Does

Provides contrast ratio calculation (WCAG 2.0), color lightness detection, and text shadow generation.

### Key Functions

```typescript
/** WCAG 2.0 relative luminance */
function relativeLuminance(hex: string): number

/** WCAG contrast ratio between two colors (1:1 to 21:1) */
function contrastRatio(hex1: string, hex2: string): number

/** Pick white or black text for best readability on a given background */
function bestTextColor(backgroundHex: string): '#FFFFFF' | '#000000'

/** Generate a text shadow CSS value for readability on varied backgrounds */
function textShadowForOverlay(textColor: string): string
```

### Why Contrast Checking Matters

When the compositor overlays text on an AI-generated background, it has no control over what colors are in that background. A white headline on a light background is unreadable. The compositor needs to:

1. **For `center_overlay` and `full_overlay` layouts**: Add a semi-transparent gradient band behind the text zone before overlaying text. This guarantees contrast regardless of background content.
2. **For split layouts** (`left_stack`, `right_stack`): The text zone has a solid or semi-solid background panel, so contrast is controlled.
3. **For CTA buttons**: Calculate text color against button fill (already covered in CTA renderer).

### Background Band Implementation

For overlay layouts, the compositor should add a gradient band BEFORE text:

```typescript
// Example: bottom text overlay — dark gradient from 50% to 100% height
async function buildGradientOverlay(width: number, height: number, position: 'top' | 'bottom'): Promise<Buffer> {
  const gradientSvg = position === 'bottom'
    ? `<svg width="${width}" height="${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="black" stop-opacity="0"/><stop offset="40%" stop-color="black" stop-opacity="0"/><stop offset="100%" stop-color="black" stop-opacity="0.75"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`
    : `<svg>...</svg>`; // top gradient
  return sharp(Buffer.from(gradientSvg)).png().toBuffer();
}
```

This is how professional ad templates work — the text always sits on a controlled surface.

---

## Implementation — Phase 6: Main Compositor (`index.ts`)

### What It Does

This is the orchestrator of the compositor. It takes the AI-generated "clean" image + brand context + on-screen text + template schema → produces the final composited ad with all text and branding overlaid.

### Function Signature

```typescript
interface CompositeAdParams {
  /** The AI-generated background image (no text, no logo) */
  backgroundImage: Buffer;
  /** Brand context for colors, fonts, logos */
  brandContext: BrandContext;
  /** The text to render on the ad */
  onScreenText: OnScreenText;
  /** Optional offer line */
  offer: string | null;
  /** Template schema for layout decisions */
  promptSchema: AdPromptSchema;
  /** Target dimensions */
  width: number;
  height: number;
  /** Aspect ratio string for any ratio-specific adjustments */
  aspectRatio: AspectRatio;
}

interface CompositeResult {
  /** Final composited image as PNG buffer */
  image: Buffer;
  /** Metadata about what was composited (for debugging/QA) */
  metadata: {
    layoutArchetype: LayoutArchetype;
    fontsUsed: { display: string; body: string };
    ctaBackgroundColor: string;
    ctaTextColor: string;
    logoPlaced: boolean;
    gradientOverlayApplied: boolean;
  };
}

export async function compositeAdCreative(params: CompositeAdParams): Promise<CompositeResult>
```

### Compositing Order (Layer Stack)

This order matters. Sharp composites layers bottom-to-top. Each `sharp.composite()` call adds a layer on top of the previous result.

```
Layer 0: AI-generated background image (clean — no text, no logo)
Layer 1: Gradient overlay band (only for overlay layouts — adds text contrast)
Layer 2: Text background panel (only for split layouts — solid/semi-transparent rect for text zone)
Layer 3: Brand logo (positioned per layout engine)
Layer 4: Headline text (rendered via satori → sharp)
Layer 5: Subheadline text
Layer 6: Offer line (if present)
Layer 7: CTA button (rendered via cta-renderer)
```

### Implementation Flow

```typescript
export async function compositeAdCreative(params: CompositeAdParams): Promise<CompositeResult> {
  const { backgroundImage, brandContext, onScreenText, offer, promptSchema, width, height, aspectRatio } = params;

  // 1. Resolve layout
  const archetype = detectArchetype(promptSchema);
  const layout = computeLayout(archetype, width, height, !!offer);

  // 2. Resolve fonts
  const fonts = await resolveBrandFonts(brandContext.visualIdentity.fonts);

  // 3. Resolve brand colors
  const accentColor = findAccentColor(brandContext.visualIdentity.colors);
  const ctaTextColor = bestTextColor(accentColor);

  // 4. Build composite layers (parallel where possible)
  const [headlinePng, subheadlinePng, ctaPng, offerPng, logoPng, gradientPng] = await Promise.all([
    renderText({ text: onScreenText.headline, ... }),
    renderText({ text: onScreenText.subheadline, ... }),
    renderCtaButton({ text: onScreenText.cta, backgroundColor: accentColor, textColor: ctaTextColor, ... }),
    offer ? renderText({ text: offer, ... }) : null,
    renderLogo(brandContext, layout.logo, width),
    needsGradient(archetype) ? buildGradientOverlay(width, height, gradientPosition(archetype)) : null,
  ]);

  // 5. Composite all layers onto background
  const compositeOps = [];

  if (gradientPng) {
    compositeOps.push({ input: gradientPng, top: 0, left: 0 });
  }

  if (logoPng) {
    compositeOps.push({
      input: logoPng,
      top: Math.round(layout.logo.y * height),
      left: Math.round(layout.logo.x * width),
    });
  }

  compositeOps.push({
    input: headlinePng,
    top: Math.round(layout.headline.y * height),
    left: Math.round(layout.headline.x * width),
  });

  compositeOps.push({
    input: subheadlinePng,
    top: Math.round(layout.subheadline.y * height),
    left: Math.round(layout.subheadline.x * width),
  });

  if (offerPng) {
    compositeOps.push({
      input: offerPng,
      top: Math.round(layout.offer!.y * height),
      left: Math.round(layout.offer!.x * width),
    });
  }

  compositeOps.push({
    input: ctaPng,
    top: Math.round(layout.cta.y * height),
    left: Math.round(layout.cta.x * width),
  });

  const finalImage = await sharp(backgroundImage)
    .resize(width, height, { fit: 'cover' })
    .composite(compositeOps)
    .png()
    .toBuffer();

  return { image: finalImage, metadata: { ... } };
}
```

---

## Integration Into the Orchestrator

### What Changes in `orchestrate-batch.ts`

This is where the compositor plugs in. The changes are surgical — we're inserting a step, not rewriting the pipeline.

**Current flow:**
```
Build prompt (with all text instructions) → Generate image (Gemini) → QA check → Retry if text fails → Upload
```

**New flow:**
```
Build prompt (simplified, no text instructions) → Generate clean image (Gemini) → Composite text/logo/CTA → QA check (composition only) → Upload
```

### Specific Changes

1. **In the work item loop (around line 257)**, after `generateAdImage()` returns `imageBuffer`, add:

```typescript
// NEW: Composite text, logo, and CTA onto the clean AI background
const composited = await compositeAdCreative({
  backgroundImage: imageBuffer,
  brandContext,
  onScreenText: ost,
  offer: slotCtx.offer || null,
  promptSchema: item.promptSchema ?? DEFAULT_CLEAN_SCHEMA,
  width: dimensions.width,
  height: dimensions.height,
  aspectRatio: config.aspectRatio,
});
imageBuffer = composited.image;
```

2. **The QA check stays** but will fire far fewer retries because text is now always correct by construction. QA still catches wrong-product and composition issues from the AI background.

3. **Add a config flag** to opt into compositor mode per batch (so we can A/B test and roll out gradually):

```typescript
// In AdGenerationConfig type (types.ts):
/** When true, Gemini generates text-free backgrounds and compositor overlays text/logo. */
useCompositor?: boolean;
```

4. **When `useCompositor` is true**, modify the prompt builder to append a "clean canvas" instruction (see next section).

### Prompt Simplification (When Compositor Is Active)

When the compositor handles text, the Gemini prompt should be dramatically shorter. Create a wrapper:

```typescript
// In gemini-static-ad-prompt.ts, add:

/**
 * Stripped-down prompt for compositor mode — Gemini only generates the visual background.
 * No text rendering instructions, no CTA formatting, no logo placement rules.
 */
export function buildCleanCanvasPrompt(config: BuildGeminiStaticAdPromptParams): string {
  // Keep: brand colors, imagery style, emotional tone, composition, product/service description
  // Remove: ALL typography instructions, CTA button rules, "allowed copy" section,
  //         logo placement rules, URL/contact footer warnings, text integrity rules
  // Add: explicit instruction to leave space for text overlay and NOT render any text
}
```

The clean canvas prompt should include this critical instruction:

```
CLEAN CANVAS MODE: Generate ONLY the visual background and product/subject imagery.
Do NOT render ANY text, headlines, buttons, logos, wordmarks, URLs, or typographic elements.
Leave negative space in the composition where text will be overlaid in post-production.
The text zone is approximately [textPosition from schema] — keep that area visually simple
(no busy patterns, no high-contrast edges) so overlaid text remains readable.
```

This is a **massive** prompt simplification. We go from ~3500 tokens to ~800 tokens. The model has less to misinterpret, generates faster, and produces cleaner backgrounds.

---

## Phase 7: Nano Banana Path Integration

### Why This Is Separate

The Nano Banana pipeline (`build-nano-prompt.ts` → `fillNanoBananaTemplate`) uses a different prompt structure than the client template path. It needs its own clean-canvas variant.

### Changes to `build-nano-prompt.ts`

Add a `cleanCanvas` flag:

```typescript
export function buildNanoBananaImagePrompt(params: {
  // ... existing params
  cleanCanvas?: boolean;  // NEW
}): string {
  if (params.cleanCanvas) {
    // Build a simplified prompt that keeps style direction but strips all copy instructions
    // Remove: VERBATIM ON-CANVAS COPY section, CTA rules, headline/subheadline rendering rules
    // Keep: style direction, brand context, product/service, color palette, imagery style
    // Add: "CLEAN CANVAS MODE" instruction (no text, leave negative space)
  }
  // ... existing logic for non-compositor path
}
```

### Template Slot Changes

In `fill-template.ts`, when compositor mode is active, the template should NOT fill the `[HEADLINE]`, `[SUBHEADLINE]`, `[CTA]`, `[OFFER]` slots with actual copy. Instead, replace them with zone hints:

```
Headline: [LEAVE BLANK — text will be composited in post-production]
Subheadline: [LEAVE BLANK — text will be composited]
CTA: [LEAVE BLANK — button will be composited]
Offer: [LEAVE BLANK]
```

This tells the model that text exists in the design but it shouldn't try to render it.

---

## Testing Strategy

### Unit Tests

Create `lib/ad-creatives/compositor/__tests__/`:

1. **`text-renderer.test.ts`** — Verify satori → sharp pipeline produces PNG buffers of expected dimensions. Test with long text (auto-sizing), short text, empty text, special characters.

2. **`cta-renderer.test.ts`** — Verify button rendering with different shapes (pill, rect, rounded). Verify text color contrast calculation.

3. **`layout-engine.test.ts`** — Verify archetype detection from various `AdPromptSchema.layout` strings. Verify zone calculations don't overlap and stay within canvas bounds.

4. **`color-utils.test.ts`** — Verify WCAG contrast ratio against known values. Verify `bestTextColor` returns white for dark backgrounds and black for light ones.

### Integration Test

Create a test that:
1. Generates a solid-color background (600×600 blue square via Sharp)
2. Passes it through `compositeAdCreative()` with test text and mock brand context
3. Verifies the output is a valid PNG of correct dimensions
4. Verifies the output file size is larger than the input (text was added)

This doesn't need Gemini — it tests the compositor in isolation.

### Visual Regression (Manual)

After the compositor is wired into the orchestrator, generate a batch of 10 creatives for a test client with `useCompositor: true` and compare visually against the same batch without compositor. The text should be dramatically crisper and never garbled.

---

## Migration Path (Gradual Rollout)

This is important — **do not make compositor the default immediately**. Roll it out in stages:

### Stage 1: Build and test compositor in isolation
- All files in `lib/ad-creatives/compositor/`
- Unit tests pass
- Can be called standalone with a test image

### Stage 2: Wire into orchestrator behind `useCompositor` flag
- Modify `orchestrate-batch.ts` to check `config.useCompositor`
- When true: use clean canvas prompt + compositor
- When false: existing behavior (unchanged)
- Default: `false`

### Stage 3: Build clean canvas prompt variants
- [x] `buildCleanCanvasPrompt()` in `gemini-static-ad-prompt.ts`
- [x] `cleanCanvas` for `buildNanoBananaImagePrompt()` + multimodal clean strings in `generate-image.ts`
- [x] `blankCopySlots` in `fill-template.ts` (`fillNanoBananaTemplate`)

### Stage 4: Add UI toggle
- [x] Checkbox in **Ad wizard** (`components/ad-creatives/ad-wizard.tsx`) and **Generation form** (`components/ad-creatives/generation-form.tsx`): "Use compositor (beta)"
- [x] `POST /api/clients/[id]/ad-creatives/generate` accepts `useCompositor` and stores it on batch `config`

### Stage 5: Compare and promote
- Run parallel batches with/without compositor
- Compare text quality, visual quality, and cost (fewer retries = lower cost)
- When confident, make compositor the default

---

## What You Must NOT Do

1. **Do NOT rewrite the orchestrator.** Insert the compositor as a step, don't refactor the existing pipeline. The orchestrator works — it just needs one more layer.

2. **Do NOT remove the QA check.** Even with compositor handling text, QA still catches wrong-product imagery, bad composition, and fabricated elements from the AI background. QA retries for TEXT issues will naturally stop firing, but don't delete the retry logic — it's still useful for non-text issues.

3. **Do NOT change the database schema.** The compositor adds no new tables. The `metadata` JSONB field on `ad_creatives` can store compositor-specific info (layout archetype used, fonts, etc.).

4. **Do NOT fetch fonts on every creative.** Use the batch-level font cache. A batch generates 5-40 creatives for the same client with the same fonts. Fetch once, reuse.

5. **Do NOT try to detect text zones in the AI background image.** The layout engine uses the template schema (which we already have before generation) to decide zones. Don't add computer vision complexity to find where text "should" go — we already know from the schema.

6. **Do NOT add new npm dependencies.** Sharp and satori are already installed and sufficient. No need for `canvas`, `fabric`, `jimp`, `html-to-image`, or anything else.

---

## Success Criteria

**Phase 7 (Compositor + Nano integration)** — implemented in codebase as of 2026-03:

- [x] `compositeAdCreative()` takes a clean background + brand context + text → returns a final ad with crisp, pixel-perfect text
- [x] Text is NEVER garbled, misspelled, or clipped (it's rendered by code, not AI)
- [x] CTA is always a properly shaped button with correct text and good contrast
- [x] Logo is always the real brand logo, correctly sized; Gemini does not receive logo multimodal refs when compositor is on (avoids duplicate marks)
- [x] Layout adapts to different template schemas (6 archetypes)
- [x] Font rendering uses the brand's actual Google Fonts
- [x] The Gemini prompt is ~60% shorter when compositor is active (`buildCleanCanvasPrompt`, Nano `cleanCanvas`, `compositor-qa` §8.2 length check)
- [ ] QA text-related retry rate drops to near zero *(product metric — verify in production / batch analytics; not a unit test)*
- [x] All 5 aspect ratios produce correctly proportioned layouts
- [x] `useCompositor` flag allows gradual rollout without breaking existing behavior
- [x] Unit tests cover text rendering, CTA rendering, layout engine, and color utils (`lib/ad-creatives/compositor/__tests__/compositor-qa.test.ts`, `color-utils.test.ts`)
- [x] No new npm dependencies added
- [x] Typecheck/lint passes

---

## File Checklist

| File | Status | Purpose |
|------|--------|---------|
| `lib/ad-creatives/compositor/index.ts` | DONE | Main `compositeAdCreative()` entry point |
| `lib/ad-creatives/compositor/text-renderer.ts` | DONE | Satori + Sharp text → PNG |
| `lib/ad-creatives/compositor/cta-renderer.ts` | DONE | CTA button → PNG |
| `lib/ad-creatives/compositor/logo-renderer.ts` | DONE | Logo fetch + resize → PNG |
| `lib/ad-creatives/compositor/layout-engine.ts` | DONE | Schema → zone positions |
| `lib/ad-creatives/compositor/color-utils.ts` | DONE | Contrast ratio, text color selection |
| `lib/ad-creatives/compositor/types.ts` | DONE | Compositor-specific types |
| `lib/ad-creatives/compositor/__tests__/compositor-qa.test.ts` | DONE | Consolidated QA suite (PRD listed split files; coverage lives here + `color-utils.test.ts`) |
| `lib/ad-creatives/compositor/__tests__/color-utils.test.ts` | DONE | WCAG / contrast unit tests |
| `lib/ad-creatives/orchestrate-batch.ts` | DONE | Compositor step, clean prompts, `cleanCanvas` for `generateAdImage`, omit logo multimodal when compositor |
| `lib/ad-creatives/gemini-static-ad-prompt.ts` | DONE | `buildCleanCanvasPrompt()`, clean multimodal instruction exports |
| `lib/ad-creatives/generate-image.ts` | DONE | `cleanCanvas` → wireframe + layout ref multimodal strings |
| `lib/ad-creatives/assemble-prompt.ts` | DONE | Re-exports `buildCleanCanvasPrompt` |
| `lib/ad-creatives/nano-banana/build-nano-prompt.ts` | DONE | `cleanCanvas` param |
| `lib/ad-creatives/nano-banana/fill-template.ts` | DONE | `blankCopySlots` for compositor mode |
| `lib/ad-creatives/types.ts` | DONE | `useCompositor` on `AdGenerationConfig` |

---

## Phase 8: Creative Intelligence Loop — How the System Learns What "Good" Looks Like

> **Status:** Not implemented in this repository as of 2026-03. The compositor pipeline (Phases 1–7) is complete; the intelligence loop below remains future work.

### The Problem

Right now, every batch starts from zero. The system has no memory of which ads worked and which didn't. A human generates 20 creatives, favorites 3, deletes 12, and downloads 5. That signal — what got kept, what got trashed — is lost. The next batch makes the same kinds of mistakes.

This is the difference between a tool and a system. A tool generates ads. A system generates ads, learns which ones are good, and generates better ads next time. That's what we're building.

### What "Good" Means — The Signal Hierarchy

There are multiple quality signals available to us, and they're not all equal. Understanding the hierarchy matters because it determines what the system optimizes for.

**Tier 1: Explicit Human Judgment (Strongest Signal)**
- **Favorited creatives** (`is_favorite = true` in `ad_creatives` table) — The admin looked at this and said "yes, this is good"
- **Downloaded creatives** — Strong enough to use in a real campaign
- **Deleted creatives** — Explicit rejection signal. Something was wrong.

**Tier 2: QA Scores (Automated Quality)**
- **QA passed on first attempt** — The AI generated a clean image without retries. This correlates with good composition.
- **QA score** (`metadata.qa_score`) — Higher scores mean fewer issues detected
- **QA issues by type** — Tells us WHAT went wrong (text garble vs wrong product vs duplicate logo)

**Tier 3: Behavioral Signals (Implicit)**
- **Time spent viewing** (future — not implemented yet, don't build this now)
- **"Generate more like this"** actions (if a user regenerates from a specific creative's prompt, that creative was a reference point)

**Tier 4: Platform Performance (External — Future)**
- CTR, ROAS, CPA from Meta/Google Ads — The ultimate signal, but requires ad platform integration we don't have yet. Design the schema to accept this data later, but don't build the integration now.

### Architecture: The Learning Loop

```
┌─────────────────────────────────────────────────────────────┐
│                    GENERATION CYCLE                          │
│                                                              │
│  ┌──────────┐    ┌──────────┐    ┌───────────┐              │
│  │ Style    │───>│ Generate │───>│ Composite │───> Gallery   │
│  │ Memory   │    │ (Gemini) │    │ (Sharp)   │              │
│  └──────────┘    └──────────┘    └───────────┘              │
│       ▲                                  │                   │
│       │                                  ▼                   │
│  ┌──────────┐    ┌──────────┐    ┌───────────┐              │
│  │ Pattern  │<───│ Analyze  │<───│ Feedback  │<── Human     │
│  │ Extractor│    │ Winners  │    │ Collector │    Actions    │
│  └──────────┘    └──────────┘    └───────────┘              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

The loop has 4 stages:
1. **Collect** — Capture every human signal (favorite, delete, download)
2. **Analyze** — Extract patterns from winners vs losers
3. **Synthesize** — Compress patterns into a reusable "style memory" per client
4. **Apply** — Inject style memory into the next generation's prompt

This loop runs automatically. No human has to click "learn from this." The system watches what gets favorited and what gets deleted, and adjusts.

---

### Stage 8.1: Feedback Collector (`lib/ad-creatives/intelligence/feedback-collector.ts`)

#### What It Does

Listens for signal events (favorite toggled, creative deleted, creative downloaded) and records them in a structured format for analysis.

#### Why It's Separate from the Existing Favorite/Delete Logic

The existing `PATCH /api/clients/[id]/ad-creatives/[creativeId]` endpoint toggles `is_favorite`. The existing `DELETE` endpoint removes a creative. Those work fine for their purpose. But they don't capture the CONTEXT of the decision — what template was used, what the QA score was, what copy was on the ad, what the brand colors were. The feedback collector enriches the signal with context before storing it.

#### Database: `ad_creative_feedback` Table

```sql
CREATE TABLE ad_creative_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  creative_id UUID REFERENCES ad_creatives(id) ON DELETE SET NULL,
  batch_id UUID REFERENCES ad_generation_batches(id) ON DELETE SET NULL,
  
  -- The signal
  signal_type TEXT NOT NULL,  -- 'favorite' | 'unfavorite' | 'delete' | 'download' | 'regenerate_from'
  
  -- Snapshot of the creative at signal time (survives deletion)
  creative_snapshot JSONB NOT NULL,
  -- Contains: { template_source, template_key, aspect_ratio, on_screen_text,
  --             product_service, offer, qa_passed, qa_score, qa_issues,
  --             prompt_used (truncated to 2000 chars), metadata }
  
  -- Enrichment from Brand DNA at signal time
  brand_snapshot JSONB,
  -- Contains: { colors (hex array), fonts, industry, advertising_type, image_prompt_modifier }
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_creative_feedback_client ON ad_creative_feedback(client_id);
CREATE INDEX idx_creative_feedback_signal ON ad_creative_feedback(signal_type);
CREATE INDEX idx_creative_feedback_created ON ad_creative_feedback(created_at DESC);
```

#### Why We Snapshot Instead of Just Referencing

When a creative is deleted, the `ad_creatives` row is gone. But the deletion IS a signal — we need to remember what was deleted and why it was bad. The snapshot preserves the creative's attributes even after the row is removed. This is critical for the analysis stage.

#### Recording Logic

Hook into the existing API routes. When a creative is favorited, deleted, or downloaded, call:

```typescript
export async function recordCreativeFeedback(params: {
  clientId: string;
  creativeId: string;
  signalType: 'favorite' | 'unfavorite' | 'delete' | 'download' | 'regenerate_from';
}): Promise<void> {
  const admin = createAdminClient();
  
  // Fetch the creative (may be about to be deleted — fetch BEFORE deletion)
  const { data: creative } = await admin
    .from('ad_creatives')
    .select('*')
    .eq('id', params.creativeId)
    .maybeSingle();
  
  if (!creative) return; // Already gone, can't snapshot
  
  const snapshot = {
    template_source: creative.template_source,
    template_key: creative.template_id,
    aspect_ratio: creative.aspect_ratio,
    on_screen_text: creative.on_screen_text,
    product_service: creative.product_service,
    offer: creative.offer,
    qa_passed: creative.metadata?.qa_passed,
    qa_score: creative.metadata?.qa_score,
    qa_issues: creative.metadata?.qa_issues,
    prompt_used: typeof creative.prompt_used === 'string' 
      ? creative.prompt_used.substring(0, 2000) 
      : null,
    global_slug: creative.metadata?.global_slug ?? null,
    image_pipeline: creative.metadata?.image_pipeline ?? null,
  };
  
  await admin.from('ad_creative_feedback').insert({
    client_id: params.clientId,
    creative_id: params.creativeId,
    batch_id: creative.batch_id,
    signal_type: params.signalType,
    creative_snapshot: snapshot,
  });
}
```

#### Where to Hook This In

1. **`PATCH /api/clients/[id]/ad-creatives/[creativeId]`** (favorite toggle) — call `recordCreativeFeedback` with `'favorite'` or `'unfavorite'`
2. **`DELETE /api/clients/[id]/ad-creatives/[creativeId]`** — call `recordCreativeFeedback` with `'delete'` BEFORE the actual deletion
3. **`POST /api/clients/[id]/ad-creatives/bulk-download`** — call for each creative ID with `'download'`

---

### Stage 8.2: Winner Analyzer (`lib/ad-creatives/intelligence/winner-analyzer.ts`)

#### What It Does

Given a client's feedback history, identifies statistical patterns in what makes their "winners" (favorited/downloaded) different from their "losers" (deleted/ignored).

#### How It Works

This is NOT machine learning. It's structured pattern extraction using an LLM. Here's why:

We don't have enough data per client for statistical ML (a client might have 50-200 creatives total). But we CAN use an LLM to read the winner vs loser snapshots and extract patterns like a human creative director would. This is essentially "show a smart analyst 10 winning ads and 10 losing ads and ask: what's different?"

```typescript
export interface WinnerAnalysis {
  clientId: string;
  analyzedAt: string;
  sampleSize: { winners: number; losers: number; total: number };
  
  // Extracted patterns
  patterns: {
    /** Which Nano Banana styles consistently win? */
    preferredStyles: string[];      // e.g. ['headline', 'soft-gradient-product', 'testimonial-card']
    /** Which styles consistently lose? */
    avoidStyles: string[];          // e.g. ['faux-iphone-notes', 'ugly-ad', 'browser-chrome-lite']
    /** Color patterns in winners */
    colorInsights: string;          // e.g. "Winners use dark backgrounds with bright accent CTAs"
    /** Composition patterns */
    compositionInsights: string;    // e.g. "Product-forward layouts outperform abstract/editorial"
    /** Copy patterns */
    copyInsights: string;           // e.g. "Short headlines (3-4 words) with specific numbers win"
    /** What to avoid based on deletions */
    avoidPatterns: string;          // e.g. "Avoid busy backgrounds, multiple visual elements"
    /** Overall style direction for next batch */
    styleDirectionSummary: string;  // 2-3 sentence summary usable as prompt injection
  };
  
  /** Confidence: 'low' (<10 signals), 'medium' (10-30), 'high' (30+) */
  confidence: 'low' | 'medium' | 'high';
}
```

#### The Analysis Function

```typescript
export async function analyzeClientWinners(clientId: string): Promise<WinnerAnalysis> {
  const admin = createAdminClient();
  
  // Fetch all feedback for this client, ordered by recency
  const { data: feedback } = await admin
    .from('ad_creative_feedback')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(200);  // Last 200 signals max
  
  if (!feedback || feedback.length < 5) {
    // Not enough data to analyze — return empty patterns
    return buildEmptyAnalysis(clientId, feedback?.length ?? 0);
  }
  
  // Separate winners and losers
  const winners = feedback.filter(f => f.signal_type === 'favorite' || f.signal_type === 'download');
  const losers = feedback.filter(f => f.signal_type === 'delete');
  const ignored = // creatives that were neither favorited nor deleted (neutral)
  
  // Build analysis prompt for LLM
  const analysisPrompt = buildAnalysisPrompt(winners, losers, clientId);
  
  // Call Claude (not Gemini — this is analytical text work, not image generation)
  const result = await createCompletion({
    messages: [
      { role: 'system', content: WINNER_ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: analysisPrompt },
    ],
    maxTokens: 1500,
    feature: 'creative_intelligence',
  });
  
  // Parse structured response
  return parseAnalysisResponse(result.text, clientId, winners.length, losers.length, feedback.length);
}
```

#### The Analysis Prompt

This is the most important part. The prompt must be specific about what patterns to look for:

```typescript
const WINNER_ANALYSIS_SYSTEM_PROMPT = `You are a performance creative analyst for a social media advertising agency. You analyze patterns in ad creative performance to improve future generation.

You will receive:
- WINNERS: Ads favorited or downloaded by the creative director (human approved)
- LOSERS: Ads deleted by the creative director (human rejected)
- BATCH METRICS: The 5 performance dimensions across recent batches:
  D1 (Usability Rate), D2 (First-Pass QA Rate), D3 (Style Consistency),
  D4 (Generation Efficiency), D5 (Learning Velocity — trend direction)

Your job is to find ACTIONABLE patterns — not generic advice. Don't say "use eye-catching visuals." Say "winners used product-forward compositions with the product occupying 60%+ of the frame, while losers used abstract editorial layouts."

Use the batch metrics to calibrate your recommendations:
- If D1 is stalled (velocity near zero), recommend BROADENING the style palette — the system may be overfitting
- If D2 is low, identify which template styles consistently fail QA and recommend avoiding them
- If D3 is low, recommend narrowing to fewer template styles for consistency
- If D4 is degrading, check if avoid_styles is too aggressive (cutting viable options)
- If D5 is negative, the previous style direction may have been wrong — recommend a reset or rollback

Output valid JSON with this exact schema:
{
  "preferredStyles": ["slug1", "slug2"],     // Nano Banana template slugs that appear in winners
  "avoidStyles": ["slug3", "slug4"],          // Slugs that appear in losers
  "colorInsights": "specific observation",     // What color patterns distinguish winners
  "compositionInsights": "specific observation", // Layout/composition patterns
  "copyInsights": "specific observation",      // What copy patterns work (length, tone, numbers)
  "avoidPatterns": "specific observation",     // Common traits of deleted ads
  "styleDirectionSummary": "2-3 sentences",   // Reusable direction for injection into image prompts
  "metricDiagnosis": "1-2 sentences",         // What the D1-D5 trends suggest about system health
  "explorationRecommendation": "1 sentence"   // Should next batch explore new styles or exploit known winners?
}

Be SPECIFIC. Reference actual template names, actual color choices, actual copy structures. The "styleDirectionSummary" will be injected directly into an image generation prompt, so write it as a concise creative brief, not as analysis. The "metricDiagnosis" helps the admin understand whether the system is improving or stagnating.`;
```

#### Why LLM Analysis Instead of Pure Statistics

With 50 creatives, you can't run a regression. But you CAN show an LLM:
- "Here are 8 favorited ads. They used templates: headline (3x), soft-gradient (2x), testimonial (2x), stat-hero (1x). Colors were all dark backgrounds. Copy had numbers in 6/8 headlines."
- "Here are 15 deleted ads. They used templates: faux-iphone-notes (4x), browser-chrome-lite (3x), ugly-ad (2x)..."

The LLM sees the same patterns a human creative director would, but faster and without forgetting.

#### When to Run Analysis

Analysis doesn't need to run on every signal. It should run:

1. **After a batch review is "complete"** — when the admin has gone through a batch and favorited/deleted most of it. Detect this: if >60% of a batch's creatives have been either favorited or deleted, trigger analysis.
2. **Before a new batch starts** — check if analysis exists and is recent (<7 days). If stale or missing, run fresh analysis.
3. **Never during generation** — analysis is a background task, not in the hot path.

```typescript
export async function ensureFreshAnalysis(clientId: string): Promise<WinnerAnalysis | null> {
  const admin = createAdminClient();
  
  // Check for recent analysis
  const { data: existing } = await admin
    .from('ad_style_memory')
    .select('*')
    .eq('client_id', clientId)
    .order('analyzed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (existing) {
    const age = Date.now() - new Date(existing.analyzed_at).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (age < sevenDays) return existing.analysis as WinnerAnalysis;
  }
  
  // Check if we have enough new feedback to justify re-analysis
  const { count } = await admin
    .from('ad_creative_feedback')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId);
  
  if ((count ?? 0) < 5) return null; // Not enough data
  
  return analyzeClientWinners(clientId);
}
```

---

### Stage 8.3: Style Memory (`lib/ad-creatives/intelligence/style-memory.ts`)

#### What It Does

Persists the analysis results and makes them queryable. This is the system's "memory" of what works for each client.

#### Database: `ad_style_memory` Table

```sql
CREATE TABLE ad_style_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sample_size JSONB NOT NULL,        -- { winners, losers, total }
  patterns JSONB NOT NULL,           -- The WinnerAnalysis.patterns object
  confidence TEXT NOT NULL,          -- 'low' | 'medium' | 'high'
  style_direction TEXT NOT NULL,     -- The compiled styleDirectionSummary (ready for prompt injection)
  preferred_slugs TEXT[] DEFAULT '{}',  -- Denormalized for fast query
  avoid_slugs TEXT[] DEFAULT '{}',      -- Denormalized for fast query
  
  -- Versioning: each analysis is a new row, preserving history
  version INT NOT NULL DEFAULT 1,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_style_memory_client ON ad_style_memory(client_id, analyzed_at DESC);
```

#### Why Version History

The system's taste evolves as more data comes in. Early analysis (5 signals, low confidence) might say "prefers headline layouts." After 50 signals, it might refine to "prefers headline layouts with product hero and warm lighting, specifically not abstract/editorial." Keeping versions lets us track how the model of the client's preferences develops. It also lets us rollback if a bad analysis corrupts the style direction.

#### Store and Retrieve

```typescript
export async function storeStyleMemory(analysis: WinnerAnalysis): Promise<void> {
  const admin = createAdminClient();
  
  // Get current version number
  const { data: latest } = await admin
    .from('ad_style_memory')
    .select('version')
    .eq('client_id', analysis.clientId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  const nextVersion = (latest?.version ?? 0) + 1;
  
  await admin.from('ad_style_memory').insert({
    client_id: analysis.clientId,
    analyzed_at: analysis.analyzedAt,
    sample_size: analysis.sampleSize,
    patterns: analysis.patterns,
    confidence: analysis.confidence,
    style_direction: analysis.patterns.styleDirectionSummary,
    preferred_slugs: analysis.patterns.preferredStyles,
    avoid_slugs: analysis.patterns.avoidStyles,
    version: nextVersion,
  });
}

/** Get the most recent style memory for a client. Returns null if none exists. */
export async function getLatestStyleMemory(clientId: string): Promise<{
  styleDirection: string;
  preferredSlugs: string[];
  avoidSlugs: string[];
  confidence: string;
  patterns: WinnerAnalysis['patterns'];
  version: number;
} | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('ad_style_memory')
    .select('*')
    .eq('client_id', clientId)
    .order('analyzed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (!data) return null;
  
  return {
    styleDirection: data.style_direction,
    preferredSlugs: data.preferred_slugs ?? [],
    avoidSlugs: data.avoid_slugs ?? [],
    confidence: data.confidence,
    patterns: data.patterns as WinnerAnalysis['patterns'],
    version: data.version,
  };
}
```

---

### Stage 8.4: Prompt Injection — Closing the Loop (`lib/ad-creatives/intelligence/apply-intelligence.ts`)

#### What It Does

This is where the loop closes. Before generating a batch, the system checks for style memory and injects it into the generation process at three levels:

#### Level 1: Template Selection Bias

When the admin opens the wizard to select Nano Banana templates, the UI should surface style memory:

```typescript
/** Annotate the Nano Banana catalog with intelligence signals */
export function annotateNanoCatalogWithIntelligence(
  catalog: NanoBananaCatalogEntry[],
  memory: { preferredSlugs: string[]; avoidSlugs: string[] } | null,
): (NanoBananaCatalogEntry & { intelligence?: 'preferred' | 'avoid' })[] {
  if (!memory) return catalog.map(e => ({ ...e }));
  
  return catalog.map(entry => ({
    ...entry,
    intelligence: memory.preferredSlugs.includes(entry.slug)
      ? 'preferred'
      : memory.avoidSlugs.includes(entry.slug)
        ? 'avoid'
        : undefined,
  }));
}
```

In the UI (`nano-banana-template-grid.tsx`), show a small badge:
- Green star on preferred templates: "Performs well for this client"
- Yellow warning on avoid templates: "Historically underperforms"

The admin can still select avoided templates — this is a nudge, not a block. Sometimes you want to retry an avoided style with different copy.

#### Level 2: Style Direction Injection

This is the most impactful integration. The `styleDirectionSummary` from style memory gets prepended to every image generation prompt.

In `orchestrate-batch.ts`, before the work item loop:

```typescript
// NEW: Load style intelligence for this client
const styleMemory = await getLatestStyleMemory(typedBatch.client_id);
const intelligenceStyleDirection = styleMemory?.styleDirection ?? '';
```

Then in the prompt builder, prepend it:

```typescript
const styleDirection = [
  intelligenceStyleDirection,  // NEW: learned style preferences
  catalogNanoStyle,
  item.styleDirection,
  qaRetryStyleSuffix,
].filter(Boolean).join('\n\n');
```

This means every creative in the batch benefits from the accumulated learning about what works for this client. The style direction might say something like:

> "Product-forward compositions with the product occupying 60-70% of the visual area perform best. Use dark, muted backgrounds (navy, charcoal, deep forest) with a single bright accent on the CTA. Avoid editorial/magazine layouts, abstract shapes without product context, and faux UI styles. Headlines with specific numbers or percentages get favorited 3x more than generic benefit statements."

That's injected directly into the Gemini prompt alongside the existing style direction from the template.

#### Level 3: Auto-Generation Defaults

When a client has strong style memory (high confidence, 30+ signals), the system can pre-select optimal templates for a new batch:

```typescript
/** Build a suggested template selection from style memory */
export function suggestTemplateSelection(
  memory: { preferredSlugs: string[]; avoidSlugs: string[]; confidence: string },
  catalog: NanoBananaCatalogEntry[],
  targetCount: number,
): { slug: string; count: number }[] {
  if (memory.confidence === 'low') return []; // Not enough data to suggest
  
  const preferred = memory.preferredSlugs.filter(s => catalog.some(c => c.slug === s));
  
  if (preferred.length === 0) return [];
  
  // Distribute target count across preferred styles
  const countPer = Math.max(1, Math.floor(targetCount / preferred.length));
  const remainder = targetCount - (countPer * preferred.length);
  
  return preferred.map((slug, i) => ({
    slug,
    count: countPer + (i === 0 ? remainder : 0),
  }));
}
```

In the wizard UI, when style memory exists, show a "Use recommended styles" button that auto-fills the template selection. The admin can modify it, but the defaults are informed by data.

---

### Stage 8.5: The Recursive Improvement Cycle

#### How It Gets Smarter Over Time

This is the key insight: each cycle of the loop produces BETTER training data for the next cycle.

**Cycle 1** (First 2-3 batches, ~30 creatives):
- Style memory: LOW confidence
- Effect: Minimal — maybe identifies 1-2 preferred styles
- Value: Starts recording feedback

**Cycle 2** (Batches 4-6, ~60-100 creatives):
- Style memory: MEDIUM confidence
- Effect: Avoids worst templates, injects basic style direction
- Value: Fewer obviously bad outputs → higher favorite rate → better signal

**Cycle 3** (Batches 7+, 100+ creatives):
- Style memory: HIGH confidence
- Effect: Strong template recommendations, specific style direction, auto-defaults
- Value: The system "knows" this client's aesthetic and generates on-brand by default

**The compounding effect:** Because the system avoids known-bad styles and emphasizes known-good ones, the NEXT batch has a higher hit rate. That means more favorites and fewer deletions, which gives cleaner training signal, which makes the NEXT analysis more precise. It's a flywheel.

#### Re-Analysis Triggers

The system should re-analyze (update style memory) when:

1. **Significant new feedback** — 10+ new signals since last analysis
2. **Time-based staleness** — analysis older than 7 days
3. **Before any batch with `useIntelligence: true`** — always check freshness
4. **Manual trigger** — admin clicks "Refresh style analysis" in UI

```typescript
export async function shouldReanalyze(clientId: string): Promise<boolean> {
  const admin = createAdminClient();
  
  const { data: memory } = await admin
    .from('ad_style_memory')
    .select('analyzed_at, sample_size')
    .eq('client_id', clientId)
    .order('analyzed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (!memory) return true; // Never analyzed
  
  const age = Date.now() - new Date(memory.analyzed_at).getTime();
  if (age > 7 * 24 * 60 * 60 * 1000) return true; // Stale
  
  // Count feedback since last analysis
  const { count } = await admin
    .from('ad_creative_feedback')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gt('created_at', memory.analyzed_at);
  
  return (count ?? 0) >= 10; // Enough new signal
}
```

---

### Stage 8.6: Reference Ad Import — Teaching the System What "Great" Looks Like

#### The Cold Start Problem

A brand-new client has zero feedback. The loop can't learn from nothing. But the admin KNOWS what good ads look like for this client — they've seen competitors, they have reference ads, they have a moodboard.

#### Solution: Allow Importing "Reference Winners"

Add the ability to upload external ads (screenshots of competitor ads, high-performing ads from other platforms, inspiration images) and tag them as synthetic "winners." These seed the style memory before a single creative is generated.

```typescript
export async function importReferenceWinners(params: {
  clientId: string;
  imageUrls: string[];
}): Promise<void> {
  const admin = createAdminClient();
  
  for (const url of params.imageUrls) {
    // Use Gemini Vision to extract the ad's style attributes (same as extract-prompt.ts)
    const schema = await extractAdPrompt(url);
    
    // Record as synthetic feedback
    await admin.from('ad_creative_feedback').insert({
      client_id: params.clientId,
      creative_id: null, // No internal creative — external reference
      batch_id: null,
      signal_type: 'favorite', // Treated as a winner
      creative_snapshot: {
        template_source: 'reference_import',
        prompt_schema: schema,
        reference_image_url: url,
        is_synthetic: true, // Flag so analysis can weight differently if needed
      },
    });
  }
}
```

This means the system can have style memory from day one. Upload 5-10 reference ads that represent the target quality → run analysis → first batch is already informed.

#### Integration with Existing Template Upload

The existing "Upload winning ads" flow (`components/ad-creatives/bulk-template-import.tsx`) already extracts JSON prompt schemas from uploaded ads. Extend it to also record feedback:

When an admin uploads a winning ad as a template, automatically call `recordCreativeFeedback` with `signal_type: 'favorite'` and a snapshot built from the extracted schema. This means every template the admin adds to the library is ALSO a training signal for the intelligence loop.

---

### What You Must NOT Do (Intelligence Loop Edition)

1. **Do NOT build real-time learning.** Analysis runs between batches, not during. Don't slow down generation with intelligence lookups beyond one `getLatestStyleMemory()` call at batch start.

2. **Do NOT make intelligence mandatory.** Every intelligence feature is opt-in or additive. The system works fine without style memory — it just doesn't improve over time. This means a bug in the intelligence loop never blocks ad generation.

3. **Do NOT weight synthetic feedback the same as real feedback.** Imported reference winners are useful for cold start, but real human favorites from actual generated ads are stronger signal. The analysis prompt should mention when signals are synthetic so the LLM can weight accordingly.

4. **Do NOT store full prompts in feedback.** Truncate to 2000 chars. Prompts are 3000-4000 tokens each, and storing 200 full prompts per client would bloat the table unnecessarily. The schema attributes are what matter, not the raw prompt text.

5. **Do NOT run analysis synchronously in the API request path.** Analysis calls an LLM and may take 10-30 seconds. Run it as a background task (same pattern as batch generation — use `after()` or a queued job).

6. **Do NOT auto-exclude avoided templates.** Show warnings, not blocks. The admin makes the final call. Creative taste evolves, and a style that failed with one product might work with another.

---

### Intelligence Loop — Database Migration

One migration file creates both tables:

```sql
-- ad_creative_feedback: records human signals on generated ads
CREATE TABLE IF NOT EXISTS ad_creative_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  creative_id UUID REFERENCES ad_creatives(id) ON DELETE SET NULL,
  batch_id UUID REFERENCES ad_generation_batches(id) ON DELETE SET NULL,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('favorite', 'unfavorite', 'delete', 'download', 'regenerate_from')),
  creative_snapshot JSONB NOT NULL DEFAULT '{}',
  brand_snapshot JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_creative_feedback_client ON ad_creative_feedback(client_id);
CREATE INDEX idx_creative_feedback_signal ON ad_creative_feedback(signal_type);
CREATE INDEX idx_creative_feedback_created ON ad_creative_feedback(created_at DESC);

-- ad_style_memory: versioned per-client style intelligence
CREATE TABLE IF NOT EXISTS ad_style_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sample_size JSONB NOT NULL DEFAULT '{}',
  patterns JSONB NOT NULL DEFAULT '{}',
  confidence TEXT NOT NULL DEFAULT 'low' CHECK (confidence IN ('low', 'medium', 'high')),
  style_direction TEXT NOT NULL DEFAULT '',
  preferred_slugs TEXT[] DEFAULT '{}',
  avoid_slugs TEXT[] DEFAULT '{}',
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_style_memory_client ON ad_style_memory(client_id, analyzed_at DESC);

-- RLS
ALTER TABLE ad_creative_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_style_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on feedback" ON ad_creative_feedback
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Admins full access on style memory" ON ad_style_memory
  FOR ALL USING (true) WITH CHECK (true);
```

---

### Intelligence Loop — File Checklist

| File | Status | Purpose |
|------|--------|---------|
| `lib/ad-creatives/intelligence/feedback-collector.ts` | NEW | Record human signals with creative snapshots |
| `lib/ad-creatives/intelligence/winner-analyzer.ts` | NEW | LLM-powered pattern extraction from winners vs losers |
| `lib/ad-creatives/intelligence/style-memory.ts` | NEW | Store/retrieve versioned style intelligence per client |
| `lib/ad-creatives/intelligence/apply-intelligence.ts` | NEW | Inject intelligence into prompts, annotate catalog, suggest templates |
| `lib/ad-creatives/intelligence/types.ts` | NEW | Intelligence-specific types |
| `supabase/migrations/XXX_ad_creative_intelligence.sql` | NEW | Tables: `ad_creative_feedback`, `ad_style_memory` |
| `app/api/clients/[id]/ad-creatives/[creativeId]/route.ts` | MODIFY | Hook feedback collector into PATCH (favorite) and DELETE |
| `app/api/clients/[id]/ad-creatives/bulk-download/route.ts` | MODIFY | Hook feedback collector into download |
| `app/api/clients/[id]/ad-creatives/intelligence/route.ts` | NEW | GET (latest analysis), POST (trigger re-analysis) |
| `lib/ad-creatives/orchestrate-batch.ts` | MODIFY | Load style memory, inject into prompt style direction |
| `components/ad-creatives/nano-banana-template-grid.tsx` | MODIFY | Show preferred/avoid badges from intelligence |
| `components/ad-creatives/ad-wizard.tsx` | MODIFY | "Use recommended styles" button when memory exists |

### Intelligence Loop — Success Criteria

- [ ] Every favorite, delete, and download is recorded with full creative snapshot *(Phase 8 — pending)*
- [ ] Analysis extracts actionable patterns from 5+ signals (preferred styles, avoid styles, color/composition/copy insights)
- [ ] Style memory persists across sessions with version history
- [ ] Style direction is injected into generation prompts automatically when available
- [ ] Nano Banana template grid shows preferred/avoid badges
- [ ] Wizard offers "Use recommended" auto-selection from style memory
- [ ] Reference ad imports seed style memory for cold-start clients
- [ ] Re-analysis triggers automatically on staleness or sufficient new feedback
- [ ] Analysis runs in background, never blocking generation
- [ ] All intelligence features degrade gracefully (no data = no intelligence, system works normally)
- [ ] No new npm dependencies
- [ ] Typecheck/lint passes
