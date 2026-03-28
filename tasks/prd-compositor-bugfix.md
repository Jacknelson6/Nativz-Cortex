# PRD: Compositor Bugfix — 3 Issues From QA Visual Inspection

These are bugs found during visual QA of the compositor output across all 5 aspect ratios. The compositor pipeline is architecturally sound — these are layout tuning and font rendering fixes, not structural changes.

Fix all 3 issues in order. Each fix is isolated and testable independently.

---

## Bug 1: Font Rendering Breaks on 9:16 (Story) Aspect Ratio — CRITICAL

### What's Happening

When generating a composite at 1080×1920 (9:16 story format), the headline renders in a visibly different typeface than the same headline at 1080×1080 or 1920×1080. The letterforms look like a stencil or display font with unusual glyphs — "F", "S", "h", "p", "d", "y" all render differently than on other aspect ratios.

All composites use the same font (Inter 700), same `renderTextToPng` function, same satori call. The only thing that changes is the canvas dimensions passed to the compositor.

### Root Cause Analysis

The issue is in `text-renderer.ts`. Look at this chain:

1. `compositeAdCreative()` calls `renderTextToPng()` with `canvasHeight: 1920` for 9:16
2. `computeFontSize('headline', 1920)` returns `Math.round(1920 * 0.065)` = **125px**
3. Satori renders Inter at 125px into a `maxWidth` of `Math.round(0.88 * 1080)` = 950px and `maxHeight` of `Math.round(0.11 * 1920)` = 211px

The problem is likely that **satori's font rendering at very large sizes (125px) with the Inter TTF variant we fetch can produce rendering artifacts.** Google Fonts serves different font files depending on the weight/variant URL, and the specific Inter TTF we download may not have clean hinting at display sizes above ~96px.

There's also a potential issue where the font `ArrayBuffer` gets detached or corrupted when shared across multiple concurrent satori calls in `Promise.all` (satori may consume the buffer). Since `compositeAdCreative` calls `Promise.all` with headline, subheadline, offer, and CTA renders simultaneously, all using the same `font.data` ArrayBuffer, one call may invalidate it for the others.

### Fix

Two changes in `text-renderer.ts`:

**Fix A: Clone the font ArrayBuffer before each satori call.** ArrayBuffers can be transferred/detached in some runtimes. Create a defensive copy:

```typescript
// In renderTextToPng, before the satori call:
const fontDataCopy = font.data.slice(0); // Defensive copy

const svg = await satori(el as never, {
  width: maxWidth,
  height: maxHeight,
  fonts: [
    {
      name: font.name,
      data: fontDataCopy,  // Use the copy, not the original
      weight: font.weight as 400 | 500 | 600 | 700 | 800,
      style: 'normal',
    },
  ],
});
```

**Fix B: Cap the maximum font size.** Even if the ArrayBuffer issue is the primary cause, capping headline size prevents absurdly large text that may hit satori edge cases:

```typescript
export function computeFontSize(role: TextRole, canvasHeight: number): number {
  const ratios: Record<TextRole, number> = {
    headline: 0.065,
    subheadline: 0.032,
    cta: 0.03,
    offer: 0.028,
  };
  const raw = Math.round(canvasHeight * ratios[role]);
  
  // Cap to prevent rendering issues at extreme canvas heights (9:16 = 1920px)
  const MAX_SIZES: Record<TextRole, number> = {
    headline: 96,
    subheadline: 52,
    cta: 44,
    offer: 40,
  };
  return Math.min(raw, MAX_SIZES[role]);
}
```

Why 96px max for headlines: This is the standard maximum display size in web typography. Google Fonts optimizes TTF hinting for sizes up to ~96px. Going larger risks hinting artifacts, and the visual difference between 96px and 125px on a 1920px canvas is marginal — the headline is already very large at 96px.

Apply BOTH fixes. Fix A prevents buffer corruption across parallel renders. Fix B prevents oversized text that hits font rendering edge cases.

### How to Verify

After the fix, run this test (add to `compositor-qa.test.ts`):

```typescript
it('9:16 headline renders same font as 1:1', async () => {
  const brand = mockBrandContext();
  const schema = mockPromptSchema();
  const text = { headline: 'Free Shipping Today', subheadline: 'On all orders over $50.', cta: 'Shop Now' };
  
  const bg1x1 = await sharp({ create: { width: 1080, height: 1080, channels: 4, background: { r: 26, g: 26, b: 46, alpha: 1 } } }).png().toBuffer();
  const bg9x16 = await sharp({ create: { width: 1080, height: 1920, channels: 4, background: { r: 26, g: 26, b: 46, alpha: 1 } } }).png().toBuffer();
  
  const r1 = await compositeAdCreative({ backgroundImage: bg1x1, brandContext: brand, onScreenText: text, offer: null, promptSchema: schema, width: 1080, height: 1080, aspectRatio: '1:1' });
  const r2 = await compositeAdCreative({ backgroundImage: bg9x16, brandContext: brand, onScreenText: text, offer: null, promptSchema: schema, width: 1080, height: 1920, aspectRatio: '9:16' });
  
  // Both should report the same font
  expect(r2.metadata.fontsUsed.display).toBe(r1.metadata.fontsUsed.display);
  
  // Write for visual comparison
  const fs = await import('fs');
  fs.writeFileSync('/tmp/compositor-font-fix-1x1.png', r1.image);
  fs.writeFileSync('/tmp/compositor-font-fix-9x16.png', r2.image);
  // VISUAL CHECK: headline font must look identical between the two files
});
```

Also verify `computeFontSize` caps correctly:

```typescript
it('computeFontSize caps at maximum', () => {
  // 9:16 canvas: 1920 * 0.065 = 125, should cap to 96
  expect(computeFontSize('headline', 1920)).toBeLessThanOrEqual(96);
  
  // 1:1 canvas: 1080 * 0.065 = 70, should NOT be capped
  expect(computeFontSize('headline', 1080)).toBe(70);
  
  // 16:9 canvas: 1080 * 0.065 = 70, should NOT be capped
  expect(computeFontSize('headline', 1080)).toBe(70);
});
```

---

## Bug 2: Content Block is Bottom-Heavy on All Archetypes — MEDIUM

### What's Happening

On the `center_overlay` and `full_overlay` archetypes (which are the default for most templates, including all Nano Banana styles), all text elements are pinned to the bottom ~35% of the canvas. The top 50-65% is empty.

In production, this will be less noticeable because Gemini generates a background with product/hero imagery filling the upper portion. But the layout is still suboptimal:

- On 9:16 (story), the text occupies only the bottom 35% of 1920px — that's 672px of content in 1920px of canvas. Over 1200px is "reserved" for the hero, which is excessive.
- On 1:1 (square), the text cluster starts around y=55%, leaving the entire top half for hero. This works but feels unbalanced.
- The content should distribute more evenly, giving the hero its space but not abandoning the composition to gravity.

### Root Cause

In `layout-engine.ts`, the `center_overlay` / `full_overlay` / `bottom_text` cases all compute zones by working backwards from `stackBottom = 0.88`:

```typescript
case 'center_overlay':
case 'full_overlay':
default: {
  const stackBottom = 0.88;
  const ctaH = 0.1;
  const ctaY = stackBottom - ctaH - 0.02;
  // ... everything stacks upward from the CTA
```

This means the CTA is at ~76% down, offer above it, subheadline above that, headline above that. On a 1920px canvas, the headline ends up at ~y=55%, and on a 628px canvas it's similar. The problem is the stack anchor (0.88) is fixed regardless of canvas proportions.

### Fix

For `center_overlay` and `full_overlay`, vertically center the content block within the lower 60% of the canvas (upper 40% reserved for hero). This means the content block floats in the middle of the text zone, not pinned to the absolute bottom.

Replace the `center_overlay` / `full_overlay` / `bottom_text` case in `computeLayout`:

```typescript
case 'bottom_text':
case 'center_overlay':
case 'full_overlay':
default: {
  // Content lives in the lower 60% of the canvas (y: 0.40 to 0.94)
  // We compute total content height, then center within that zone.
  const zoneTop = 0.40;    // Hero gets top 40%
  const zoneBottom = 0.94;  // 6% bottom margin
  const zoneHeight = zoneBottom - zoneTop; // 0.54

  const headlineH = 0.11;
  const subH = 0.08;
  const offerH = hasOffer ? 0.045 : 0;
  const ctaH = 0.1;
  const gaps = 2 + (hasOffer ? 1 : 0); // gaps between elements
  
  const totalContentH = headlineH + subH + offerH + ctaH + (gaps * ELEMENT_GAP);
  
  // Center the content block within the zone
  const contentTop = zoneTop + (zoneHeight - totalContentH) / 2;
  
  let y = contentTop;
  const h1 = zone(MARGIN, y, textW, headlineH);
  y += headlineH + ELEMENT_GAP;
  const h2 = zone(MARGIN, y, textW, subH);
  y += subH + ELEMENT_GAP;
  const offer = hasOffer ? zone(MARGIN, y, textW, offerH) : null;
  if (offer) y += offerH + ELEMENT_GAP;
  const cta = zone((1 - CTA_MAX_WIDTH_FRAC) / 2, y, CTA_MAX_WIDTH_FRAC, ctaH);
  const logo = zone(1 - MARGIN - LOGO_MAX_WIDTH_FRAC, MARGIN, LOGO_MAX_WIDTH_FRAC, LOGO_MAX_HEIGHT_FRAC);
  
  return { headline: h1, subheadline: h2, cta, offer, logo };
}
```

### Why 40% Hero / 60% Content Split

Ad creative best practice: the hero (product shot, lifestyle image, abstract visual) typically occupies 35-45% of the frame, with the remaining space for messaging. 40/60 is the sweet spot — enough hero to establish visual interest, enough text space to deliver the message without cramming.

This split also matches what Gemini generates in clean canvas mode. When the prompt says "reserve space for text overlay in the lower portion," Gemini naturally puts the focal subject in the upper 40%.

### How to Verify

Regenerate test composites after the fix and visually compare:

```typescript
it('center_overlay content is vertically centered in lower zone', () => {
  const layout = computeLayout('center_overlay', 1080, 1080, true);
  
  // Headline should start between 40% and 55% of canvas height
  expect(layout.headline.y).toBeGreaterThanOrEqual(0.40);
  expect(layout.headline.y).toBeLessThanOrEqual(0.55);
  
  // CTA should end before 94% of canvas height
  const ctaBottom = layout.cta.y + layout.cta.height;
  expect(ctaBottom).toBeLessThanOrEqual(0.94);
  
  // Content block should be roughly centered in the 0.40-0.94 zone
  const contentCenter = (layout.headline.y + layout.cta.y + layout.cta.height) / 2;
  const zoneCenter = (0.40 + 0.94) / 2; // 0.67
  expect(Math.abs(contentCenter - zoneCenter)).toBeLessThan(0.1);
});

it('9:16 content is not bottom-pinned', () => {
  const layout = computeLayout('full_overlay', 1080, 1920, true);
  
  // On a 1920px canvas, headline should NOT be below 60%
  expect(layout.headline.y).toBeLessThan(0.60);
});
```

---

## Bug 3: Inconsistent Horizontal Alignment Within Archetypes — MEDIUM

### What's Happening

Within a single composite, elements have mixed horizontal alignment:
- Headline: center-aligned text within its zone
- Subheadline: center-aligned text within its zone
- Offer ("20% OFF"): left-aligned to the margin
- CTA button: roughly centered but at a different x-position than the text

This looks like a layout that can't decide if it's centered or left-aligned.

### Root Cause

Two separate issues:

**Issue A:** In `compositor/index.ts`, the `renderTextToPng` calls for headline and subheadline use `align: 'center'`, but the zones themselves (`layout.headline`, `layout.subheadline`) have `x: MARGIN (0.06)` and `width: textW (0.88)`. So the text is centered within a zone that starts at 6% from the left and spans 88% of the canvas. This is correct for centered layouts.

But the **offer line** uses the same zone x/width AND `align: 'center'`, yet visually appears left-aligned. This suggests the offer zone width in the layout engine is narrower than the headline zone, or the offer text is short enough that centering it within a wide zone makes it look off-center compared to multi-word headline.

**Issue B:** The CTA zone uses `x: (1 - CTA_MAX_WIDTH_FRAC) / 2` which centers the *zone* on the canvas, but the CTA button rendered inside that zone may be narrower than the zone width. The button is left-aligned within its zone, making it appear slightly off-center.

### Fix

**Fix A: Use consistent alignment across all text elements in overlay archetypes.**

In `compositor/index.ts`, the `compositeAdCreative` function currently hardcodes `align: 'center'` for headline and subheadline. Make the alignment derived from the archetype:

```typescript
// After detecting archetype, determine alignment
const textAlign: 'left' | 'center' | 'right' = (() => {
  switch (archetype) {
    case 'left_stack': return 'left';
    case 'right_stack': return 'right';
    case 'center_overlay':
    case 'full_overlay':
    case 'top_text':
    case 'bottom_text':
    default: return 'center';
  }
})();
```

Then pass `textAlign` to ALL text renders (headline, subheadline, offer):

```typescript
renderTextToPng({
  text: onScreenText.headline,
  font: fonts.display,
  canvasHeight: height,
  maxWidth: headlineMaxW,
  maxHeight: headlineMaxH,
  color: bodyColor,
  align: textAlign,  // Was hardcoded 'center'
  role: 'headline',
}),
```

Same for subheadline and offer.

**Fix B: Center the CTA buffer within its zone, not just the zone on the canvas.**

The CTA button is rendered to a PNG that may be narrower than its zone. When compositing, center the rendered button within the zone:

```typescript
// In the compositing step, for the CTA:
const ctaZonePixelX = Math.round(layout.cta.x * width);
const ctaZonePixelW = Math.round(layout.cta.width * width);
const ctaCenterOffset = Math.round((ctaZonePixelW - ctaPng.width) / 2);

composites.push({
  input: ctaPng.buffer,
  left: ctaZonePixelX + Math.max(0, ctaCenterOffset), // Center within zone
  top: Math.round(layout.cta.y * height),
  blend: 'over',
});
```

Do the same for all text elements — center the rendered buffer within its layout zone rather than placing it at the zone's left edge:

```typescript
function placecentered(buf: Buffer, renderedWidth: number, zn: ElementZone) {
  const zonePixelX = Math.round(zn.x * width);
  const zonePixelW = Math.round(zn.width * width);
  const offset = Math.round((zonePixelW - renderedWidth) / 2);
  composites.push({
    input: buf,
    left: zonePixelX + Math.max(0, offset),
    top: Math.round(zn.y * height),
    blend: 'over',
  });
}

placeCentered(headlinePng.buffer, headlinePng.width, layout.headline);
placeCentered(subPng.buffer, subPng.width, layout.subheadline);
if (offerPng && layout.offer) {
  placeCentered(offerPng.buffer, offerPng.width, layout.offer);
}
placeCentered(ctaPng.buffer, ctaPng.width, layout.cta);
```

This ensures that even when the rendered text/button is narrower than its zone, it's centered within that zone. The visual effect: all elements share the same vertical center axis.

### How to Verify

```typescript
it('all overlay elements share the same center axis', async () => {
  const brand = mockBrandContext();
  const schema = mockPromptSchema(); // center_overlay archetype
  const text = { headline: 'Short', subheadline: 'Also short text', cta: 'Go' };
  
  const bg = await sharp({ create: { width: 1080, height: 1080, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
  const result = await compositeAdCreative({
    backgroundImage: bg, brandContext: brand, onScreenText: text,
    offer: '10% OFF', promptSchema: schema, width: 1080, height: 1080, aspectRatio: '1:1',
  });
  
  // Write for visual inspection
  const fs = await import('fs');
  fs.writeFileSync('/tmp/compositor-alignment-fix.png', result.image);
  // VISUAL CHECK: headline, subheadline, offer, and CTA should all be centered on the same vertical axis
});
```

Also add a test with very short text (like "Go" for CTA and "Hi" for headline) to make sure short strings still look centered, not left-aligned within their zone.

---

## Files to Modify

| File | Bug | Change |
|------|-----|--------|
| `lib/ad-creatives/compositor/text-renderer.ts` | Bug 1 | Clone font ArrayBuffer before satori call; cap max font sizes |
| `lib/ad-creatives/compositor/layout-engine.ts` | Bug 2 | Center content block in lower 60% zone for overlay/bottom archetypes |
| `lib/ad-creatives/compositor/index.ts` | Bug 3 | Derive alignment from archetype; center rendered buffers within zones |
| `lib/ad-creatives/compositor/__tests__/compositor-qa.test.ts` | All | Add 6 new verification tests |

## Do NOT Change

- `orchestrate-batch.ts` — No changes needed. The orchestrator integration is correct.
- `gemini-static-ad-prompt.ts` — Clean canvas prompt is correct.
- `types.ts` — No new types needed.
- Any other compositor files not listed above — `color-utils.ts`, `cta-renderer.ts`, `logo-renderer.ts` are all correct.

## Success Criteria

After all 3 fixes:
- [ ] 9:16 headline renders in the same typeface as 1:1 (visual comparison)
- [ ] `computeFontSize('headline', 1920)` returns ≤ 96
- [ ] Content block is vertically centered in the lower 60% zone for overlay archetypes
- [ ] Headline y-position on 9:16 canvas is < 0.60 (not bottom-pinned)
- [ ] All text elements and CTA button share the same center axis on overlay layouts
- [ ] Short text strings ("Go", "Hi") still appear centered, not left-aligned
- [ ] All existing 39 tests still pass
- [ ] 6 new tests pass
- [ ] Typecheck clean: `npx -p typescript tsc --noEmit`
- [ ] Visual inspection of all 5 aspect ratios shows balanced, centered compositions
