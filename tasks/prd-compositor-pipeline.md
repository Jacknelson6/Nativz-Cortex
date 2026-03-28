# PRD: Sharp Compositor Pipeline — The Missing Layer That Makes Ad Generation Reliable

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
- `buildCleanCanvasPrompt()` in `gemini-static-ad-prompt.ts`
- Clean canvas mode for `buildNanoBananaImagePrompt()`
- Template slot blanking in `fill-template.ts`

### Stage 4: Add UI toggle
- Checkbox or switch in the ad wizard: "Use compositor (beta)"
- Passes `useCompositor: true` to the generation config

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

When this PRD is fully implemented:

- [ ] `compositeAdCreative()` takes a clean background + brand context + text → returns a final ad with crisp, pixel-perfect text
- [ ] Text is NEVER garbled, misspelled, or clipped (it's rendered by code, not AI)
- [ ] CTA is always a properly shaped button with correct text and good contrast
- [ ] Logo is always the real brand logo, correctly sized, never duplicated
- [ ] Layout adapts to different template schemas (6 archetypes)
- [ ] Font rendering uses the brand's actual Google Fonts
- [ ] The Gemini prompt is ~60% shorter when compositor is active
- [ ] QA text-related retry rate drops to near zero
- [ ] All 5 aspect ratios produce correctly proportioned layouts
- [ ] `useCompositor` flag allows gradual rollout without breaking existing behavior
- [ ] Unit tests cover text rendering, CTA rendering, layout engine, and color utils
- [ ] No new npm dependencies added
- [ ] Typecheck/lint passes

---

## File Checklist

| File | Status | Purpose |
|------|--------|---------|
| `lib/ad-creatives/compositor/index.ts` | NEW | Main `compositeAdCreative()` entry point |
| `lib/ad-creatives/compositor/text-renderer.ts` | NEW | Satori + Sharp text → PNG |
| `lib/ad-creatives/compositor/cta-renderer.ts` | NEW | CTA button → PNG |
| `lib/ad-creatives/compositor/logo-renderer.ts` | NEW | Logo fetch + resize → PNG |
| `lib/ad-creatives/compositor/layout-engine.ts` | NEW | Schema → zone positions |
| `lib/ad-creatives/compositor/color-utils.ts` | NEW | Contrast ratio, text color selection |
| `lib/ad-creatives/compositor/types.ts` | NEW | Compositor-specific types |
| `lib/ad-creatives/compositor/__tests__/text-renderer.test.ts` | NEW | Unit tests |
| `lib/ad-creatives/compositor/__tests__/cta-renderer.test.ts` | NEW | Unit tests |
| `lib/ad-creatives/compositor/__tests__/layout-engine.test.ts` | NEW | Unit tests |
| `lib/ad-creatives/compositor/__tests__/color-utils.test.ts` | NEW | Unit tests |
| `lib/ad-creatives/orchestrate-batch.ts` | MODIFY | Insert compositor step behind flag |
| `lib/ad-creatives/gemini-static-ad-prompt.ts` | MODIFY | Add `buildCleanCanvasPrompt()` |
| `lib/ad-creatives/nano-banana/build-nano-prompt.ts` | MODIFY | Add `cleanCanvas` param |
| `lib/ad-creatives/nano-banana/fill-template.ts` | MODIFY | Blank slots in compositor mode |
| `lib/ad-creatives/types.ts` | MODIFY | Add `useCompositor` to `AdGenerationConfig` |
