# PRD: Ad Post-Processing Pipeline

## Problem

Gemini image generation produces great visual compositions (product imagery, backgrounds, layouts) but cannot guarantee:
1. **Exact brand fonts** — renders generic approximations instead of the real typeface
2. **Pixel-perfect logos** — generates text-based approximations instead of the actual logo asset
3. **Text accuracy** — occasionally garbles, adds, or rearranges words

## Solution

Split ad generation into two phases:

1. **Phase 1 (Gemini)**: Generate the base visual — product imagery, backgrounds, composition, color scheme. Prompt Gemini to leave clean space for text overlay areas rather than rendering text directly.

2. **Phase 2 (Post-processing)**: Composite exact brand assets onto the base image:
   - Brand logo (rasterized from SVG/PNG in Brand DNA)
   - Headline text in the actual brand display font
   - Subheadline text in the actual brand body font
   - CTA button with brand-accurate styling
   - Offer text badge

## Tech Stack

- **`satori`** — Converts HTML/CSS to SVG with custom font support (same engine as Next.js OG images). Renders the text overlay layer with exact fonts.
- **`sharp`** — Composites the text overlay SVG onto the base Gemini image. Also handles logo placement and final PNG output.
- **`@resvg/resvg-js`** — Converts satori's SVG output to PNG for sharp compositing.

## Architecture

```
Gemini Image Gen → base_image.png (product visuals, no text)
                         ↓
Brand DNA → { logo_url, fonts[], colors[], headline, subheadline, cta, offer }
                         ↓
Satori → text_overlay.svg (headline + sub + CTA + offer in real fonts)
                         ↓
resvg → text_overlay.png (rasterized with transparency)
                         ↓
Sharp composite: base_image + text_overlay + logo → final_ad.png
```

## Implementation

### 1. Update Gemini prompt to skip text rendering

Modify `assemble-prompt.ts` to tell Gemini:
- Generate the visual composition WITHOUT any text
- Leave clean space in the text areas (top, center, bottom per layout)
- Focus on product imagery, background, color scheme, composition
- Do not render any words, letters, logos, or UI elements

### 2. Build text overlay renderer (`lib/ad-creatives/render-text-overlay.ts`)

Function `renderTextOverlay(config)` that:
- Takes: width, height, headline, subheadline, cta, offer, brand colors, font files, layout position
- Uses satori to render an HTML/CSS layout as SVG with:
  - Headline in brand display font
  - Subheadline in brand body font
  - CTA button with brand accent color
  - Offer badge if provided
  - All positioned according to the template's layout schema (top/center/bottom)
- Returns a PNG buffer (via resvg)

Font loading:
- Download font files from Google Fonts API or brand-provided URLs
- Cache fonts in memory for the duration of the batch
- Fallback to Inter/system fonts if brand fonts unavailable

### 3. Build compositing function (`lib/ad-creatives/composite-ad.ts`)

Function `compositeAd(config)` that:
- Takes: base image buffer, text overlay buffer, logo URL, logo position, dimensions
- Uses sharp to:
  1. Load base image
  2. Composite text overlay (with transparency)
  3. Fetch + resize logo, composite at specified position (default: bottom-left)
  4. Output final PNG buffer
- Returns the final composited image buffer

### 4. Update orchestrator

In `orchestrate-batch.ts`, after `generateAdImage()`:
1. Call `renderTextOverlay()` with the on-screen text + brand fonts
2. Call `compositeAd()` to merge base image + text overlay + logo
3. Upload the composited result (not the raw Gemini output)

### 5. Font resolution (`lib/ad-creatives/resolve-fonts.ts`)

Function `resolveBrandFonts(brandContext)` that:
- Reads font families from Brand DNA visual identity
- Attempts to fetch from Google Fonts API (covers 90% of cases)
- Falls back to bundled Inter font
- Returns font buffers for satori

## Dependencies

```
npm install sharp satori @resvg/resvg-js
```

(`sharp` likely already installed)

## Non-Goals

- No font upload UI (fonts come from Brand DNA or Google Fonts)
- No WYSIWYG text positioning (layout comes from template schema)
- No animated text effects
