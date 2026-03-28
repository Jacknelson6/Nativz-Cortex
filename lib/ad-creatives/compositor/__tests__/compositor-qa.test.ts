/**
 * Cortex compositor QA — see docs/cortex-compositor-qa.md (Sections 1–7, 8.1, 8.3).
 * Section 8.2: clean canvas prompt length check. Sections 9–12 (intelligence loop DB) are not implemented; skipped.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, beforeEach } from 'vitest';
import sharp from 'sharp';
import satori from 'satori';
import type { BrandContext } from '@/lib/knowledge/brand-context';
import type { AdPromptSchema } from '@/lib/ad-creatives/types';
import type { AspectRatio } from '@/lib/ad-creatives/types';
import { resolveBrandFonts } from '@/lib/ad-creatives/resolve-fonts';
import { relativeLuminance, contrastRatio, bestTextColor } from '@/lib/ad-creatives/compositor/color-utils';
import { renderTextToPng, computeFontSize } from '@/lib/ad-creatives/compositor/text-renderer';
import { resolveButtonStyle, renderCtaToPng } from '@/lib/ad-creatives/compositor/cta-renderer';
import { fetchAndResizeLogoFromUrl, clearLogoFetchCache } from '@/lib/ad-creatives/compositor/logo-renderer';
import { detectArchetype, computeLayout } from '@/lib/ad-creatives/compositor/layout-engine';
import { compositeAdCreative } from '@/lib/ad-creatives/compositor/index';
import type { AdGenerationConfig } from '@/lib/ad-creatives/types';
import { buildCleanCanvasPrompt, buildGeminiStaticAdPrompt } from '@/lib/ad-creatives/gemini-static-ad-prompt';

const INTER_TTF =
  'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjQ.ttf';

async function loadInterFont(): Promise<ArrayBuffer> {
  const fontResponse = await fetch(INTER_TTF);
  expect(fontResponse.ok).toBe(true);
  return fontResponse.arrayBuffer();
}

function mockBrandContext(): BrandContext {
  return {
    fromGuideline: false,
    guidelineId: null,
    guidelineContent: null,
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
      logos: [],
      screenshots: [],
      designStyle: null,
    },
    verbalIdentity: {
      tonePrimary: 'Bold and direct',
      voiceAttributes: [],
      messagingPillars: [],
      vocabularyPatterns: [],
      avoidancePatterns: [],
    },
    products: [],
    audience: { summary: null },
    positioning: null,
    metadata: null,
    creativeSupplementBlock: '',
    creativeReferenceImageUrls: [],
    toPromptBlock: () => '',
    toFullContext: () => ({}) as never,
  };
}

function mockPromptSchema(overrides?: Partial<AdPromptSchema>): AdPromptSchema {
  return {
    layout: {
      textPosition: 'left column',
      imagePosition: 'right',
      ctaPosition: 'bottom-left',
      visualHierarchy: 'text-left stack with hero right',
    },
    composition: { backgroundType: 'solid', overlayStyle: 'none', borderTreatment: 'none' },
    typography: {
      headlineStyle: 'bold sans',
      subheadlineStyle: 'regular sans',
      ctaTextStyle: 'bold',
      fontPairingNotes: 'Inter',
    },
    colorStrategy: { dominantColors: ['#1a1a2e'], contrastApproach: 'high', accentUsage: 'CTA only' },
    imageryStyle: 'product_focused',
    emotionalTone: 'trust',
    ctaStyle: { buttonShape: 'rounded pill', position: 'bottom-left', textPattern: 'verb noun' },
    contentBlocks: [],
    ...overrides,
  };
}

describe('QA Section 1: Dependencies', () => {
  it('1.1 sharp can create a basic PNG', async () => {
    const buffer = await sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    const metadata = await sharp(buffer).metadata();
    expect(metadata.width).toBe(100);
    expect(metadata.height).toBe(100);
    expect(metadata.format).toBe('png');
  });

  it('1.2 satori can render text to SVG', async () => {
    const fontData = await loadInterFont();
    const svg = await satori(
      { type: 'div', props: { style: { color: 'white', fontSize: 32 }, children: 'Hello World' } } as never,
      {
        width: 400,
        height: 100,
        fonts: [{ name: 'Inter', data: fontData, weight: 400 }],
      },
    );

    expect(typeof svg).toBe('string');
    expect(svg).toContain('<svg');
    // Satori renders glyphs as paths — no literal "Hello" substring.
    expect(svg.length).toBeGreaterThan(200);
  });

  it('1.3 resolveBrandFonts returns valid font pair', async () => {
    const fonts = await resolveBrandFonts([
      { family: 'Inter', weight: '700', role: 'display' },
      { family: 'Inter', weight: '400', role: 'body' },
    ]);

    expect(fonts.display.data.byteLength).toBeGreaterThan(0);
    expect(fonts.body.data.byteLength).toBeGreaterThan(0);
    expect(fonts.display.weight).toBe(700);
    expect(fonts.body.weight).toBe(400);
  }, 20_000);

  it('1.4 resolveBrandFonts falls back for unknown fonts', async () => {
    const fonts = await resolveBrandFonts([{ family: 'ThisFontDoesNotExist12345', weight: '700', role: 'display' }]);

    expect(fonts.display.name).toBe('Inter');
    expect(fonts.display.data.byteLength).toBeGreaterThan(0);
  }, 20_000);
});

describe('QA Section 2: color-utils', () => {
  it('2.1 relative luminance', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 4);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 4);
    expect(relativeLuminance('#FF0000')).toBeCloseTo(0.2126, 2);
  });

  it('2.2 contrast ratio', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#888888', '#888888')).toBeCloseTo(1, 1);
    expect(contrastRatio('#FFFFFF', '#FFFF00')).toBeLessThan(2);
  });

  it('2.3 bestTextColor', () => {
    expect(bestTextColor('#000000')).toBe('#FFFFFF');
    expect(bestTextColor('#FFFFFF')).toBe('#000000');
    expect(bestTextColor('#1a1a2e')).toBe('#FFFFFF');
    expect(bestTextColor('#f5f5dc')).toBe('#000000');
    // Black vs white on orange — algorithm picks higher WCAG contrast (typically black).
    expect(['#FFFFFF', '#000000']).toContain(bestTextColor('#FF6B35'));
  });

  it('2.4 hex formats', () => {
    expect(relativeLuminance('#FFFFFF')).toBe(relativeLuminance('FFFFFF'));
    expect(relativeLuminance('#ffffff')).toBe(relativeLuminance('#FFFFFF'));
    expect(relativeLuminance('#fff')).toBe(relativeLuminance('#FFFFFF'));
  });
});

describe('QA Section 3: text-renderer', () => {
  it('3.1 renderTextToPng produces valid PNG', async () => {
    const fontData = await loadInterFont();
    const font = { name: 'Inter', data: fontData, weight: 700 };
    const result = await renderTextToPng({
      text: 'Test Headline',
      font,
      canvasHeight: 800,
      maxWidth: 600,
      maxHeight: 200,
      color: '#FFFFFF',
      align: 'left',
      role: 'headline',
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(0);

    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.format).toBe('png');
    expect(metadata.channels).toBe(4);
    expect(metadata.width).toBeLessThanOrEqual(600);
    expect(metadata.height).toBeLessThanOrEqual(200);
  }, 20_000);

  it('3.2 long text shrinks within bounds', async () => {
    const fontData = await loadInterFont();
    const font = { name: 'Inter', data: fontData, weight: 700 };
    const shortResult = await renderTextToPng({
      text: 'Short',
      font,
      canvasHeight: 400,
      maxWidth: 400,
      maxHeight: 100,
      color: '#FFFFFF',
      role: 'headline',
    });
    const longResult = await renderTextToPng({
      text: 'This Is A Much Longer Headline That Should Force Smaller Font Size',
      font,
      canvasHeight: 400,
      maxWidth: 400,
      maxHeight: 100,
      color: '#FFFFFF',
      role: 'headline',
    });

    expect(shortResult.buffer.length).toBeGreaterThan(0);
    expect(longResult.buffer.length).toBeGreaterThan(0);
    const longMeta = await sharp(longResult.buffer).metadata();
    expect(longMeta.height).toBeLessThanOrEqual(100);
  }, 20_000);

  it('3.3 empty string does not throw', async () => {
    const fontData = await loadInterFont();
    const font = { name: 'Inter', data: fontData, weight: 700 };
    const result = await renderTextToPng({
      text: '',
      font,
      canvasHeight: 800,
      maxWidth: 600,
      maxHeight: 200,
      color: '#FFFFFF',
      role: 'headline',
    });
    expect(result.buffer).toBeInstanceOf(Buffer);
  }, 15_000);

  it('3.4 special characters', async () => {
    const fontData = await loadInterFont();
    const font = { name: 'Inter', data: fontData, weight: 400 };
    for (const text of ['50% OFF!', '$9.99/mo', 'Buy 1 & Get 1', '"Best Ever"', 'Créme Brûlée']) {
      const result = await renderTextToPng({
        text,
        font,
        canvasHeight: 600,
        maxWidth: 500,
        maxHeight: 100,
        color: '#000000',
        role: 'headline',
      });
      expect(result.buffer.length).toBeGreaterThan(0);
    }
  }, 45_000);

  it('3.5 computeFontSize scales with canvas height', () => {
    const small = computeFontSize('headline', 628);
    const medium = computeFontSize('headline', 1080);
    const tall = computeFontSize('headline', 1920);

    expect(small).toBeLessThan(medium);
    expect(medium).toBeLessThan(tall);
    expect(small).toBeGreaterThanOrEqual(30);
    expect(tall).toBeLessThanOrEqual(150);
  });
});

describe('QA Section 4: cta-renderer', () => {
  it('4.1 renderCtaToPng produces PNG', async () => {
    const fontData = await loadInterFont();
    const font = { name: 'Inter', data: fontData, weight: 700 };
    const result = await renderCtaToPng({
      text: 'Shop Now',
      font,
      fontSize: 28,
      textColor: '#FFFFFF',
      backgroundColor: '#FF6B35',
      buttonShape: 'rounded pill',
      maxWidth: 400,
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.format).toBe('png');
    expect(metadata.channels).toBe(4);
    expect(metadata.width).toBeLessThanOrEqual(400);
    expect(metadata.height).toBeGreaterThan(0);
  }, 15_000);

  it('4.2 resolveButtonStyle maps shapes', () => {
    expect(resolveButtonStyle('rounded pill').borderRadius).toBe(999);
    expect(resolveButtonStyle('sharp rectangle').borderRadius).toBeLessThan(10);
    const soft = resolveButtonStyle('soft rounded');
    expect(soft.borderRadius).toBeGreaterThan(4);
    expect(soft.borderRadius).toBeLessThan(999);
    expect(resolveButtonStyle('').borderRadius).toBeGreaterThan(0);
    expect(resolveButtonStyle('banana').borderRadius).toBeGreaterThan(0);
  });

  it('4.3 CTA text contrast vs accent background', () => {
    const testColors = ['#FF6B35', '#1a1a2e', '#FFFFFF', '#00C853', '#FFD600', '#9C27B0'];
    for (const bg of testColors) {
      const textColor = bestTextColor(bg);
      const ratio = contrastRatio(textColor, bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('QA Section 5: logo-renderer', () => {
  const googleLogo =
    'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png';

  beforeEach(() => {
    clearLogoFetchCache();
  });

  it('5.1 fetch and resize logo', async () => {
    const result = await fetchAndResizeLogoFromUrl(googleLogo, 200, 80);
    expect(result).not.toBeNull();
    expect(result!.buffer).toBeInstanceOf(Buffer);
    const metadata = await sharp(result!.buffer).metadata();
    expect(metadata.width).toBeLessThanOrEqual(200);
    expect(metadata.height).toBeLessThanOrEqual(80);
    expect(metadata.channels).toBe(4);
  }, 20_000);

  it('5.2 bad URL returns null', async () => {
    const result = await fetchAndResizeLogoFromUrl('https://thisdomaindoesnotexist12345.com/logo.png', 200, 80);
    expect(result).toBeNull();
  }, 20_000);

  it('5.3 second fetch is faster (cache)', async () => {
    const t1 = Date.now();
    await fetchAndResizeLogoFromUrl(googleLogo, 200, 80);
    const first = Date.now() - t1;

    const t2 = Date.now();
    await fetchAndResizeLogoFromUrl(googleLogo, 200, 80);
    const second = Date.now() - t2;

    expect(second).toBeLessThan(first / 2);
  }, 30_000);
});

describe('QA Section 6: layout-engine', () => {
  it('6.1 detectArchetype classifies layouts', () => {
    const cases: [Partial<AdPromptSchema>, string][] = [
      [
        {
          layout: {
            textPosition: 'left column',
            visualHierarchy: 'text-left stack with hero right',
            imagePosition: 'right',
            ctaPosition: 'bottom-left',
          },
        },
        'left_stack',
      ],
      [
        {
          layout: {
            textPosition: 'right column',
            visualHierarchy: 'hero left, text stacked right',
            imagePosition: 'left',
            ctaPosition: 'bottom-right',
          },
        },
        'right_stack',
      ],
      [
        {
          layout: {
            textPosition: 'centered overlay',
            visualHierarchy: 'centered text over background',
            imagePosition: 'full-bleed',
            ctaPosition: 'center-bottom',
          },
        },
        'center_overlay',
      ],
      [
        {
          layout: {
            textPosition: 'top section',
            visualHierarchy: 'headline top, hero bottom',
            imagePosition: 'bottom',
            ctaPosition: 'mid-left',
          },
        },
        'top_text',
      ],
      [
        {
          layout: {
            textPosition: 'bottom section',
            visualHierarchy: 'hero top 60%, text bottom',
            imagePosition: 'top',
            ctaPosition: 'bottom-center',
          },
        },
        'bottom_text',
      ],
    ];

    for (const [schema, expected] of cases) {
      expect(detectArchetype(schema as AdPromptSchema)).toBe(expected);
    }
  });

  it('6.2 ambiguous → full_overlay', () => {
    const ambiguous = {
      layout: {
        textPosition: 'dynamic',
        visualHierarchy: 'balanced',
        imagePosition: 'adaptive',
        ctaPosition: 'optimal',
      },
    } as AdPromptSchema;
    expect(detectArchetype(ambiguous)).toBe('full_overlay');
  });

  it('6.3 zones within canvas', () => {
    const archetypes = [
      'left_stack',
      'right_stack',
      'center_overlay',
      'top_text',
      'bottom_text',
      'full_overlay',
    ] as const;
    const dimensions = [
      { w: 1080, h: 1080 },
      { w: 1080, h: 1350 },
      { w: 1080, h: 1920 },
      { w: 1920, h: 1080 },
      { w: 1200, h: 628 },
    ];

    for (const arch of archetypes) {
      for (const dim of dimensions) {
        const layout = computeLayout(arch, dim.w, dim.h, true);
        for (const key of Object.keys(layout) as (keyof typeof layout)[]) {
          const zone = layout[key];
          if (!zone) continue;
          expect(zone.x).toBeGreaterThanOrEqual(0);
          expect(zone.y).toBeGreaterThanOrEqual(0);
          expect(zone.x + zone.width).toBeLessThanOrEqual(1.001);
          expect(zone.y + zone.height).toBeLessThanOrEqual(1.001);
          expect(zone.width).toBeGreaterThan(0);
          expect(zone.height).toBeGreaterThan(0);
        }
      }
    }
  });

  it('6.4 no offer', () => {
    const layout = computeLayout('left_stack', 1080, 1080, false);
    expect(layout.offer).toBeNull();
    expect(layout.headline).toBeDefined();
    expect(layout.subheadline).toBeDefined();
    expect(layout.cta).toBeDefined();
    expect(layout.logo).toBeDefined();
  });

  it('6.5 headline / subheadline vertical order', () => {
    for (const arch of ['left_stack', 'center_overlay', 'bottom_text'] as const) {
      const layout = computeLayout(arch, 1080, 1080, true);
      const headlineBottom = layout.headline.y + layout.headline.height;
      const subheadlineTop = layout.subheadline.y;
      expect(subheadlineTop).toBeGreaterThanOrEqual(headlineBottom - 0.02);
    }
  });
});

describe('QA Section 7: compositeAdCreative', () => {
  const mockSchema = mockPromptSchema();

  it('7.1 end-to-end composite', async () => {
    const background = await sharp({
      create: { width: 1080, height: 1080, channels: 4, background: { r: 26, g: 26, b: 46, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const result = await compositeAdCreative({
      backgroundImage: background,
      brandContext: mockBrandContext(),
      onScreenText: {
        headline: 'Free Shipping Today',
        subheadline: 'On all orders over $50. No code needed.',
        cta: 'Shop Now',
      },
      offer: '20% OFF',
      promptSchema: mockSchema,
      width: 1080,
      height: 1080,
      aspectRatio: '1:1',
    });

    expect(result.image).toBeInstanceOf(Buffer);
    expect(result.image.length).toBeGreaterThan(100);

    const metadata = await sharp(result.image).metadata();
    expect(metadata.width).toBe(1080);
    expect(metadata.height).toBe(1080);
    expect(metadata.format).toBe('png');

    expect(result.metadata.layoutArchetype).toBe('left_stack');
    expect(result.metadata.fontsUsed.display).toBeTruthy();
    expect(result.metadata.ctaBackgroundColor).toBeTruthy();
  }, 60_000);

  const ASPECTS: { value: AspectRatio; width: number; height: number }[] = [
    { value: '1:1', width: 1080, height: 1080 },
    { value: '4:5', width: 1080, height: 1350 },
    { value: '9:16', width: 1080, height: 1920 },
    { value: '16:9', width: 1920, height: 1080 },
    { value: '1.91:1', width: 1200, height: 628 },
  ];

  it.each(ASPECTS)('7.2 dimensions $value', async ({ value, width, height }) => {
    const background = await sharp({
      create: { width, height, channels: 4, background: { r: 30, g: 30, b: 30, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const result = await compositeAdCreative({
      backgroundImage: background,
      brandContext: mockBrandContext(),
      onScreenText: { headline: 'Test', subheadline: 'Subheadline text here', cta: 'Buy Now' },
      offer: null,
      promptSchema: mockSchema,
      width,
      height,
      aspectRatio: value,
    });

    const meta = await sharp(result.image).metadata();
    expect(meta.width).toBe(width);
    expect(meta.height).toBe(height);
  }, 90_000);

  it('7.3 gradient on overlay layout', async () => {
    const background = await sharp({
      create: { width: 1080, height: 1080, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const overlaySchema = mockPromptSchema({
      layout: {
        textPosition: 'centered overlay',
        imagePosition: 'full-bleed',
        ctaPosition: 'center-bottom',
        visualHierarchy: 'centered text over background',
      },
    });

    const result = await compositeAdCreative({
      backgroundImage: background,
      brandContext: mockBrandContext(),
      onScreenText: {
        headline: 'White Background Test',
        subheadline: 'Text should still be readable',
        cta: 'Click Me',
      },
      offer: null,
      promptSchema: overlaySchema,
      width: 1080,
      height: 1080,
      aspectRatio: '1:1',
    });

    expect(result.metadata.gradientOverlayApplied).toBe(true);
  }, 60_000);

  it('7.4 offer null', async () => {
    const background = await sharp({
      create: { width: 1080, height: 1080, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const result = await compositeAdCreative({
      backgroundImage: background,
      brandContext: mockBrandContext(),
      onScreenText: { headline: 'No Offer Test', subheadline: 'Just headline sub and CTA', cta: 'Learn More' },
      offer: null,
      promptSchema: mockSchema,
      width: 1080,
      height: 1080,
      aspectRatio: '1:1',
    });

    expect(result.image).toBeInstanceOf(Buffer);
  }, 60_000);
});

describe('QA Section 8', () => {
  it('8.2 clean canvas prompt is ~60%+ shorter than full Gemini prompt (same inputs)', () => {
    const bc = mockBrandContext();
    const schema = mockPromptSchema();
    const onScreenText = { headline: 'Summer sale event', subheadline: 'Save on every order', cta: 'Shop now' };
    const params = {
      brandContext: bc,
      promptSchema: schema,
      productService: 'Premium widgets for home',
      offer: '20% off',
      onScreenText,
      aspectRatio: '1:1' as AspectRatio,
    };
    const full = buildGeminiStaticAdPrompt(params);
    const clean = buildCleanCanvasPrompt(params);
    expect(clean.length).toBeGreaterThan(200);
    expect(clean.length).toBeLessThan(full.length * 0.45);
  });

  it('8.1 orchestrate-batch only composites when useCompositor is true', () => {
    const orchestratePath = join(process.cwd(), 'lib/ad-creatives/orchestrate-batch.ts');
    const src = readFileSync(orchestratePath, 'utf8');
    expect(src).toContain('compositeAdCreative');
    expect(src).toMatch(/config\.useCompositor/);
    expect(src).toMatch(/const useCompositor = config\.useCompositor === true/);
    expect(src).toContain('if (useCompositor && imageBuffer)');
  });

  it('8.3 AdGenerationConfig accepts optional useCompositor', () => {
    const withFlag: AdGenerationConfig = {
      aspectRatio: '1:1',
      productService: 'Test',
      offer: '',
      onScreenText: { headline: 'X', subheadline: 'Y', cta: 'Z' },
      templateIds: [],
      useCompositor: true,
    };
    const without: AdGenerationConfig = {
      aspectRatio: '1:1',
      productService: 'Test',
      offer: '',
      onScreenText: { headline: 'X', subheadline: 'Y', cta: 'Z' },
      templateIds: [],
    };
    expect(withFlag.useCompositor).toBe(true);
    expect(without.useCompositor).toBeUndefined();
  });
});
