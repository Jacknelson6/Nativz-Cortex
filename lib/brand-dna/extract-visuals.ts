import { JSDOM } from 'jsdom';
import type { CrawledPage } from './types';
import type { BrandColor, BrandFont, BrandLogo, DesignStyle } from '@/lib/knowledge/types';

// ---------------------------------------------------------------------------
// Color extraction
// ---------------------------------------------------------------------------

/** Parse a CSS color value to hex. Returns null for invalid/transparent values. */
function cssColorToHex(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v || v === 'transparent' || v === 'inherit' || v === 'initial' || v === 'currentcolor') return null;

  // Already hex
  if (/^#[0-9a-f]{3,8}$/i.test(v)) {
    if (v.length === 4) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    return v.slice(0, 7); // strip alpha if 8-digit
  }

  // rgb/rgba
  const rgbMatch = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return `#${Number(r).toString(16).padStart(2, '0')}${Number(g).toString(16).padStart(2, '0')}${Number(b).toString(16).padStart(2, '0')}`;
  }

  return null;
}

/** Calculate color distance (simple Euclidean in RGB space) */
function colorDistance(hex1: string, hex2: string): number {
  const r1 = parseInt(hex1.slice(1, 3), 16), g1 = parseInt(hex1.slice(3, 5), 16), b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16), g2 = parseInt(hex2.slice(3, 5), 16), b2 = parseInt(hex2.slice(5, 7), 16);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** Check if a color is near-white or near-black (likely background/text, not brand) */
function isNeutral(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const brightness = (r + g + b) / 3;
  return brightness > 240 || brightness < 15; // near white or near black
}

function nameColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const brightness = (r + g + b) / 3;
  if (brightness > 200) return 'Light';
  if (brightness < 50) return 'Dark';
  if (r > g && r > b) return r > 200 ? 'Red' : 'Dark red';
  if (g > r && g > b) return g > 200 ? 'Green' : 'Dark green';
  if (b > r && b > g) return b > 200 ? 'Blue' : 'Dark blue';
  if (r > 200 && g > 150) return 'Orange';
  if (r > 200 && g > 200) return 'Yellow';
  if (r > 150 && b > 150) return 'Purple';
  return 'Brand color';
}

/** Extract color palette from CSS custom properties and inline styles */
export function extractColorPalette(pages: CrawledPage[]): BrandColor[] {
  const colorCounts = new Map<string, number>();

  for (const page of pages) {
    const dom = new JSDOM(page.html, { url: page.url });
    const doc = dom.window.document;

    // Extract from <style> tags and inline style attributes
    const styleBlocks: string[] = [];
    doc.querySelectorAll('style').forEach((el) => styleBlocks.push(el.textContent ?? ''));
    doc.querySelectorAll('[style]').forEach((el) => styleBlocks.push(el.getAttribute('style') ?? ''));

    const cssText = styleBlocks.join('\n');

    // CSS custom properties (--color-*, --bg-*, etc.)
    const varMatches = cssText.matchAll(/--[\w-]*(?:color|bg|accent|primary|secondary|brand)[\w-]*\s*:\s*([^;}\n]+)/gi);
    for (const m of varMatches) {
      const hex = cssColorToHex(m[1]);
      if (hex && !isNeutral(hex)) colorCounts.set(hex, (colorCounts.get(hex) ?? 0) + 3); // weight custom properties higher
    }

    // Direct color/background-color declarations
    const colorMatches = cssText.matchAll(/(?:background-color|color|border-color)\s*:\s*([^;}\n]+)/gi);
    for (const m of colorMatches) {
      const hex = cssColorToHex(m[1]);
      if (hex && !isNeutral(hex)) colorCounts.set(hex, (colorCounts.get(hex) ?? 0) + 1);
    }

    // Hex colors directly in CSS
    const hexMatches = cssText.matchAll(/#[0-9a-fA-F]{3,8}\b/g);
    for (const m of hexMatches) {
      const hex = cssColorToHex(m[0]);
      if (hex && !isNeutral(hex)) colorCounts.set(hex, (colorCounts.get(hex) ?? 0) + 1);
    }

    // Meta theme-color
    const themeColor = doc.querySelector('meta[name="theme-color"]')?.getAttribute('content');
    if (themeColor) {
      const hex = cssColorToHex(themeColor);
      if (hex) colorCounts.set(hex, (colorCounts.get(hex) ?? 0) + 10); // high weight
    }
  }

  // Sort by frequency, deduplicate similar colors
  const sorted = [...colorCounts.entries()].sort((a, b) => b[1] - a[1]);
  const deduped: BrandColor[] = [];

  for (const [hex] of sorted) {
    if (deduped.length >= 8) break;
    const tooClose = deduped.some((existing) => colorDistance(hex, existing.hex) < 30);
    if (tooClose) continue;
    deduped.push({
      hex,
      name: nameColor(hex),
      role: deduped.length === 0 ? 'primary' : deduped.length === 1 ? 'secondary' : deduped.length < 4 ? 'accent' : 'neutral',
    });
  }

  return deduped;
}

// ---------------------------------------------------------------------------
// Font extraction
// ---------------------------------------------------------------------------

/** Extract font families from CSS */
export function extractFontFamilies(pages: CrawledPage[]): BrandFont[] {
  const fontUsage = new Map<string, { contexts: Set<string>; count: number }>();

  for (const page of pages) {
    const dom = new JSDOM(page.html, { url: page.url });
    const doc = dom.window.document;

    // Collect all CSS
    const styleBlocks: string[] = [];
    doc.querySelectorAll('style').forEach((el) => styleBlocks.push(el.textContent ?? ''));
    doc.querySelectorAll('[style]').forEach((el) => {
      const style = el.getAttribute('style') ?? '';
      const tag = el.tagName.toLowerCase();
      if (style.includes('font-family')) {
        styleBlocks.push(`${tag} { ${style} }`);
      }
    });

    // Check <link> tags for Google Fonts
    doc.querySelectorAll('link[href*="fonts.googleapis.com"]').forEach((link) => {
      const href = link.getAttribute('href') ?? '';
      const familyMatch = href.match(/family=([^&:]+)/);
      if (familyMatch) {
        const family = decodeURIComponent(familyMatch[1]).replace(/\+/g, ' ');
        const existing = fontUsage.get(family) ?? { contexts: new Set(), count: 0 };
        existing.contexts.add('link');
        existing.count += 5; // high weight for explicitly loaded fonts
        fontUsage.set(family, existing);
      }
    });

    const cssText = styleBlocks.join('\n');

    // font-family declarations with context detection
    const fontMatches = cssText.matchAll(/([\w\s.#:-]+)\s*\{[^}]*font-family\s*:\s*([^;}"']+)/gi);
    for (const m of fontMatches) {
      const selector = m[1].trim().toLowerCase();
      const families = m[2].split(',').map((f) => f.trim().replace(/["']/g, ''));

      for (const family of families) {
        if (['sans-serif', 'serif', 'monospace', 'cursive', 'system-ui', 'inherit', 'initial'].includes(family.toLowerCase())) continue;
        const existing = fontUsage.get(family) ?? { contexts: new Set(), count: 0 };
        existing.count++;

        if (/^h[1-6]|\.heading|\.title|\.hero/.test(selector)) existing.contexts.add('heading');
        else if (/^p\b|^body|\.text|\.content|\.description/.test(selector)) existing.contexts.add('body');
        else if (/code|pre|\.mono/.test(selector)) existing.contexts.add('mono');
        else existing.contexts.add('other');

        fontUsage.set(family, existing);
      }
    }
  }

  // Assign roles and deduplicate
  const sorted = [...fontUsage.entries()].sort((a, b) => b[1].count - a[1].count);
  const fonts: BrandFont[] = [];
  const seenRoles = new Set<string>();

  for (const [family, usage] of sorted) {
    if (fonts.length >= 4) break;

    let role: BrandFont['role'] = 'body';
    if (usage.contexts.has('heading') && !seenRoles.has('display')) role = 'display';
    else if (usage.contexts.has('mono') && !seenRoles.has('mono')) role = 'mono';
    else if (!seenRoles.has('body')) role = 'body';
    else continue; // skip if role already taken

    seenRoles.add(role);
    fonts.push({ family, role });
  }

  return fonts;
}

// ---------------------------------------------------------------------------
// Logo detection
// ---------------------------------------------------------------------------

/** Extract logo URLs from HTML meta tags and common patterns */
export function extractLogoUrls(pages: CrawledPage[]): { url: string; variant: BrandLogo['variant'] }[] {
  const logos: { url: string; variant: BrandLogo['variant']; weight: number }[] = [];
  const seen = new Set<string>();

  function addLogo(url: string | null | undefined, variant: BrandLogo['variant'], weight: number, base: string) {
    if (!url) return;
    try {
      const resolved = new URL(url, base).toString();
      if (seen.has(resolved)) return;
      // Only accept image URLs
      if (!/\.(png|jpg|jpeg|svg|webp|ico)(\?.*)?$/i.test(resolved) && !resolved.includes('logo')) return;
      seen.add(resolved);
      logos.push({ url: resolved, variant, weight });
    } catch { /* invalid URL */ }
  }

  // Only process homepage + about page for logos
  const logoPages = pages.filter((p) => p.pageType === 'homepage' || p.pageType === 'about').slice(0, 3);

  for (const page of logoPages) {
    const dom = new JSDOM(page.html, { url: page.url });
    const doc = dom.window.document;

    // Apple touch icon (usually high-res logo)
    addLogo(doc.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'), 'icon', 10, page.url);

    // OG image (often brand image)
    addLogo(doc.querySelector('meta[property="og:image"]')?.getAttribute('content'), 'primary', 8, page.url);

    // Favicon
    addLogo(doc.querySelector('link[rel="icon"]')?.getAttribute('href'), 'icon', 5, page.url);

    // <img> tags with "logo" in alt, class, or id
    doc.querySelectorAll('img').forEach((img) => {
      const alt = (img.getAttribute('alt') ?? '').toLowerCase();
      const cls = (img.getAttribute('class') ?? '').toLowerCase();
      const id = (img.getAttribute('id') ?? '').toLowerCase();
      const src = img.getAttribute('src');

      if (alt.includes('logo') || cls.includes('logo') || id.includes('logo')) {
        addLogo(src, 'primary', 12, page.url);
      }
    });

    // First <img> inside <header>
    const headerImg = doc.querySelector('header img');
    if (headerImg) {
      addLogo(headerImg.getAttribute('src'), 'primary', 7, page.url);
    }

    // SVG in header (inline logos)
    const headerSvg = doc.querySelector('header svg');
    if (headerSvg) {
      // Can't easily extract inline SVG as URL, skip for now
    }
  }

  return logos
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map(({ url, variant }) => ({ url, variant }));
}

// ---------------------------------------------------------------------------
// Design style detection
// ---------------------------------------------------------------------------

/** Detect design style from CSS patterns */
export function detectDesignStyle(pages: CrawledPage[]): DesignStyle {
  let darkCount = 0;
  let lightCount = 0;
  let totalRadii = 0;
  let radiusCount = 0;
  let imageCount = 0;
  let illustrationHints = 0;

  for (const page of pages.slice(0, 5)) { // Only check first 5 pages
    const dom = new JSDOM(page.html, { url: page.url });
    const doc = dom.window.document;

    const styleBlocks: string[] = [];
    doc.querySelectorAll('style').forEach((el) => styleBlocks.push(el.textContent ?? ''));
    const cssText = styleBlocks.join('\n');

    // Theme detection from background colors
    const bgMatches = cssText.matchAll(/background(?:-color)?\s*:\s*([^;}\n]+)/gi);
    for (const m of bgMatches) {
      const hex = cssColorToHex(m[1]);
      if (hex) {
        const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        const brightness = (r + g + b) / 3;
        if (brightness < 60) darkCount++;
        else if (brightness > 200) lightCount++;
      }
    }

    // Border radius detection
    const radiusMatches = cssText.matchAll(/border-radius\s*:\s*(\d+)/gi);
    for (const m of radiusMatches) {
      totalRadii += parseInt(m[1]);
      radiusCount++;
    }

    // Image vs illustration hints
    doc.querySelectorAll('img').forEach(() => imageCount++);
    doc.querySelectorAll('svg').forEach(() => illustrationHints++);
  }

  const avgRadius = radiusCount > 0 ? totalRadii / radiusCount : 0;

  return {
    theme: darkCount > lightCount * 2 ? 'dark' : lightCount > darkCount * 2 ? 'light' : 'mixed',
    corners: avgRadius > 12 ? 'rounded' : avgRadius < 4 ? 'sharp' : 'mixed',
    density: 'moderate', // Hard to detect purely from CSS — default to moderate
    imagery: illustrationHints > imageCount ? 'illustration' : imageCount > 0 ? 'photo' : 'mixed',
  };
}
