import { JSDOM } from 'jsdom';

const SKIP_RE =
  /(pixel|tracking|analytics|spacer|blank|1x1|facebook\.com|doubleclick|googletagmanager|favicon)/i;

/**
 * Collect likely product/content image URLs from page HTML (Readability strips images from text).
 */
export function collectImageUrlsFromHtml(html: string, pageUrl: string, maxImages = 24): string[] {
  const out: string[] = [];
  try {
    const dom = new JSDOM(html, { url: pageUrl });
    const imgs = dom.window.document.querySelectorAll('img[src]');
    for (const img of imgs) {
      const src = img.getAttribute('src');
      if (!src || src.startsWith('data:')) continue;
      let resolved: string;
      try {
        resolved = new URL(src, pageUrl).href;
      } catch {
        continue;
      }
      if (SKIP_RE.test(resolved)) continue;
      const w = img.getAttribute('width');
      const h = img.getAttribute('height');
      if (w && h) {
        const wi = parseInt(w, 10);
        const hi = parseInt(h, 10);
        if (wi > 0 && hi > 0 && wi < 48 && hi < 48) continue;
      }
      if (out.includes(resolved)) continue;
      out.push(resolved);
      if (out.length >= maxImages) break;
    }
  } catch {
    /* ignore */
  }
  return out;
}
