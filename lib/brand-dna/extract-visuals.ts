import { JSDOM } from 'jsdom';
import type { CrawledPage } from './types';
import type { BrandFont, BrandLogo, DesignStyle } from '@/lib/knowledge/types';
import { cssColorToHex } from './color-palette';

export { extractColorPalette } from './color-palette';

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

    // Google Fonts — multiple family= params per link
    doc.querySelectorAll('link[href*="fonts.googleapis.com"]').forEach((link) => {
      const href = link.getAttribute('href') ?? '';
      for (const m of href.matchAll(/family=([^&:]+)/g)) {
        const family = decodeURIComponent(m[1]).replace(/\+/g, ' ').split(':')[0]?.trim() ?? '';
        if (!family) continue;
        const existing = fontUsage.get(family) ?? { contexts: new Set(), count: 0 };
        existing.contexts.add('link');
        existing.count += 6;
        fontUsage.set(family, existing);
      }
    });

    doc.querySelectorAll('link[href*="fonts.bunny.net"], link[href*="use.typekit.net"]').forEach((link) => {
      const href = link.getAttribute('href') ?? '';
      const familyMatch = href.match(/family=([^&]+)/);
      if (familyMatch) {
        const family = decodeURIComponent(familyMatch[1]).replace(/\+/g, ' ');
        const existing = fontUsage.get(family) ?? { contexts: new Set(), count: 0 };
        existing.contexts.add('link');
        existing.count += 5;
        fontUsage.set(family, existing);
      }
    });

    const cssText = styleBlocks.join('\n');

    for (const m of cssText.matchAll(/@font-face\s*\{[^}]*font-family\s*:\s*['"]?([^;'"}]+)/gi)) {
      const family = m[1].trim().replace(/['"]/g, '');
      if (!family || family === 'inherit') continue;
      const existing = fontUsage.get(family) ?? { contexts: new Set(), count: 0 };
      existing.contexts.add('other');
      existing.count += 4;
      fontUsage.set(family, existing);
    }

    const fontMatches = cssText.matchAll(/([\w\s.#:[\]-]+)\s*\{[^}]*font-family\s*:\s*([^;}"']+)/gi);
    for (const m of fontMatches) {
      const selector = m[1].trim().toLowerCase();
      const families = m[2].split(',').map((f) => f.trim().replace(/["']/g, ''));

      for (const family of families) {
        if (['sans-serif', 'serif', 'monospace', 'cursive', 'system-ui', 'inherit', 'initial'].includes(family.toLowerCase())) continue;
        const existing = fontUsage.get(family) ?? { contexts: new Set(), count: 0 };
        existing.count++;

        if (
          /^h[1-6]|\.heading|\.headline|\.title|\.hero|\.display|font-heading|prose-headings/.test(selector)
        ) {
          existing.contexts.add('heading');
        } else if (/^p\b|^body|\.text|\.content|\.description|\.prose\b|article/.test(selector)) {
          existing.contexts.add('body');
        } else if (/code|pre|\.mono|font-mono/.test(selector)) {
          existing.contexts.add('mono');
        } else existing.contexts.add('other');

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
