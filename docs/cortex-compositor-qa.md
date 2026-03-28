# QA Validation Prompt — Compositor Pipeline + Intelligence Loop

You are a QA engineer validating the Cortex Ad Creative Compositor Pipeline and Creative Intelligence Loop. Your job is to systematically verify every component works correctly, handles edge cases, and integrates properly with the existing codebase.

Read the full PRD at `tasks/prd-compositor-pipeline.md` before starting. Then execute every test below. Do NOT skip tests. Do NOT mark a test as passed unless you've actually run it and verified the output.

For each test: run it, check the result against the expected outcome, and report PASS or FAIL with details. If a test fails, fix the issue before moving to the next section.

---

## Section 1: Dependencies and Setup Verification

Before testing any new code, verify the foundation is solid.

### Test 1.1: Sharp is functional
```typescript
// Create a test file: lib/ad-creatives/compositor/__tests__/setup.test.ts
import sharp from 'sharp';

test('sharp can create a basic PNG', async () => {
  const buffer = await sharp({
    create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } }
  }).png().toBuffer();
  
  expect(buffer).toBeInstanceOf(Buffer);
  expect(buffer.length).toBeGreaterThan(0);
  
  const metadata = await sharp(buffer).metadata();
  expect(metadata.width).toBe(100);
  expect(metadata.height).toBe(100);
  expect(metadata.format).toBe('png');
});
```
**Expected:** Buffer is created, dimensions are 100x100, format is PNG.

### Test 1.2: Satori is functional
```typescript
import satori from 'satori';

test('satori can render text to SVG', async () => {
  // Fetch a minimal font for testing
  const fontResponse = await fetch('https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjQ.ttf');
  const fontData = await fontResponse.arrayBuffer();
  
  const svg = await satori(
    { type: 'div', props: { style: { color: 'white', fontSize: 32 }, children: 'Hello World' } },
    {
      width: 400,
      height: 100,
      fonts: [{ name: 'Inter', data: fontData, weight: 400 }],
    }
  );
  
  expect(typeof svg).toBe('string');
  expect(svg).toContain('<svg');
  expect(svg).toContain('Hello');
});
```
**Expected:** Returns a valid SVG string containing the text.

### Test 1.3: Existing font resolver works
```typescript
import { resolveBrandFonts } from '@/lib/ad-creatives/resolve-fonts';

test('resolveBrandFonts returns valid font pair', async () => {
  const fonts = await resolveBrandFonts([
    { family: 'Inter', weight: '700', role: 'display' },
    { family: 'Inter', weight: '400', role: 'body' },
  ]);
  
  expect(fonts.display.data.byteLength).toBeGreaterThan(0);
  expect(fonts.body.data.byteLength).toBeGreaterThan(0);
  expect(fonts.display.weight).toBe(700);
  expect(fonts.body.weight).toBe(400);
}, 15000); // Allow 15s for font fetch
```
**Expected:** Both fonts resolve with non-empty ArrayBuffers.

### Test 1.4: Existing font resolver fallback works
```typescript
test('resolveBrandFonts falls back to Inter for unknown fonts', async () => {
  const fonts = await resolveBrandFonts([
    { family: 'ThisFontDoesNotExist12345', weight: '700', role: 'display' },
  ]);
  
  expect(fonts.display.name).toBe('Inter');
  expect(fonts.display.data.byteLength).toBeGreaterThan(0);
}, 15000);
```
**Expected:** Falls back to Inter without throwing.

---

## Section 2: Color Utilities (`compositor/color-utils.ts`)

### Test 2.1: Relative luminance calculation
```typescript
import { relativeLuminance, contrastRatio, bestTextColor } from './color-utils';

test('relativeLuminance returns correct values', () => {
  expect(relativeLuminance('#000000')).toBeCloseTo(0, 4);
  expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 4);
  expect(relativeLuminance('#FF0000')).toBeCloseTo(0.2126, 2);
});
```
**Expected:** Black = 0, White = 1, Red ≈ 0.2126 (per WCAG sRGB formula).

### Test 2.2: Contrast ratio calculation
```typescript
test('contrastRatio matches WCAG known values', () => {
  // Black on white = 21:1 (maximum)
  expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  
  // Same color = 1:1 (minimum)
  expect(contrastRatio('#888888', '#888888')).toBeCloseTo(1, 0);
  
  // White on yellow should be low contrast
  expect(contrastRatio('#FFFFFF', '#FFFF00')).toBeLessThan(2);
});
```
**Expected:** Black/white = 21, same color = 1, white/yellow < 2.

### Test 2.3: Best text color selection
```typescript
test('bestTextColor picks correct contrast', () => {
  expect(bestTextColor('#000000')).toBe('#FFFFFF'); // White text on black bg
  expect(bestTextColor('#FFFFFF')).toBe('#000000'); // Black text on white bg
  expect(bestTextColor('#1a1a2e')).toBe('#FFFFFF'); // White text on dark navy
  expect(bestTextColor('#f5f5dc')).toBe('#000000'); // Black text on beige
  expect(bestTextColor('#FF6B35')).toBe('#FFFFFF'); // White text on orange (dark enough to need white)
});
```
**Expected:** Always picks the color with higher WCAG contrast ratio against the background.

### Test 2.4: Hex parsing handles formats
```typescript
test('functions handle various hex formats', () => {
  // With and without hash
  expect(relativeLuminance('#FFFFFF')).toBe(relativeLuminance('FFFFFF'));
  
  // Lowercase and uppercase
  expect(relativeLuminance('#ffffff')).toBe(relativeLuminance('#FFFFFF'));
  
  // 3-character shorthand (if supported)
  // If not supported, verify it throws a clear error rather than returning garbage
});
```
**Expected:** Hash prefix is optional, case insensitive. If shorthand isn't supported, error is clear.

---

## Section 3: Text Renderer (`compositor/text-renderer.ts`)

### Test 3.1: Basic text rendering
```typescript
import { renderText } from './text-renderer';
import sharp from 'sharp';

test('renderText produces a valid transparent PNG', async () => {
  const fontResponse = await fetch('https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjQ.ttf');
  const fontData = await fontResponse.arrayBuffer();
  
  const result = await renderText({
    text: 'Test Headline',
    fontData,
    fontName: 'Inter',
    fontSize: 48,
    fontWeight: 700,
    color: '#FFFFFF',
    maxWidth: 600,
    maxHeight: 200,
  });
  
  expect(result.buffer).toBeInstanceOf(Buffer);
  expect(result.buffer.length).toBeGreaterThan(0);
  
  const metadata = await sharp(result.buffer).metadata();
  expect(metadata.format).toBe('png');
  expect(metadata.channels).toBe(4); // RGBA — must have alpha for compositing
  expect(metadata.width).toBeLessThanOrEqual(600);
  expect(metadata.height).toBeLessThanOrEqual(200);
}, 15000);
```
**Expected:** PNG with alpha channel, within maxWidth/maxHeight bounds.

### Test 3.2: Long text auto-sizes down
```typescript
test('renderText shrinks font for long text', async () => {
  const fontData = /* fetch Inter as above */;
  
  const shortResult = await renderText({
    text: 'Short',
    fontData, fontName: 'Inter', fontSize: 72, fontWeight: 700,
    color: '#FFFFFF', maxWidth: 400, maxHeight: 100,
  });
  
  const longResult = await renderText({
    text: 'This Is A Much Longer Headline That Should Force Smaller Font Size',
    fontData, fontName: 'Inter', fontSize: 72, fontWeight: 700,
    color: '#FFFFFF', maxWidth: 400, maxHeight: 100,
  });
  
  // Both should succeed (no throws)
  expect(shortResult.buffer.length).toBeGreaterThan(0);
  expect(longResult.buffer.length).toBeGreaterThan(0);
  
  // Long text should still fit within bounds
  const longMeta = await sharp(longResult.buffer).metadata();
  expect(longMeta.height).toBeLessThanOrEqual(100);
}, 15000);
```
**Expected:** Long text doesn't overflow maxHeight — font shrinks to fit.

### Test 3.3: Empty text doesn't crash
```typescript
test('renderText handles empty string gracefully', async () => {
  const fontData = /* fetch Inter */;
  
  const result = await renderText({
    text: '',
    fontData, fontName: 'Inter', fontSize: 48, fontWeight: 700,
    color: '#FFFFFF', maxWidth: 600, maxHeight: 200,
  });
  
  // Should return a valid (possibly tiny/empty) buffer, not throw
  expect(result.buffer).toBeInstanceOf(Buffer);
});
```
**Expected:** Returns a buffer without throwing. May be a 1x1 transparent pixel or similar.

### Test 3.4: Special characters render
```typescript
test('renderText handles special characters', async () => {
  const fontData = /* fetch Inter */;
  
  // Ads commonly include: %, $, !, &, quotes, emoji-adjacent symbols
  for (const text of ['50% OFF!', '$9.99/mo', 'Buy 1 & Get 1', '"Best Ever"', 'Créme Brûlée']) {
    const result = await renderText({
      text,
      fontData, fontName: 'Inter', fontSize: 36, fontWeight: 400,
      color: '#000000', maxWidth: 500, maxHeight: 100,
    });
    expect(result.buffer.length).toBeGreaterThan(0);
  }
}, 30000);
```
**Expected:** All common ad copy characters render without error.

### Test 3.5: Font size ratios scale correctly
```typescript
test('computeFontSize scales with canvas height', () => {
  const small = computeFontSize('headline', 628);   // Landscape (1200x628)
  const medium = computeFontSize('headline', 1080); // Square (1080x1080)
  const tall = computeFontSize('headline', 1920);   // Story (1080x1920)
  
  expect(small).toBeLessThan(medium);
  expect(medium).toBeLessThan(tall);
  expect(small).toBeGreaterThanOrEqual(30); // Never unreadably small
  expect(tall).toBeLessThanOrEqual(150);    // Never absurdly large
});
```
**Expected:** Font sizes scale proportionally, stay within reasonable bounds.

---

## Section 4: CTA Renderer (`compositor/cta-renderer.ts`)

### Test 4.1: Basic CTA button rendering
```typescript
import { renderCtaButton } from './cta-renderer';

test('renderCtaButton produces a valid button PNG', async () => {
  const fontData = /* fetch Inter */;
  
  const result = await renderCtaButton({
    text: 'Shop Now',
    fontData, fontName: 'Inter', fontSize: 28, fontWeight: 700,
    textColor: '#FFFFFF',
    backgroundColor: '#FF6B35',
    borderRadius: 999, // pill
    paddingX: 40,
    paddingY: 14,
    maxWidth: 400,
  });
  
  expect(result.buffer).toBeInstanceOf(Buffer);
  
  const metadata = await sharp(result.buffer).metadata();
  expect(metadata.format).toBe('png');
  expect(metadata.channels).toBe(4); // Must have alpha
  expect(metadata.width).toBeLessThanOrEqual(400);
  expect(metadata.height).toBeGreaterThan(0);
}, 15000);
```
**Expected:** Valid PNG with alpha, within maxWidth.

### Test 4.2: Button style resolution from schema
```typescript
test('resolveButtonStyle maps schema strings correctly', () => {
  expect(resolveButtonStyle('rounded pill').borderRadius).toBe(999);
  expect(resolveButtonStyle('sharp rectangle').borderRadius).toBeLessThan(10);
  expect(resolveButtonStyle('soft rounded').borderRadius).toBeGreaterThan(4);
  expect(resolveButtonStyle('soft rounded').borderRadius).toBeLessThan(999);
  
  // Unknown strings get safe defaults
  expect(resolveButtonStyle('').borderRadius).toBeGreaterThan(0);
  expect(resolveButtonStyle('banana').borderRadius).toBeGreaterThan(0);
});
```
**Expected:** Maps known shape descriptions, falls back safely for unknown strings.

### Test 4.3: CTA contrast is always readable
```typescript
test('CTA text always has sufficient contrast against button background', () => {
  const testColors = ['#FF6B35', '#1a1a2e', '#FFFFFF', '#00C853', '#FFD600', '#9C27B0'];
  
  for (const bg of testColors) {
    const textColor = bestTextColor(bg);
    const ratio = contrastRatio(textColor, bg);
    
    // WCAG AA requires 4.5:1 for normal text
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
});
```
**Expected:** Every possible brand accent color produces a CTA with WCAG AA-compliant contrast.

---

## Section 5: Logo Renderer (`compositor/logo-renderer.ts`)

### Test 5.1: Logo fetch and resize
```typescript
import { renderLogo } from './logo-renderer';

test('renderLogo fetches and resizes a logo', async () => {
  // Use a known public image URL for testing
  const testLogoUrl = 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png';
  
  const result = await renderLogo({
    logoUrl: testLogoUrl,
    maxWidth: 200,
    maxHeight: 80,
  });
  
  expect(result).not.toBeNull();
  expect(result!.buffer).toBeInstanceOf(Buffer);
  
  const metadata = await sharp(result!.buffer).metadata();
  expect(metadata.width).toBeLessThanOrEqual(200);
  expect(metadata.height).toBeLessThanOrEqual(80);
  expect(metadata.channels).toBe(4); // Alpha preserved
}, 15000);
```
**Expected:** Image fetched, resized to fit within bounds, alpha channel present.

### Test 5.2: Logo renderer handles bad URLs
```typescript
test('renderLogo returns null for unreachable URLs', async () => {
  const result = await renderLogo({
    logoUrl: 'https://thisdomaindoesnotexist12345.com/logo.png',
    maxWidth: 200,
    maxHeight: 80,
  });
  
  expect(result).toBeNull(); // Graceful failure, not a throw
}, 15000);
```
**Expected:** Returns null, does NOT throw.

### Test 5.3: Logo cache works within batch
```typescript
test('renderLogo caches fetched logos', async () => {
  const testUrl = 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png';
  
  const start1 = Date.now();
  await renderLogo({ logoUrl: testUrl, maxWidth: 200, maxHeight: 80 });
  const time1 = Date.now() - start1;
  
  const start2 = Date.now();
  await renderLogo({ logoUrl: testUrl, maxWidth: 200, maxHeight: 80 });
  const time2 = Date.now() - start2;
  
  // Second call should be dramatically faster (cache hit)
  expect(time2).toBeLessThan(time1 / 2);
}, 30000);
```
**Expected:** Second call is significantly faster than first (cache hit vs network fetch).

---

## Section 6: Layout Engine (`compositor/layout-engine.ts`)

### Test 6.1: Archetype detection from schema strings
```typescript
import { detectArchetype, computeLayout } from './layout-engine';

test('detectArchetype classifies common layout descriptions', () => {
  const cases: [Partial<AdPromptSchema>, string][] = [
    [{ layout: { textPosition: 'left column', visualHierarchy: 'text-left stack with hero right', imagePosition: 'right', ctaPosition: 'bottom-left' } }, 'left_stack'],
    [{ layout: { textPosition: 'right column', visualHierarchy: 'hero left, text stacked right', imagePosition: 'left', ctaPosition: 'bottom-right' } }, 'right_stack'],
    [{ layout: { textPosition: 'centered overlay', visualHierarchy: 'centered text over background', imagePosition: 'full-bleed', ctaPosition: 'center-bottom' } }, 'center_overlay'],
    [{ layout: { textPosition: 'top section', visualHierarchy: 'headline top, hero bottom', imagePosition: 'bottom', ctaPosition: 'mid-left' } }, 'top_text'],
    [{ layout: { textPosition: 'bottom section', visualHierarchy: 'hero top 60%, text bottom', imagePosition: 'top', ctaPosition: 'bottom-center' } }, 'bottom_text'],
  ];
  
  for (const [schema, expected] of cases) {
    expect(detectArchetype(schema as AdPromptSchema)).toBe(expected);
  }
});
```
**Expected:** Each schema layout description maps to the correct archetype.

### Test 6.2: Unknown layouts fall back safely
```typescript
test('detectArchetype defaults to full_overlay for ambiguous descriptions', () => {
  const ambiguous = {
    layout: { textPosition: 'dynamic', visualHierarchy: 'balanced', imagePosition: 'adaptive', ctaPosition: 'optimal' }
  } as AdPromptSchema;
  
  expect(detectArchetype(ambiguous)).toBe('full_overlay');
});
```
**Expected:** Ambiguous or unparseable descriptions default to the safest archetype.

### Test 6.3: Layout zones stay within canvas bounds
```typescript
test('computeLayout zones never exceed canvas dimensions', () => {
  const archetypes = ['left_stack', 'right_stack', 'center_overlay', 'top_text', 'bottom_text', 'full_overlay'];
  const dimensions = [
    { w: 1080, h: 1080 },  // Square
    { w: 1080, h: 1350 },  // Portrait
    { w: 1080, h: 1920 },  // Story
    { w: 1920, h: 1080 },  // Landscape
    { w: 1200, h: 628 },   // Facebook
  ];
  
  for (const arch of archetypes) {
    for (const dim of dimensions) {
      const layout = computeLayout(arch as any, dim.w, dim.h, true);
      
      for (const [key, zone] of Object.entries(layout)) {
        if (!zone) continue; // offer can be null
        
        // Zone percentages must be 0-1
        expect(zone.x).toBeGreaterThanOrEqual(0);
        expect(zone.y).toBeGreaterThanOrEqual(0);
        expect(zone.x + zone.width).toBeLessThanOrEqual(1.001); // Tiny float tolerance
        expect(zone.y + zone.height).toBeLessThanOrEqual(1.001);
        
        // Zones must have positive dimensions
        expect(zone.width).toBeGreaterThan(0);
        expect(zone.height).toBeGreaterThan(0);
      }
    }
  }
});
```
**Expected:** Every archetype × dimension combination produces valid, in-bounds zones. This is critical — a zone extending beyond 100% would place text off-canvas.

### Test 6.4: Layout without offer line
```typescript
test('computeLayout handles no offer correctly', () => {
  const layout = computeLayout('left_stack', 1080, 1080, false); // hasOffer = false
  
  expect(layout.offer).toBeNull();
  expect(layout.headline).toBeDefined();
  expect(layout.subheadline).toBeDefined();
  expect(layout.cta).toBeDefined();
  expect(layout.logo).toBeDefined();
});
```
**Expected:** offer is null, all other zones present. The remaining zones should use the freed space.

### Test 6.5: Zones don't overlap
```typescript
test('headline and subheadline zones do not overlap vertically', () => {
  for (const arch of ['left_stack', 'center_overlay', 'bottom_text'] as const) {
    const layout = computeLayout(arch, 1080, 1080, true);
    
    const headlineBottom = layout.headline.y + layout.headline.height;
    const subheadlineTop = layout.subheadline.y;
    
    // Subheadline should start at or after headline ends
    expect(subheadlineTop).toBeGreaterThanOrEqual(headlineBottom - 0.01); // Tiny overlap tolerance for gap
  }
});
```
**Expected:** Text elements are stacked, not overlapping.

---

## Section 7: Main Compositor Integration (`compositor/index.ts`)

### Test 7.1: End-to-end composite with synthetic background
```typescript
import { compositeAdCreative } from './index';

test('compositeAdCreative produces a valid final image', async () => {
  // Create a solid blue background (simulates AI output)
  const background = await sharp({
    create: { width: 1080, height: 1080, channels: 4, background: { r: 26, g: 26, b: 46, alpha: 1 } }
  }).png().toBuffer();
  
  const mockBrandContext = {
    clientName: 'TestBrand',
    clientIndustry: 'ecommerce',
    clientWebsiteUrl: 'https://testbrand.com',
    visualIdentity: {
      colors: [
        { hex: '#FF6B35', name: 'Accent', role: 'accent' },
        { hex: '#1a1a2e', name: 'Primary', role: 'primary' },
      ],
      fonts: [
        { family: 'Inter', weight: '700', role: 'display' },
        { family: 'Inter', weight: '400', role: 'body' },
      ],
      logos: [], // No logo for this test
      screenshots: [],
    },
    verbalIdentity: { tonePrimary: 'Bold and direct' },
    // ... other required fields with safe defaults
  };
  
  const mockSchema = {
    layout: { textPosition: 'left column', imagePosition: 'right', ctaPosition: 'bottom-left', visualHierarchy: 'text-left stack' },
    composition: { backgroundType: 'solid', overlayStyle: 'none', borderTreatment: 'none' },
    typography: { headlineStyle: 'bold sans', subheadlineStyle: 'regular sans', ctaTextStyle: 'bold', fontPairingNotes: 'Inter' },
    colorStrategy: { dominantColors: ['#1a1a2e'], contrastApproach: 'high', accentUsage: 'CTA only' },
    imageryStyle: 'product_focused',
    emotionalTone: 'trust',
    ctaStyle: { buttonShape: 'rounded pill', position: 'bottom-left', textPattern: 'verb noun' },
    contentBlocks: [],
  };
  
  const result = await compositeAdCreative({
    backgroundImage: background,
    brandContext: mockBrandContext as any,
    onScreenText: { headline: 'Free Shipping Today', subheadline: 'On all orders over $50. No code needed.', cta: 'Shop Now' },
    offer: '20% OFF',
    promptSchema: mockSchema,
    width: 1080,
    height: 1080,
    aspectRatio: '1:1',
  });
  
  expect(result.image).toBeInstanceOf(Buffer);
  expect(result.image.length).toBeGreaterThan(background.length); // Composited image should be larger
  
  const metadata = await sharp(result.image).metadata();
  expect(metadata.width).toBe(1080);
  expect(metadata.height).toBe(1080);
  expect(metadata.format).toBe('png');
  
  expect(result.metadata.layoutArchetype).toBe('left_stack');
  expect(result.metadata.fontsUsed.display).toBeTruthy();
  expect(result.metadata.ctaBackgroundColor).toBeTruthy();
  
  // Write to disk for visual inspection
  const fs = await import('fs');
  fs.writeFileSync('/tmp/compositor-test-output.png', result.image);
  console.log('Visual inspection: open /tmp/compositor-test-output.png');
}, 30000);
```
**Expected:** Valid 1080x1080 PNG, larger than input (has text), metadata populated. MUST visually inspect the output file to verify text is readable and properly positioned.

### Test 7.2: All 5 aspect ratios produce correct dimensions
```typescript
const ASPECT_RATIOS = [
  { value: '1:1', width: 1080, height: 1080 },
  { value: '4:5', width: 1080, height: 1350 },
  { value: '9:16', width: 1080, height: 1920 },
  { value: '16:9', width: 1920, height: 1080 },
  { value: '1.91:1', width: 1200, height: 628 },
];

test.each(ASPECT_RATIOS)('compositeAdCreative produces correct $value output', async ({ value, width, height }) => {
  const background = await sharp({
    create: { width, height, channels: 4, background: { r: 30, g: 30, b: 30, alpha: 1 } }
  }).png().toBuffer();
  
  const result = await compositeAdCreative({
    backgroundImage: background,
    brandContext: mockBrandContext as any,
    onScreenText: { headline: 'Test', subheadline: 'Subheadline text here', cta: 'Buy Now' },
    offer: null,
    promptSchema: mockSchema,
    width,
    height,
    aspectRatio: value as any,
  });
  
  const metadata = await sharp(result.image).metadata();
  expect(metadata.width).toBe(width);
  expect(metadata.height).toBe(height);
  
  // Write each for visual inspection
  const fs = await import('fs');
  fs.writeFileSync(`/tmp/compositor-test-${value.replace(':', 'x')}.png`, result.image);
}, 30000);
```
**Expected:** Each aspect ratio outputs at correct dimensions. Visually inspect all 5 to verify text is proportionally sized and positioned correctly — especially the extreme ratios (9:16 tall story, 1.91:1 wide landscape).

### Test 7.3: Gradient overlay applied for overlay layouts
```typescript
test('center_overlay layout includes gradient band', async () => {
  const background = await sharp({
    create: { width: 1080, height: 1080, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
  }).png().toBuffer();
  
  const overlaySchema = {
    ...mockSchema,
    layout: { textPosition: 'centered overlay', imagePosition: 'full-bleed', ctaPosition: 'center-bottom', visualHierarchy: 'centered text over background' },
  };
  
  const result = await compositeAdCreative({
    backgroundImage: background,
    brandContext: mockBrandContext as any,
    onScreenText: { headline: 'White Background Test', subheadline: 'Text should still be readable', cta: 'Click Me' },
    offer: null,
    promptSchema: overlaySchema,
    width: 1080,
    height: 1080,
    aspectRatio: '1:1',
  });
  
  expect(result.metadata.gradientOverlayApplied).toBe(true);
  
  // Visual check: text must be readable on white background
  const fs = await import('fs');
  fs.writeFileSync('/tmp/compositor-test-overlay-white.png', result.image);
  console.log('CRITICAL: Verify text is readable on white background in /tmp/compositor-test-overlay-white.png');
}, 30000);
```
**Expected:** `gradientOverlayApplied` is true. Visual inspection: text MUST be readable on the white background — if not, the gradient overlay is broken.

### Test 7.4: No offer line when offer is null
```typescript
test('compositor omits offer when null', async () => {
  const background = await sharp({
    create: { width: 1080, height: 1080, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } }
  }).png().toBuffer();
  
  const result = await compositeAdCreative({
    backgroundImage: background,
    brandContext: mockBrandContext as any,
    onScreenText: { headline: 'No Offer Test', subheadline: 'Just headline sub and CTA', cta: 'Learn More' },
    offer: null,
    promptSchema: mockSchema,
    width: 1080,
    height: 1080,
    aspectRatio: '1:1',
  });
  
  // Should work without errors
  expect(result.image).toBeInstanceOf(Buffer);
  
  const fs = await import('fs');
  fs.writeFileSync('/tmp/compositor-test-no-offer.png', result.image);
}, 30000);
```
**Expected:** No crash, no phantom "null" or empty space where offer would be.

---

## Section 8: Orchestrator Integration

### Test 8.1: `useCompositor` flag is respected
Verify that when `config.useCompositor` is `false` (or undefined), the orchestrator follows the EXISTING path — no compositor called, text instructions in prompt, QA checks text.

```typescript
// This is a code review check, not a runtime test.
// In orchestrate-batch.ts, verify:
// 1. The compositor import exists
// 2. There is a conditional: if (config.useCompositor) { ... }
// 3. The ELSE branch is the existing code, UNCHANGED
// 4. The compositor is ONLY called inside the if-true branch
```
**Verification:** Read orchestrate-batch.ts. The existing path MUST be untouched when `useCompositor` is falsy. This is a non-negotiable — breaking the existing pipeline is a ship-blocker.

### Test 8.2: Clean canvas prompt is shorter
```typescript
import { buildCleanCanvasPrompt, buildGeminiStaticAdPrompt } from './gemini-static-ad-prompt';

test('clean canvas prompt is significantly shorter than full prompt', () => {
  const params = { /* same BuildGeminiStaticAdPromptParams for both */ };
  
  const fullPrompt = buildGeminiStaticAdPrompt(params);
  const cleanPrompt = buildCleanCanvasPrompt(params);
  
  // Clean prompt should be at most 50% the length of full prompt
  expect(cleanPrompt.length).toBeLessThan(fullPrompt.length * 0.5);
  
  // Clean prompt must NOT contain text rendering instructions
  expect(cleanPrompt.toLowerCase()).not.toContain('headline:');
  expect(cleanPrompt.toLowerCase()).not.toContain('subheadline:');
  expect(cleanPrompt.toLowerCase()).not.toContain('cta button text:');
  expect(cleanPrompt.toLowerCase()).not.toContain('the only marketing copy allowed');
  
  // Clean prompt MUST contain the clean canvas instruction
  expect(cleanPrompt.toLowerCase()).toContain('clean canvas');
  expect(cleanPrompt.toLowerCase()).toContain('do not render any text');
  
  // Clean prompt should still have brand context and style direction
  expect(cleanPrompt).toContain(params.brandContext.clientName);
  expect(cleanPrompt).toContain(params.productService);
});
```
**Expected:** Clean prompt is <50% the size of full prompt. Contains no text rendering instructions. Contains clean canvas mode instruction.

### Test 8.3: `useCompositor` in AdGenerationConfig type
```typescript
// Type check: verify the field exists and is optional
const config: AdGenerationConfig = {
  aspectRatio: '1:1',
  productService: 'Test',
  offer: '',
  onScreenText: { headline: 'X', subheadline: 'Y', cta: 'Z' },
  templateIds: [],
  useCompositor: true, // This must compile without error
};

const configWithout: AdGenerationConfig = {
  aspectRatio: '1:1',
  productService: 'Test',
  offer: '',
  onScreenText: { headline: 'X', subheadline: 'Y', cta: 'Z' },
  templateIds: [],
  // useCompositor omitted — must still be valid
};
```
**Expected:** Both configs compile. `useCompositor` is optional.

---

## Section 9: Intelligence Loop — Feedback Collector

### Test 9.1: Feedback is recorded on favorite
```typescript
// Integration test against Supabase
test('recordCreativeFeedback stores favorite signal with snapshot', async () => {
  // Setup: create a test client and creative in the database
  // ... (use existing test utilities or create directly via admin client)
  
  await recordCreativeFeedback({
    clientId: testClientId,
    creativeId: testCreativeId,
    signalType: 'favorite',
  });
  
  const { data } = await admin
    .from('ad_creative_feedback')
    .select('*')
    .eq('creative_id', testCreativeId)
    .eq('signal_type', 'favorite')
    .single();
  
  expect(data).not.toBeNull();
  expect(data.creative_snapshot).toBeDefined();
  expect(data.creative_snapshot.template_source).toBeTruthy();
  expect(data.creative_snapshot.on_screen_text).toBeDefined();
  expect(data.creative_snapshot.qa_passed).toBeDefined();
});
```
**Expected:** Feedback row created with full creative snapshot.

### Test 9.2: Feedback survives creative deletion
```typescript
test('delete feedback is recorded BEFORE creative is removed', async () => {
  // 1. Create test creative
  // 2. Call recordCreativeFeedback with 'delete'
  // 3. Delete the creative
  // 4. Query feedback table
  
  const { data } = await admin
    .from('ad_creative_feedback')
    .select('*')
    .eq('creative_id', testCreativeId)
    .eq('signal_type', 'delete')
    .single();
  
  expect(data).not.toBeNull();
  expect(data.creative_snapshot.template_source).toBeTruthy(); // Snapshot preserved
  
  // Creative itself should be gone
  const { data: creative } = await admin
    .from('ad_creatives')
    .select('*')
    .eq('id', testCreativeId)
    .maybeSingle();
  
  expect(creative).toBeNull(); // Deleted
});
```
**Expected:** Feedback row exists with snapshot even though the creative is deleted. This is the whole point — we learn from deletions.

### Test 9.3: Prompt truncation
```typescript
test('creative snapshot truncates prompt to 2000 chars', async () => {
  // Create a creative with a very long prompt (typical: 3000-4000 chars)
  const longPrompt = 'A'.repeat(5000);
  // ... insert creative with prompt_used = longPrompt
  
  await recordCreativeFeedback({
    clientId: testClientId,
    creativeId: testCreativeId,
    signalType: 'favorite',
  });
  
  const { data } = await admin
    .from('ad_creative_feedback')
    .select('creative_snapshot')
    .eq('creative_id', testCreativeId)
    .single();
  
  expect(data.creative_snapshot.prompt_used.length).toBeLessThanOrEqual(2000);
});
```
**Expected:** Prompt is capped at 2000 chars, not stored in full.

---

## Section 10: Intelligence Loop — Style Memory and Analysis

### Test 10.1: Style memory stores and retrieves
```typescript
test('storeStyleMemory and getLatestStyleMemory round-trip', async () => {
  const analysis: WinnerAnalysis = {
    clientId: testClientId,
    analyzedAt: new Date().toISOString(),
    sampleSize: { winners: 8, losers: 12, total: 25 },
    patterns: {
      preferredStyles: ['headline', 'soft-gradient-product'],
      avoidStyles: ['faux-iphone-notes', 'ugly-ad'],
      colorInsights: 'Dark backgrounds win',
      compositionInsights: 'Product-forward wins',
      copyInsights: 'Short headlines with numbers',
      avoidPatterns: 'Editorial/magazine layouts',
      styleDirectionSummary: 'Product-forward composition, dark backgrounds, bright CTA.',
    },
    confidence: 'medium',
  };
  
  await storeStyleMemory(analysis);
  
  const retrieved = await getLatestStyleMemory(testClientId);
  expect(retrieved).not.toBeNull();
  expect(retrieved!.preferredSlugs).toEqual(['headline', 'soft-gradient-product']);
  expect(retrieved!.avoidSlugs).toEqual(['faux-iphone-notes', 'ugly-ad']);
  expect(retrieved!.confidence).toBe('medium');
  expect(retrieved!.version).toBe(1);
});
```
**Expected:** Full round-trip works, version starts at 1.

### Test 10.2: Style memory versions increment
```typescript
test('multiple analyses produce incrementing versions', async () => {
  await storeStyleMemory(analysis1);
  await storeStyleMemory(analysis2);
  
  const latest = await getLatestStyleMemory(testClientId);
  expect(latest!.version).toBe(2);
  
  // Both versions should exist in the table
  const { data } = await admin
    .from('ad_style_memory')
    .select('version')
    .eq('client_id', testClientId)
    .order('version', { ascending: true });
  
  expect(data!.map(d => d.version)).toEqual([1, 2]);
});
```
**Expected:** Versions are 1 and 2, both preserved. Latest returns v2.

### Test 10.3: Empty feedback returns null analysis
```typescript
test('getLatestStyleMemory returns null for client with no feedback', async () => {
  const memory = await getLatestStyleMemory('nonexistent-client-id');
  expect(memory).toBeNull();
});
```
**Expected:** Null, not a throw.

### Test 10.4: Re-analysis triggers correctly
```typescript
test('shouldReanalyze returns true when stale or enough new feedback', async () => {
  // No prior analysis
  expect(await shouldReanalyze(testClientId)).toBe(true);
  
  // After fresh analysis with no new feedback
  await storeStyleMemory(freshAnalysis);
  expect(await shouldReanalyze(testClientId)).toBe(false);
  
  // After 10+ new feedback signals
  for (let i = 0; i < 11; i++) {
    await recordCreativeFeedback({ clientId: testClientId, creativeId: `fake-${i}`, signalType: 'favorite' });
  }
  expect(await shouldReanalyze(testClientId)).toBe(true);
});
```
**Expected:** Triggers on no prior analysis, no trigger when fresh, triggers again after 10+ new signals.

---

## Section 11: Intelligence Loop — Prompt Injection

### Test 11.1: Style direction is injected when memory exists
```typescript
test('orchestrator injects style memory into prompt', async () => {
  // Setup: store style memory for test client
  await storeStyleMemory({
    clientId: testClientId,
    patterns: {
      styleDirectionSummary: 'Product-forward, dark backgrounds, bright orange CTA.',
      // ...
    },
    // ...
  });
  
  // Verify getLatestStyleMemory returns the direction
  const memory = await getLatestStyleMemory(testClientId);
  expect(memory!.styleDirection).toContain('Product-forward');
  
  // The orchestrator should prepend this to the style direction array
  // This is a code review check: verify orchestrate-batch.ts includes:
  // const styleMemory = await getLatestStyleMemory(typedBatch.client_id);
  // const intelligenceStyleDirection = styleMemory?.styleDirection ?? '';
  // And that intelligenceStyleDirection is included in the styleDirection array
});
```
**Expected:** Style direction from memory appears in the prompt assembly.

### Test 11.2: No memory = no injection (graceful)
```typescript
test('orchestrator works normally with no style memory', async () => {
  const memory = await getLatestStyleMemory('client-with-no-history');
  expect(memory).toBeNull();
  
  // The orchestrator should still generate without errors
  // intelligenceStyleDirection = '' means it's filtered out by .filter(Boolean)
});
```
**Expected:** No memory = empty string = filtered out. No impact on existing flow.

### Test 11.3: Template annotation
```typescript
test('annotateNanoCatalogWithIntelligence marks preferred and avoid', () => {
  const catalog = [
    { slug: 'headline', name: 'Headline', /* ... */ },
    { slug: 'ugly-ad', name: 'Ugly ad', /* ... */ },
    { slug: 'split-screen', name: 'Split screen', /* ... */ },
  ];
  
  const memory = { preferredSlugs: ['headline'], avoidSlugs: ['ugly-ad'] };
  
  const annotated = annotateNanoCatalogWithIntelligence(catalog as any, memory);
  
  expect(annotated.find(e => e.slug === 'headline')!.intelligence).toBe('preferred');
  expect(annotated.find(e => e.slug === 'ugly-ad')!.intelligence).toBe('avoid');
  expect(annotated.find(e => e.slug === 'split-screen')!.intelligence).toBeUndefined();
});
```
**Expected:** Preferred/avoid badges applied correctly. Neutral templates have no badge.

---

## Section 12: Database Migrations

### Test 12.1: Migration runs without errors
```bash
# Run the migration against a fresh database
npx supabase db reset
# OR
npx supabase migration up
```
**Expected:** No SQL errors. All tables and indexes created.

### Test 12.2: Tables exist with correct columns
```sql
-- Verify ad_creative_feedback
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'ad_creative_feedback' ORDER BY ordinal_position;

-- Expected columns: id, client_id, creative_id, batch_id, signal_type, creative_snapshot, brand_snapshot, created_at

-- Verify ad_style_memory
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'ad_style_memory' ORDER BY ordinal_position;

-- Expected columns: id, client_id, analyzed_at, sample_size, patterns, confidence, style_direction, preferred_slugs, avoid_slugs, version, created_at

-- Verify metrics column on batches
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'ad_generation_batches' AND column_name = 'metrics';
```
**Expected:** All columns exist with correct types.

### Test 12.3: Foreign key cascades work
```sql
-- Deleting a client should cascade to feedback and style memory
DELETE FROM clients WHERE id = 'test-client-id';
-- Verify no orphaned rows in ad_creative_feedback or ad_style_memory
```
**Expected:** Cascading delete removes all related intelligence data.

---

## Section 13: Visual Regression Checklist

After ALL automated tests pass, generate test images for manual visual review:

1. [ ] `/tmp/compositor-test-1x1.png` — Square ad, left_stack layout, with offer
2. [ ] `/tmp/compositor-test-4x5.png` — Portrait ad, check text proportions
3. [ ] `/tmp/compositor-test-9x16.png` — Story ad, tall format, check text isn't tiny
4. [ ] `/tmp/compositor-test-16x9.png` — Landscape, check layout uses width well
5. [ ] `/tmp/compositor-test-1.91x1.png` — Facebook format, tight height, check nothing is cut off
6. [ ] `/tmp/compositor-test-overlay-white.png` — White background with overlay gradient, text must be readable
7. [ ] `/tmp/compositor-test-no-offer.png` — No offer line, check spacing is clean (no empty gap)

For each image verify:
- [ ] Headline is fully visible, no clipping
- [ ] Subheadline is fully visible and readable at smaller size
- [ ] CTA is a proper button shape with readable text
- [ ] Offer line (when present) is visible and correctly positioned
- [ ] Logo (when present) is correctly sized and positioned
- [ ] No overlapping elements
- [ ] Text has sufficient contrast against background
- [ ] Overall composition looks like a real ad, not a test

---

## Section 14: Final Integration Smoke Test

The ultimate test: run a real batch through the full pipeline.

```typescript
// 1. Pick a client with existing Brand DNA
// 2. Set useCompositor: true in generation config
// 3. Generate 4 creatives (2 Nano Banana styles, 2 variations each)
// 4. Verify:
//    a. All 4 generate successfully
//    b. QA first-pass rate is 100% (no text issues possible)
//    c. Text on all 4 is perfectly rendered (visual check)
//    d. Prompt used is <50% length of non-compositor prompt
//    e. Generation time is similar or faster than non-compositor
// 5. Favorite 2, delete 1, download 1
// 6. Verify:
//    a. 4 feedback rows created
//    b. Snapshots contain correct data
//    c. Deleted creative's feedback survives deletion
// 7. Trigger analysis
// 8. Verify:
//    a. Style memory created with version 1
//    b. Has preferred and avoid slugs
//    c. Style direction is non-empty
```

If this smoke test passes end-to-end, the system is ready for the UI toggle rollout.

---

## Exit Criteria

The implementation is COMPLETE when:

- [ ] All Section 1-13 tests pass
- [ ] Section 14 smoke test passes end-to-end
- [ ] Visual regression images look like real ads
- [ ] `useCompositor: false` (default) path is completely unchanged
- [ ] No new npm dependencies added
- [ ] Typecheck passes: `npx tsc --noEmit`
- [ ] Lint passes: `npx next lint`
- [ ] Build succeeds: `npx next build`
