// ---------------------------------------------------------------------------
// Static Ad Generation — Image Compositing
// ---------------------------------------------------------------------------
// Uses sharp to composite the text overlay and brand logo onto the
// Gemini-generated base image, producing the final ad creative.
// ---------------------------------------------------------------------------

import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';

export interface CompositeConfig {
  baseImage: Buffer;
  textOverlay: Buffer | null;
  logoUrl: string | null;
  logoPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  width: number;
  height: number;
}

const LOGO_SIZE_RATIO = 0.15;
const LOGO_PADDING_RATIO = 0.03;

/**
 * Composite the text overlay and optional logo onto the base image.
 * Returns the final PNG buffer.
 */
export async function compositeAd(config: CompositeConfig): Promise<Buffer> {
  const { baseImage, textOverlay, logoUrl, logoPosition, width, height } = config;

  // 1. Load and resize base image to exact dimensions
  let pipeline = sharp(baseImage).resize(width, height, { fit: 'cover' });

  // 2. Build composite layers
  const layers: sharp.OverlayOptions[] = [];

  // Text overlay (transparent PNG) — only if provided
  if (textOverlay) {
    layers.push({
      input: textOverlay,
      top: 0,
      left: 0,
    });
  }

  // 3. Logo (if provided)
  if (logoUrl) {
    const logoPng = await fetchAndRasterizeLogo(logoUrl, width, height);
    if (logoPng) {
      const { left, top } = computeLogoPosition(logoPosition, width, height, logoPng.width, logoPng.height);
      layers.push({
        input: logoPng.buffer,
        left,
        top,
      });
    }
  }

  // 4. Composite all layers and output PNG
  pipeline = pipeline.composite(layers);
  return pipeline.png().toBuffer();
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface RasterizedLogo {
  buffer: Buffer;
  width: number;
  height: number;
}

async function fetchAndRasterizeLogo(
  url: string,
  canvasWidth: number,
  canvasHeight: number,
): Promise<RasterizedLogo | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') ?? '';
    const arrayBuffer = await res.arrayBuffer();
    let logoBuffer = Buffer.from(arrayBuffer);

    // If SVG, rasterize with resvg
    if (contentType.includes('svg') || url.endsWith('.svg')) {
      const svgString = logoBuffer.toString('utf-8');
      const targetWidth = Math.round(canvasWidth * LOGO_SIZE_RATIO);
      const resvg = new Resvg(svgString, {
        fitTo: { mode: 'width', value: targetWidth },
      });
      const rendered = resvg.render();
      logoBuffer = Buffer.from(rendered.asPng());
    }

    // Resize logo to ~15% of canvas width, preserving aspect ratio
    const targetWidth = Math.round(canvasWidth * LOGO_SIZE_RATIO);
    const resizedBuffer = await sharp(logoBuffer)
      .resize(targetWidth, undefined, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();

    const metadata = await sharp(resizedBuffer).metadata();

    return {
      buffer: resizedBuffer,
      width: metadata.width ?? targetWidth,
      height: metadata.height ?? targetWidth,
    };
  } catch (err) {
    console.warn('[composite-ad] failed to fetch/process logo:', err instanceof Error ? err.message : err);
    return null;
  }
}

function computeLogoPosition(
  position: CompositeConfig['logoPosition'],
  canvasWidth: number,
  canvasHeight: number,
  logoWidth: number,
  logoHeight: number,
): { left: number; top: number } {
  const padding = Math.round(canvasWidth * LOGO_PADDING_RATIO);

  switch (position) {
    case 'top-left':
      return { left: padding, top: padding };
    case 'top-right':
      return { left: canvasWidth - logoWidth - padding, top: padding };
    case 'bottom-left':
      return { left: padding, top: canvasHeight - logoHeight - padding };
    case 'bottom-right':
      return { left: canvasWidth - logoWidth - padding, top: canvasHeight - logoHeight - padding };
  }
}
