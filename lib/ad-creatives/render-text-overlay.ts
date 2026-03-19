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

export async function renderTextOverlay(config: TextOverlayConfig): Promise<Buffer> {
  const { width, height, headline, subheadline, cta, offer, brandName, colors, fonts, layout } =
    config;

  // Scale factors
  const s = width / 1080;
  const pad = Math.round(40 * s);
  const gap = Math.round(12 * s);

  // Font sizes
  const headlinePx = Math.round(52 * s);
  const subPx = Math.round(22 * s);
  const ctaPx = Math.round(18 * s);
  const offerPx = Math.round(15 * s);
  const brandPx = Math.round(13 * s);

  // CTA button
  const ctaPadH = Math.round(28 * s);
  const ctaPadV = Math.round(12 * s);
  const ctaRadius = Math.round(6 * s);

  // Offer pill
  const offerPadH = Math.round(14 * s);
  const offerPadV = Math.round(5 * s);
  const offerRadius = Math.round(16 * s);

  // Text content area sits at top or bottom ~40% of the image
  // with a subtle gradient fade behind it (not a heavy block)
  const textAreaHeight = Math.round(height * 0.42);
  const gradientStops = layout === 'top'
    ? 'rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0) 100%'
    : 'rgba(0,0,0,0) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.65) 100%';

  // Build the text content column
  const textChildren: SatoriElement[] = [];

  // Offer badge (above headline)
  if (offer) {
    textChildren.push({
      type: 'div',
      props: {
        style: {
          display: 'flex',
          alignItems: 'center',
          alignSelf: 'flex-start',
          backgroundColor: colors.primary,
          borderRadius: offerRadius,
          paddingLeft: offerPadH,
          paddingRight: offerPadH,
          paddingTop: offerPadV,
          paddingBottom: offerPadV,
          marginBottom: gap,
        },
        children: {
          type: 'span',
          props: {
            style: {
              fontFamily: fonts.body.name,
              fontSize: offerPx,
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
  textChildren.push({
    type: 'span',
    props: {
      style: {
        fontFamily: fonts.display.name,
        fontSize: headlinePx,
        fontWeight: fonts.display.weight,
        color: '#FFFFFF',
        lineHeight: 1.1,
        marginBottom: Math.round(gap * 0.6),
        textShadow: '0 2px 12px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.4)',
      },
      children: headline,
    },
  });

  // Subheadline
  textChildren.push({
    type: 'span',
    props: {
      style: {
        fontFamily: fonts.body.name,
        fontSize: subPx,
        fontWeight: fonts.body.weight,
        color: 'rgba(255,255,255,0.92)',
        lineHeight: 1.35,
        marginBottom: Math.round(gap * 1.2),
        textShadow: '0 1px 6px rgba(0,0,0,0.5)',
      },
      children: subheadline,
    },
  });

  // CTA button
  textChildren.push({
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'flex-start',
        backgroundColor: colors.primary,
        borderRadius: ctaRadius,
        paddingLeft: ctaPadH,
        paddingRight: ctaPadH,
        paddingTop: ctaPadV,
        paddingBottom: ctaPadV,
        boxShadow: '0 3px 10px rgba(0,0,0,0.25)',
      },
      children: {
        type: 'span',
        props: {
          style: {
            fontFamily: fonts.body.name,
            fontSize: ctaPx,
            fontWeight: 700,
            color: '#FFFFFF',
            letterSpacing: '0.04em',
            textTransform: 'uppercase' as const,
          },
          children: cta,
        },
      },
    },
  });

  // The text content column
  const textColumn: SatoriElement = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: layout === 'top' ? 'flex-start' : 'flex-end',
        alignItems: 'flex-start',
        paddingLeft: pad,
        paddingRight: pad,
        paddingTop: layout === 'top' ? pad : Math.round(pad * 0.5),
        paddingBottom: layout === 'bottom' ? Math.round(pad * 1.8) : Math.round(pad * 0.5),
        width: '100%',
        height: textAreaHeight,
      },
      children: textChildren,
    },
  };

  // Brand name watermark — always bottom-right, small and subtle
  const brandWatermark: SatoriElement = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        position: 'absolute',
        bottom: Math.round(14 * s),
        right: Math.round(16 * s),
      },
      children: {
        type: 'span',
        props: {
          style: {
            fontFamily: fonts.body.name,
            fontSize: brandPx,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.55)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase' as const,
            textShadow: '0 1px 4px rgba(0,0,0,0.4)',
          },
          children: brandName,
        },
      },
    },
  };

  // Root: full canvas with a subtle gradient only behind the text area
  const root: SatoriElement = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: layout === 'top' ? 'flex-start' : 'flex-end',
        width: '100%',
        height: '100%',
        position: 'relative',
        backgroundImage: `linear-gradient(${layout === 'top' ? '180deg' : '0deg'}, ${gradientStops})`,
      },
      children: [textColumn, brandWatermark],
    },
  };

  const svg = await satori(root as never, {
    width,
    height,
    fonts: [
      { name: fonts.display.name, data: fonts.display.data, weight: fonts.display.weight as 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 },
      { name: fonts.body.name, data: fonts.body.data, weight: fonts.body.weight as 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 },
    ],
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
  });
  const pngData = resvg.render();
  return Buffer.from(pngData.asPng());
}

// ---------------------------------------------------------------------------
// Satori element type
// ---------------------------------------------------------------------------

interface SatoriElement {
  type: string;
  props: {
    style?: Record<string, unknown>;
    children?: SatoriElement | SatoriElement[] | string;
    [key: string]: unknown;
  };
}
