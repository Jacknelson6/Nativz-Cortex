/**
 * Pre-export helper that rasterizes ```html-visual fenced blocks into PNG
 * data URLs for the conversation PDF, mirroring the mermaid rasterization
 * pattern in rasterize-mermaid.ts.
 *
 * Approach: render each html-visual body inside a sandboxed off-screen
 * iframe, wait for layout, then capture via html2canvas → PNG data URL.
 * Returns a Map<hash, dataUrl> keyed by the same djb2 hash used for mermaid.
 *
 * Runs only in the browser. Caller should no-op when window is undefined.
 */

import { hashMermaidBody as hashBody } from './rasterize-mermaid';

// Re-export hash under a neutral name so callers don't need to know it
// came from the mermaid module.
export { hashBody as hashHtmlVisualBody };

/** Pull every ```html-visual (or ```html) fenced block out of markdown. */
export function extractHtmlVisualBodies(content: string): string[] {
  const out: string[] = [];
  const pattern = /```(?:html-visual|html)[^\n]*\n([\s\S]*?)```/g;
  for (const match of content.matchAll(pattern)) {
    out.push(match[1].trimEnd());
  }
  return out;
}

/**
 * Render an HTML string inside a temporary off-screen iframe and capture
 * it as a PNG data URL via html2canvas.
 */
async function htmlToPngDataUrl(
  htmlBody: string,
  width = 600,
): Promise<string> {
  const html2canvasModule = await import('html2canvas');
  const html2canvas = html2canvasModule.default;

  // Create an off-screen iframe so the HTML renders in a clean context
  // without inheriting the host page's styles.
  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.left = '-100000px';
  iframe.style.top = '-100000px';
  iframe.style.width = `${width}px`;
  iframe.style.height = '1px'; // auto-expands
  iframe.style.border = 'none';
  iframe.style.pointerEvents = 'none';
  iframe.setAttribute('sandbox', 'allow-same-origin');
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error('iframe contentDocument unavailable');

    // Write the HTML body with a light-theme wrapper for PDF readability.
    doc.open();
    doc.write(`<!DOCTYPE html>
<html><head><style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16px;
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: #1a1a2e;
    background: #ffffff;
  }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; }
  th { background: #f3f4f6; font-weight: 600; }
</style></head><body>${htmlBody}</body></html>`);
    doc.close();

    // Wait a tick for layout to settle.
    await new Promise((r) => setTimeout(r, 100));

    // Resize iframe to content height so html2canvas captures the full block.
    const contentHeight = doc.body.scrollHeight || 400;
    iframe.style.height = `${contentHeight}px`;

    // Another tick after resize.
    await new Promise((r) => setTimeout(r, 50));

    const canvas = await html2canvas(doc.body, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width,
      height: contentHeight,
    } as Parameters<typeof html2canvas>[1]);

    return canvas.toDataURL('image/png');
  } finally {
    iframe.remove();
  }
}

/**
 * Rasterize every unique html-visual block across the given messages.
 * Returns Map<hash, pngDataUrl>.
 */
export async function rasterizeHtmlVisualBlocks(
  contents: string[],
): Promise<Map<string, string>> {
  if (typeof window === 'undefined') return new Map();

  const bodies = new Set<string>();
  for (const c of contents) {
    for (const body of extractHtmlVisualBodies(c)) bodies.add(body);
  }
  if (bodies.size === 0) return new Map();

  const map = new Map<string, string>();
  for (const body of bodies) {
    try {
      const dataUrl = await htmlToPngDataUrl(body.trim());
      map.set(hashBody(body), dataUrl);
    } catch {
      /* skip — pdf-markdown will fall back to source dump */
    }
  }
  return map;
}
