import type { AdPromptSchema } from '@/lib/ad-creatives/types';
import type { CompositeLayout, ElementZone, LayoutArchetype } from '@/lib/ad-creatives/compositor/types';

const MARGIN = 0.06;
const ELEMENT_GAP = 0.025;
export const LOGO_MAX_WIDTH_FRAC = 0.18;
export const LOGO_MAX_HEIGHT_FRAC = 0.08;
const CTA_MAX_WIDTH_FRAC = 0.45;

export function detectArchetype(schema: AdPromptSchema): LayoutArchetype {
  const tp = schema.layout.textPosition.toLowerCase();
  const vh = schema.layout.visualHierarchy.toLowerCase();
  const text = `${tp} ${vh}`;

  const hasStack =
    /\bstack\b/.test(text) || /\bcolumn\b/.test(text) || /\bstacked\b/.test(text);

  // Prefer explicit column in textPosition so "hero left" in copy doesn't steal right-column layouts.
  if (tp.includes('right column') && hasStack) return 'right_stack';
  if (tp.includes('left column') && hasStack) return 'left_stack';
  if (/\bleft\b/.test(text) && hasStack) return 'left_stack';
  if (/\bright\b/.test(text) && hasStack) return 'right_stack';
  // Use textPosition so "hero top … text bottom" does not also match top_text (both contain top + hero…bottom).
  if (tp.includes('top section') && /\bhero\b.*\bbottom\b/.test(text)) return 'top_text';
  if (tp.includes('bottom section') && /\bhero\b.*\btop\b/.test(text)) return 'bottom_text';
  if (/\bcenter\b|\boverlay\b/.test(text)) return 'center_overlay';

  return 'full_overlay';
}

export function needsGradientOverlay(archetype: LayoutArchetype): boolean {
  return archetype === 'center_overlay' || archetype === 'full_overlay';
}

export function gradientPosition(
  archetype: LayoutArchetype,
): 'top' | 'bottom' {
  return archetype === 'top_text' ? 'top' : 'bottom';
}

function zone(
  x: number,
  y: number,
  width: number,
  height: number,
): ElementZone {
  return { x, y, width, height };
}

/**
 * Compute element zones (fractions 0–1 of canvas width/height).
 */
export function computeLayout(
  archetype: LayoutArchetype,
  width: number,
  height: number,
  hasOffer: boolean,
): CompositeLayout {
  const _w = width;
  const _h = height;
  void _w;
  void _h;

  const textW = 0.88;
  const leftX = MARGIN;
  const rightX = 1 - MARGIN - 0.42;

  switch (archetype) {
    case 'left_stack': {
      const headlineH = 0.12;
      const subH = 0.08;
      const offerH = hasOffer ? 0.05 : 0;
      let y = 0.28;
      const h1 = zone(leftX, y, 0.42, headlineH);
      y += headlineH + ELEMENT_GAP;
      const h2 = zone(leftX, y, 0.42, subH);
      y += subH + ELEMENT_GAP;
      const offer = hasOffer ? zone(leftX, y, 0.42, offerH) : null;
      if (offer) y += offerH + ELEMENT_GAP;
      const cta = zone(leftX, y, CTA_MAX_WIDTH_FRAC, 0.1);
      const logo = zone(MARGIN, MARGIN, LOGO_MAX_WIDTH_FRAC, LOGO_MAX_HEIGHT_FRAC);
      return { headline: h1, subheadline: h2, cta, offer, logo };
    }
    case 'right_stack': {
      const headlineH = 0.12;
      const subH = 0.08;
      const offerH = hasOffer ? 0.05 : 0;
      let y = 0.28;
      const h1 = zone(rightX, y, 0.42, headlineH);
      y += headlineH + ELEMENT_GAP;
      const h2 = zone(rightX, y, 0.42, subH);
      y += subH + ELEMENT_GAP;
      const offer = hasOffer ? zone(rightX, y, 0.42, offerH) : null;
      if (offer) y += offerH + ELEMENT_GAP;
      const cta = zone(rightX, y, CTA_MAX_WIDTH_FRAC, 0.1);
      const logo = zone(1 - MARGIN - LOGO_MAX_WIDTH_FRAC, MARGIN, LOGO_MAX_WIDTH_FRAC, LOGO_MAX_HEIGHT_FRAC);
      return { headline: h1, subheadline: h2, cta, offer, logo };
    }
    case 'top_text': {
      const h1 = zone(MARGIN, 0.1, textW, 0.11);
      const h2 = zone(MARGIN, 0.22, textW, 0.08);
      const offerY = 0.32;
      const offer = hasOffer ? zone(MARGIN, offerY, textW, 0.05) : null;
      const cta = zone((1 - CTA_MAX_WIDTH_FRAC) / 2, 0.88 - 0.12, CTA_MAX_WIDTH_FRAC, 0.1);
      const logo = zone(MARGIN, MARGIN, LOGO_MAX_WIDTH_FRAC, LOGO_MAX_HEIGHT_FRAC);
      return { headline: h1, subheadline: h2, cta, offer, logo };
    }
    case 'bottom_text':
    case 'center_overlay':
    case 'full_overlay':
    default: {
      // Content lives in the lower 60% of the canvas (y: 0.40 to 0.94)
      // Hero gets top 40%, 6% bottom margin
      const zoneTop = 0.40;
      const zoneBottom = 0.94;
      const zoneHeight = zoneBottom - zoneTop;

      const headlineH = 0.11;
      const subH = 0.08;
      const offerH = hasOffer ? 0.045 : 0;
      const ctaH = 0.1;
      const gaps = 2 + (hasOffer ? 1 : 0);

      const totalContentH = headlineH + subH + offerH + ctaH + (gaps * ELEMENT_GAP);

      // Center the content block within the zone
      const contentTop = zoneTop + (zoneHeight - totalContentH) / 2;

      // ALL elements share the same centered x and width so they sit on one axis.
      // Text elements use the full textW, CTA uses the same zone (placeCentered handles button centering).
      const centerX = (1 - textW) / 2; // center the text zone on the canvas

      let y = contentTop;
      const h1 = zone(centerX, y, textW, headlineH);
      y += headlineH + ELEMENT_GAP;
      const h2 = zone(centerX, y, textW, subH);
      y += subH + ELEMENT_GAP;
      const offer = hasOffer ? zone(centerX, y, textW, offerH) : null;
      if (offer) y += offerH + ELEMENT_GAP;
      // CTA uses same zone width so placeCentered centers the smaller button within it
      const cta = zone(centerX, y, textW, ctaH);
      const logo = zone(1 - MARGIN - LOGO_MAX_WIDTH_FRAC, MARGIN, LOGO_MAX_WIDTH_FRAC, LOGO_MAX_HEIGHT_FRAC);
      return { headline: h1, subheadline: h2, cta, offer, logo };
    }
  }
}
