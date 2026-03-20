// ---------------------------------------------------------------------------
// Logo Extraction — Cheerio-based with nav/header priority
// ---------------------------------------------------------------------------

import * as cheerio from 'cheerio';

/**
 * Extract the best logo URL from HTML using a priority cascade:
 * 1. <img> inside <nav> or <header> with "logo" in class/alt/src
 * 2. <svg> with "logo" in class/id (returns null — can't extract as URL easily)
 * 3. apple-touch-icon link tag
 * 4. og:image meta tag
 * 5. Favicon (last resort)
 */
export function extractLogo(html: string, baseUrl: string): string | null {
  const $ = cheerio.load(html);

  // 1. <img> inside <nav> or <header> with "logo" in class/alt/src
  const navHeaderImgs = $('nav img, header img').toArray();
  for (const el of navHeaderImgs) {
    const img = $(el);
    const src = img.attr('src') ?? '';
    const alt = img.attr('alt') ?? '';
    const cls = img.attr('class') ?? '';
    const id = img.attr('id') ?? '';

    if (hasLogoSignal(src, alt, cls, id)) {
      const resolved = resolveUrl(src, baseUrl);
      if (resolved) return resolved;
    }
  }

  // Also check <a> wrapping an <img> inside nav/header (common pattern: <a><img></a>)
  const navHeaderLinks = $('nav a, header a').toArray();
  for (const el of navHeaderLinks) {
    const link = $(el);
    const img = link.find('img').first();
    if (img.length > 0) {
      const src = img.attr('src') ?? '';
      const alt = img.attr('alt') ?? '';
      const cls = img.attr('class') ?? '';
      const linkCls = link.attr('class') ?? '';

      // If the link or image has logo signals, or it's the first image in nav
      if (hasLogoSignal(src, alt, cls, linkCls)) {
        const resolved = resolveUrl(src, baseUrl);
        if (resolved) return resolved;
      }
    }
  }

  // Broader search: any <img> with "logo" in attributes anywhere on page
  const allImgs = $('img').toArray();
  for (const el of allImgs) {
    const img = $(el);
    const src = img.attr('src') ?? '';
    const alt = img.attr('alt') ?? '';
    const cls = img.attr('class') ?? '';
    const id = img.attr('id') ?? '';

    if (/logo/i.test(cls) || /logo/i.test(id) || /logo/i.test(alt) || /logo/i.test(src)) {
      const resolved = resolveUrl(src, baseUrl);
      if (resolved) return resolved;
    }
  }

  // 2. <svg> with "logo" — try to find a linked image nearby or skip
  // SVGs are inline and can't easily be returned as a URL; skip to next priority

  // 3. apple-touch-icon
  const appleTouchIcon =
    $('link[rel="apple-touch-icon"]').attr('href') ??
    $('link[rel="apple-touch-icon-precomposed"]').attr('href');
  if (appleTouchIcon) {
    const resolved = resolveUrl(appleTouchIcon, baseUrl);
    if (resolved) return resolved;
  }

  // 4. og:image
  const ogImage =
    $('meta[property="og:image"]').attr('content') ??
    $('meta[name="og:image"]').attr('content');
  if (ogImage) {
    const resolved = resolveUrl(ogImage, baseUrl);
    if (resolved) return resolved;
  }

  // 5. Favicon (last resort)
  const favicon =
    $('link[rel="icon"]').attr('href') ??
    $('link[rel="shortcut icon"]').attr('href');
  if (favicon) {
    const resolved = resolveUrl(favicon, baseUrl);
    if (resolved) return resolved;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasLogoSignal(...values: string[]): boolean {
  return values.some((v) => /logo/i.test(v));
}

function resolveUrl(href: string, baseUrl: string): string | null {
  if (!href || href.startsWith('data:')) return null;
  try {
    const url = new URL(href, baseUrl);
    return url.href.replace(/^http:\/\//, 'https://');
  } catch {
    return null;
  }
}
