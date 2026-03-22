import { JSDOM } from 'jsdom';

const SKIP_RE =
  /(pixel|tracking|analytics|spacer|blank|1x1|facebook\.com|doubleclick|googletagmanager|favicon|gravatar)/i;

const IMG_EXT = /\.(jpe?g|png|gif|webp|avif)(\?|$)/i;

function resolveUrl(src: string, pageUrl: string): string | null {
  try {
    return new URL(src, pageUrl).href;
  } catch {
    return null;
  }
}

function isLikelyProductImageUrl(href: string): boolean {
  if (SKIP_RE.test(href)) return false;
  return IMG_EXT.test(href) || /\/cdn\/|\/images\/|\/media\/|\/uploads\/|shopify|cloudinary|imgix/i.test(href);
}

/** Pick the largest candidate from a srcset string (e.g. "a 400w, b 800w"). */
export function bestUrlFromSrcset(srcset: string, pageUrl: string): string | null {
  if (!srcset.trim()) return null;
  let bestUrl: string | null = null;
  let bestW = -1;
  for (const part of srcset.split(',')) {
    const tok = part.trim().split(/\s+/);
    const url = tok[0];
    if (!url) continue;
    const wMatch = tok[1]?.match(/^(\d+)w$/i);
    const w = wMatch ? parseInt(wMatch[1], 10) : 0;
    const resolved = resolveUrl(url, pageUrl);
    if (!resolved || !isLikelyProductImageUrl(resolved)) continue;
    if (w > bestW) {
      bestW = w;
      bestUrl = resolved;
    }
  }
  if (bestUrl) return bestUrl;
  const first = srcset.split(',')[0]?.trim().split(/\s+/)[0];
  if (!first) return null;
  const r = resolveUrl(first, pageUrl);
  return r && isLikelyProductImageUrl(r) ? r : null;
}

function pushUnique(out: string[], seen: Set<string>, url: string | null): void {
  if (!url || seen.has(url) || !isLikelyProductImageUrl(url)) return;
  seen.add(url);
  out.push(url);
}

/**
 * Walk JSON-LD and collect image URLs (Product, Offer, Organization, etc.).
 */
export function collectJsonLdImageUrls(html: string, pageUrl: string, max = 40): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  function walk(node: unknown, depth: number): void {
    if (depth > 14 || out.length >= max) return;
    if (node === null || node === undefined) return;
    if (typeof node === 'string') {
      if (/^https?:\/\//i.test(node) && isLikelyProductImageUrl(node)) {
        pushUnique(out, seen, resolveUrl(node, pageUrl));
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const x of node) walk(x, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(o)) {
      const kl = k.toLowerCase();
      if (
        kl === 'image' ||
        kl === 'images' ||
        kl === 'photo' ||
        kl === 'thumbnail' ||
        kl === 'logo' ||
        kl === 'primaryimageofpage'
      ) {
        walk(v, depth + 1);
      } else if (kl !== '@context') {
        walk(v, depth + 1);
      }
    }
  }

  try {
    const dom = new JSDOM(html, { url: pageUrl });
    for (const el of dom.window.document.querySelectorAll('script[type="application/ld+json"]')) {
      const raw = el.textContent?.trim();
      if (!raw) continue;
      try {
        walk(JSON.parse(raw), 0);
      } catch {
        /* invalid JSON-LD */
      }
    }
  } catch {
    /* ignore */
  }

  return out;
}

/**
 * Collect likely product / content image URLs from HTML (img, picture, lazy attrs, JSON-LD).
 */
export function collectImageUrlsFromHtml(html: string, pageUrl: string, maxImages = 48): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const u of collectJsonLdImageUrls(html, pageUrl, Math.min(maxImages, 40))) {
    pushUnique(out, seen, u);
    if (out.length >= maxImages) return out;
  }

  try {
    const dom = new JSDOM(html, { url: pageUrl });
    const doc = dom.window.document;

    const candidates = doc.querySelectorAll(
      'img[src], img[data-src], img[data-lazy-src], img[data-original], img[data-srcset]',
    );
    for (const img of candidates) {
      if (out.length >= maxImages) break;
      const w = img.getAttribute('width');
      const h = img.getAttribute('height');
      if (w && h) {
        const wi = parseInt(w, 10);
        const hi = parseInt(h, 10);
        if (wi > 0 && hi > 0 && wi < 48 && hi < 48) continue;
      }
      const srcset =
        img.getAttribute('srcset') ||
        img.getAttribute('data-srcset') ||
        img.getAttribute('data-lazy-srcset') ||
        '';
      if (srcset) {
        const best = bestUrlFromSrcset(srcset, pageUrl);
        pushUnique(out, seen, best);
        continue;
      }
      for (const attr of ['src', 'data-src', 'data-lazy-src', 'data-original']) {
        const s = img.getAttribute(attr);
        if (s && !s.startsWith('data:')) {
          pushUnique(out, seen, resolveUrl(s, pageUrl));
          break;
        }
      }
    }

    for (const pic of doc.querySelectorAll('picture source[srcset]')) {
      if (out.length >= maxImages) break;
      const ss = pic.getAttribute('srcset');
      if (ss) pushUnique(out, seen, bestUrlFromSrcset(ss, pageUrl));
    }
  } catch {
    /* ignore */
  }

  return out;
}

/**
 * Merge image URL lists in priority order (dedupe, cap).
 */
export function buildProductImageAllowlist(
  pages: { html: string; url: string }[],
  maxTotal = 120,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of pages) {
    for (const u of collectJsonLdImageUrls(p.html, p.url, 50)) {
      if (seen.has(u)) continue;
      seen.add(u);
      out.push(u);
      if (out.length >= maxTotal) return out;
    }
  }
  for (const p of pages) {
    for (const u of collectImageUrlsFromHtml(p.html, p.url, 64)) {
      if (seen.has(u)) continue;
      seen.add(u);
      out.push(u);
      if (out.length >= maxTotal) return out;
    }
  }
  return out;
}
