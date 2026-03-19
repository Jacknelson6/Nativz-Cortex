// ---------------------------------------------------------------------------
// Static Ad Generation — Font Resolution
// ---------------------------------------------------------------------------
// Fetches brand fonts from Google Fonts and returns ArrayBuffer data
// for satori text rendering. Falls back to Inter if a font can't be loaded.
// ---------------------------------------------------------------------------

import type { BrandFont } from '@/lib/knowledge/types';

export interface ResolvedFont {
  name: string;
  data: ArrayBuffer;
  weight: number;
}

export interface ResolvedFontPair {
  display: ResolvedFont;
  body: ResolvedFont;
}

// Module-level cache — fonts are only downloaded once per process
const fontCache = new Map<string, ArrayBuffer>();

const FALLBACK_FONT = 'Inter';

/**
 * Resolve brand fonts for satori rendering.
 * Tries Google Fonts for each font family, falls back to Inter.
 * Returns a display font (for headlines) and body font (for body text).
 */
export async function resolveBrandFonts(fonts: BrandFont[]): Promise<ResolvedFontPair> {
  const displayFont = fonts.find((f) => f.role === 'display') ?? fonts[0] ?? null;
  const bodyFont = fonts.find((f) => f.role === 'body') ?? fonts[1] ?? fonts[0] ?? null;

  const [displayData, bodyData] = await Promise.all([
    fetchFontData(displayFont?.family ?? FALLBACK_FONT),
    fetchFontData(bodyFont?.family ?? FALLBACK_FONT),
  ]);

  return {
    display: {
      name: displayData ? (displayFont?.family ?? FALLBACK_FONT) : FALLBACK_FONT,
      data: displayData ?? (await fetchFontDataWithFallback(FALLBACK_FONT)),
      weight: parseWeight(displayFont?.weight) || 700,
    },
    body: {
      name: bodyData ? (bodyFont?.family ?? FALLBACK_FONT) : FALLBACK_FONT,
      data: bodyData ?? (await fetchFontDataWithFallback(FALLBACK_FONT)),
      weight: parseWeight(bodyFont?.weight) || 400,
    },
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function fetchFontData(family: string): Promise<ArrayBuffer | null> {
  // Check cache first
  const cacheKey = family.toLowerCase();
  const cached = fontCache.get(cacheKey);
  if (cached) return cached;

  try {
    // Fetch the CSS from Google Fonts
    // IMPORTANT: Use a non-browser User-Agent so Google returns TTF format (not WOFF2).
    // Satori only supports TTF/OTF — WOFF2 throws "Unsupported OpenType signature wOF2".
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700`;
    const cssRes = await fetch(cssUrl, {
      headers: {
        'User-Agent': 'curl/7.64.1',
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!cssRes.ok) return null;

    const css = await cssRes.text();

    // Parse out the first font file URL (woff2 or ttf)
    const fontUrl = extractFontUrl(css);
    if (!fontUrl) return null;

    // Fetch the actual font file
    const fontRes = await fetch(fontUrl, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!fontRes.ok) return null;

    const data = await fontRes.arrayBuffer();
    fontCache.set(cacheKey, data);
    return data;
  } catch {
    console.warn(`[resolve-fonts] failed to fetch font "${family}", will use fallback`);
    return null;
  }
}

async function fetchFontDataWithFallback(family: string): Promise<ArrayBuffer> {
  const data = await fetchFontData(family);
  if (data) return data;

  // Last resort — fetch Inter TTF from Google Fonts via curl UA
  const fallbackCss = await fetch(
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;700',
    { headers: { 'User-Agent': 'curl/7.64.1' }, signal: AbortSignal.timeout(10_000) },
  );
  const fallbackFontUrl = fallbackCss.ok ? extractFontUrl(await fallbackCss.text()) : null;
  const cdnUrl = fallbackFontUrl ?? 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjQ.ttf';
  const res = await fetch(cdnUrl, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new Error('[resolve-fonts] unable to fetch fallback font Inter');
  }
  const fallbackData = await res.arrayBuffer();
  fontCache.set(family.toLowerCase(), fallbackData);
  return fallbackData;
}

function extractFontUrl(css: string): string | null {
  // Prefer TTF (satori compatible), then OTF, then woff2 as last resort
  const ttfMatch = css.match(/url\(([^)]+\.ttf[^)]*)\)/);
  if (ttfMatch) return ttfMatch[1].replace(/['"]/g, '');

  const otfMatch = css.match(/url\(([^)]+\.otf[^)]*)\)/);
  if (otfMatch) return otfMatch[1].replace(/['"]/g, '');

  // Generic fallback — just grab the first url()
  const anyMatch = css.match(/url\(([^)]+)\)/);
  if (anyMatch) return anyMatch[1].replace(/['"]/g, '');

  return null;
}

function parseWeight(weight: string | undefined): number {
  if (!weight) return 0;
  const num = parseInt(weight, 10);
  return isNaN(num) ? 0 : num;
}
