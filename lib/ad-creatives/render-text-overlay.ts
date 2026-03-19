// ---------------------------------------------------------------------------
// Static Ad Generation — Text Overlay Renderer
// ---------------------------------------------------------------------------
// Uses satori to render brand-accurate text as SVG, then resvg to rasterize
// to a transparent PNG. This overlay is composited onto the Gemini base image.
// ---------------------------------------------------------------------------

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import type { ResolvedFont } from './resolve-fonts';

export interface TextOverlayConfig {
  width: number;
  height: number;
  headline: string;
  subheadline: string;
  cta: string;
  offer: string | null;
  brandName: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    background: string;
  };
  fonts: {
    display: ResolvedFont;
    body: ResolvedFont;
  };
  layout: 'top' | 'center' | 'bottom';
}

/**
 * Render a transparent PNG text overlay with brand fonts, colors, and layout.
 * Returns a Buffer of the PNG with alpha channel.
 */
export async function renderTextOverlay(config: TextOverlayConfig): Promise<Buffer> {
  const { width, height, headline, subheadline, cta, offer, brandName, colors, fonts, layout } =
    config;

  // Determine vertical alignment
  const justifyContent = layout === 'top' ? 'flex-start' : layout === 'center' ? 'center' : 'flex-end';

  // Gradient direction — gradient appears behind text for legibility
  const gradientDirection =
    layout === 'top' ? 'to bottom' : layout === 'center' ? 'to bottom' : 'to top';

  // Scale font sizes relative to image width
  const scale = width / 1080;
  const headlineSize = Math.round(48 * scale);
  const subheadlineSize = Math.round(24 * scale);
  const ctaSize = Math.round(20 * scale);
  const offerSize = Math.round(16 * scale);
  const brandNameSize = Math.round(14 * scale);
  const padding = Math.round(48 * scale);
  const ctaPaddingH = Math.round(32 * scale);
  const ctaPaddingV = Math.round(14 * scale);
  const ctaRadius = Math.round(8 * scale);
  const offerPaddingH = Math.round(16 * scale);
  const offerPaddingV = Math.round(6 * scale);
  const offerRadius = Math.round(20 * scale);
  const gap = Math.round(16 * scale);

  // Build children elements
  const children: SatoriElement[] = [];

  // Offer badge
  if (offer) {
    children.push({
      type: 'div',
      props: {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.accent,
          borderRadius: offerRadius,
          paddingLeft: offerPaddingH,
          paddingRight: offerPaddingH,
          paddingTop: offerPaddingV,
          paddingBottom: offerPaddingV,
          marginBottom: gap,
        },
        children: {
          type: 'span',
          props: {
            style: {
              fontFamily: fonts.body.name,
              fontSize: offerSize,
              fontWeight: 600,
              color: '#FFFFFF',
            },
            children: offer,
          },
        },
      },
    });
  }

  // Headline
  children.push({
    type: 'span',
    props: {
      style: {
        fontFamily: fonts.display.name,
        fontSize: headlineSize,
        fontWeight: fonts.display.weight,
        color: '#FFFFFF',
        lineHeight: 1.15,
        marginBottom: gap,
        textShadow: '0 2px 8px rgba(0,0,0,0.5)',
      },
      children: headline,
    },
  });

  // Subheadline
  children.push({
    type: 'span',
    props: {
      style: {
        fontFamily: fonts.body.name,
        fontSize: subheadlineSize,
        fontWeight: fonts.body.weight,
        color: 'rgba(255,255,255,0.9)',
        lineHeight: 1.4,
        marginBottom: Math.round(gap * 1.5),
        textShadow: '0 1px 4px rgba(0,0,0,0.4)',
      },
      children: subheadline,
    },
  });

  // CTA button
  children.push({
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accent,
        borderRadius: ctaRadius,
        paddingLeft: ctaPaddingH,
        paddingRight: ctaPaddingH,
        paddingTop: ctaPaddingV,
        paddingBottom: ctaPaddingV,
        marginBottom: Math.round(gap * 1.5),
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      },
      children: {
        type: 'span',
        props: {
          style: {
            fontFamily: fonts.body.name,
            fontSize: ctaSize,
            fontWeight: 700,
            color: '#FFFFFF',
            letterSpacing: '0.02em',
          },
          children: cta,
        },
      },
    },
  });

  // Brand name
  children.push({
    type: 'span',
    props: {
      style: {
        fontFamily: fonts.body.name,
        fontSize: brandNameSize,
        fontWeight: 400,
        color: 'rgba(255,255,255,0.7)',
        letterSpacing: '0.05em',
        textTransform: 'uppercase' as const,
      },
      children: brandName,
    },
  });

  // Root element — full canvas with gradient background for text legibility
  const root: SatoriElement = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent,
        alignItems: 'flex-start',
        width: '100%',
        height: '100%',
        padding,
        backgroundImage: `linear-gradient(${gradientDirection}, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)`,
      },
      children,
    },
  };

  // Render to SVG with satori
  const svg = await satori(root as never, {
    width,
    height,
    fonts: [
      { name: fonts.display.name, data: fonts.display.data, weight: fonts.display.weight as 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 },
      { name: fonts.body.name, data: fonts.body.data, weight: fonts.body.weight as 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 },
    ],
  });

  // Rasterize SVG → PNG with transparency
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
  });
  const pngData = resvg.render();
  return Buffer.from(pngData.asPng());
}

// ---------------------------------------------------------------------------
// Satori element type (JSX-like object syntax)
// ---------------------------------------------------------------------------

interface SatoriElement {
  type: string;
  props: {
    style?: Record<string, unknown>;
    children?: SatoriElement | SatoriElement[] | string;
    [key: string]: unknown;
  };
}
