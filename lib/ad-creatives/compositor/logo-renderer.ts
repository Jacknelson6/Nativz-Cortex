import sharp from 'sharp';
import type { BrandContext } from '@/lib/knowledge/brand-context';
import { brandLogoImageUrlsForGeneration } from '@/lib/ad-creatives/brand-reference-images';

const logoCache = new Map<string, Buffer>();

/** Clears in-memory logo fetch cache (Vitest / QA). */
export function clearLogoFetchCache(): void {
  logoCache.clear();
}

async function fetchLogoBuffer(url: string): Promise<Buffer | null> {
  const cached = logoCache.get(url);
  if (cached) return cached;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    logoCache.set(url, buf);
    return buf;
  } catch {
    return null;
  }
}

export interface LogoRenderResult {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Fetch a logo by URL and resize (same cache + sharp path as composite). For QA tests.
 */
export async function fetchAndResizeLogoFromUrl(
  logoUrl: string,
  maxWidth: number,
  maxHeight: number,
): Promise<LogoRenderResult | null> {
  const raw = await fetchLogoBuffer(logoUrl);
  if (!raw) return null;

  const resized = await sharp(raw)
    .ensureAlpha()
    .resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();

  const meta = await sharp(resized).metadata();
  return {
    buffer: resized,
    width: meta.width ?? maxWidth,
    height: meta.height ?? maxHeight,
  };
}

/**
 * Fetch brand logo, resize to fit max box (fractions of canvas), preserve aspect ratio.
 */
export async function renderLogoForComposite(
  brandContext: BrandContext,
  canvasWidth: number,
  canvasHeight: number,
): Promise<LogoRenderResult | null> {
  const urls = brandLogoImageUrlsForGeneration(brandContext);
  const url = urls[0];
  if (!url) return null;

  const raw = await fetchLogoBuffer(url);
  if (!raw) return null;

  const maxW = Math.round(canvasWidth * 0.18);
  const maxH = Math.round(canvasHeight * 0.08);

  const resized = await sharp(raw)
    .ensureAlpha()
    .resize(maxW, maxH, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();

  const meta = await sharp(resized).metadata();
  return {
    buffer: resized,
    width: meta.width ?? maxW,
    height: meta.height ?? maxH,
  };
}
