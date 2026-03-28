import sharp from 'sharp';
import type { BrandColor } from '@/lib/knowledge/types';
import { resolveBrandFonts } from '@/lib/ad-creatives/resolve-fonts';
import { bestTextColor } from '@/lib/ad-creatives/compositor/color-utils';
import {
  computeLayout,
  detectArchetype,
  gradientPosition,
  needsGradientOverlay,
} from '@/lib/ad-creatives/compositor/layout-engine';
import { renderCtaToPng } from '@/lib/ad-creatives/compositor/cta-renderer';
import { renderLogoForComposite } from '@/lib/ad-creatives/compositor/logo-renderer';
import { renderTextToPng } from '@/lib/ad-creatives/compositor/text-renderer';
import type { CompositeAdParams, CompositeResult } from '@/lib/ad-creatives/compositor/types';

export type { CompositeAdParams, CompositeResult } from '@/lib/ad-creatives/compositor/types';
export { DEFAULT_COMPOSITOR_PROMPT_SCHEMA } from '@/lib/ad-creatives/compositor/types';

function findAccentHex(colors: BrandColor[]): string {
  const accent = colors.find((c) => c.role === 'accent');
  if (accent?.hex) return accent.hex;
  const primary = colors.find((c) => c.role === 'primary');
  if (primary?.hex) return primary.hex;
  const first = colors.find((c) => c.hex);
  if (first?.hex) return first.hex;
  return '#111111';
}

async function buildGradientOverlay(
  width: number,
  height: number,
  position: 'top' | 'bottom',
): Promise<Buffer> {
  const gradientSvg =
    position === 'bottom'
      ? `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="black" stop-opacity="0"/>
      <stop offset="45%" stop-color="black" stop-opacity="0"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.72"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
</svg>`
      : `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="black" stop-opacity="0"/>
      <stop offset="45%" stop-color="black" stop-opacity="0"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.72"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
</svg>`;

  return sharp(Buffer.from(gradientSvg)).png().toBuffer();
}

function textColorForArchetype(archetype: string, overlay: boolean): string {
  if (overlay) return '#FFFFFF';
  return '#111111';
}

/**
 * Composite clean AI background + text, CTA, optional logo (PRD Phase 6).
 */
export async function compositeAdCreative(params: CompositeAdParams): Promise<CompositeResult> {
  const {
    backgroundImage,
    brandContext,
    onScreenText,
    offer,
    promptSchema,
    width,
    height,
    aspectRatio: _aspectRatio,
  } = params;
  void _aspectRatio;

  const archetype = detectArchetype(promptSchema);
  const layout = computeLayout(archetype, width, height, !!offer?.trim());
  const overlay = needsGradientOverlay(archetype);
  const gradPos = gradientPosition(archetype);

  const fonts = await resolveBrandFonts(brandContext.visualIdentity.fonts);
  const accent = findAccentHex(brandContext.visualIdentity.colors ?? []);
  const ctaTextColor = bestTextColor(accent);
  const bodyColor = textColorForArchetype(archetype, overlay);

  const headlineMaxW = Math.round(layout.headline.width * width);
  const headlineMaxH = Math.round(layout.headline.height * height);
  const subMaxW = Math.round(layout.subheadline.width * width);
  const subMaxH = Math.round(layout.subheadline.height * height);
  const ctaMaxW = Math.min(Math.round(layout.cta.width * width), Math.round(width * 0.45));
  const offerMaxW = layout.offer
    ? Math.round(layout.offer.width * width)
    : 0;
  const offerMaxH = layout.offer ? Math.round(layout.offer.height * height) : 0;

  const fontSizeCta = Math.round(height * 0.03);

  const [gradientPng, headlinePng, subPng, offerPng, ctaPng, logoResult] = await Promise.all([
    overlay ? buildGradientOverlay(width, height, gradPos) : Promise.resolve(null),
    renderTextToPng({
      text: onScreenText.headline,
      font: fonts.display,
      canvasHeight: height,
      maxWidth: headlineMaxW,
      maxHeight: headlineMaxH,
      color: bodyColor,
      align: 'center',
      role: 'headline',
    }),
    renderTextToPng({
      text: onScreenText.subheadline,
      font: fonts.body,
      canvasHeight: height,
      maxWidth: subMaxW,
      maxHeight: subMaxH,
      color: bodyColor,
      align: 'center',
      role: 'subheadline',
    }),
    offer?.trim()
      ? renderTextToPng({
          text: offer.trim(),
          font: fonts.body,
          canvasHeight: height,
          maxWidth: offerMaxW,
          maxHeight: offerMaxH,
          color: bodyColor,
          align: 'center',
          role: 'offer',
        })
      : Promise.resolve(null),
    renderCtaToPng({
      text: onScreenText.cta,
      font: fonts.body,
      fontSize: fontSizeCta,
      textColor: ctaTextColor,
      backgroundColor: accent,
      buttonShape: promptSchema.ctaStyle.buttonShape,
      maxWidth: ctaMaxW,
    }),
    renderLogoForComposite(brandContext, width, height),
  ]);

  const composites: sharp.OverlayOptions[] = [];

  if (gradientPng) {
    composites.push({ input: gradientPng, left: 0, top: 0, blend: 'over' });
  }

  if (logoResult) {
    const lx = Math.round(layout.logo.x * width);
    const ly = Math.round(layout.logo.y * height);
    composites.push({ input: logoResult.buffer, left: lx, top: ly, blend: 'over' });
  }

  const place = (buf: Buffer, zone: { x: number; y: number; width: number; height: number }) => {
    const left = Math.round(zone.x * width);
    const top = Math.round(zone.y * height);
    composites.push({ input: buf, left, top, blend: 'over' });
  };

  place(headlinePng.buffer, layout.headline);
  place(subPng.buffer, layout.subheadline);
  if (offerPng && layout.offer) {
    place(offerPng.buffer, layout.offer);
  }
  place(ctaPng.buffer, layout.cta);

  const base = await sharp(backgroundImage)
    .resize(width, height, { fit: 'cover' })
    .png()
    .toBuffer();

  const image = await sharp(base).composite(composites).png().toBuffer();

  return {
    image,
    metadata: {
      layoutArchetype: archetype,
      fontsUsed: { display: fonts.display.name, body: fonts.body.name },
      ctaBackgroundColor: accent,
      ctaTextColor,
      logoPlaced: !!logoResult,
      gradientOverlayApplied: overlay,
    },
  };
}
