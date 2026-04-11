/**
 * Pre-export helper that finds every ```mermaid fenced block inside a set
 * of conversation messages, renders each one via the real mermaid library
 * into an off-screen DOM container, rasterizes the resulting SVG to a PNG
 * data URL, and returns a Map keyed by a stable content hash so the PDF
 * renderer can look up the image per-block.
 *
 * Why this instead of passing SVGs directly to @react-pdf/renderer:
 *
 *   - @react-pdf/renderer's <Svg /> subset does not implement every
 *     attribute mermaid emits (foreignObject, filters, complex gradients),
 *     so a direct SVG embed drops half the node labels silently. PNG is
 *     lossy but reliable.
 *   - Rasterizing in the browser off the live mermaid module gives us the
 *     exact visual the user sees in the chat, not a separate theme.
 *
 * Runs only in the browser. Caller should no-op when window is undefined.
 */

/** Non-cryptographic string hash — djb2. Stable across runs and platforms. */
export function hashMermaidBody(body: string): string {
  let h = 5381;
  for (let i = 0; i < body.length; i += 1) {
    h = (h * 33) ^ body.charCodeAt(i);
  }
  // Unsigned 32-bit → hex, fixed-width so map keys line up cleanly.
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Pull every ```mermaid fenced block out of a markdown string. */
export function extractMermaidBodies(content: string): string[] {
  const out: string[] = [];
  // Match ```mermaid (with any trailing info on the open line) through the
  // next closing fence. `[\s\S]` handles multi-line bodies.
  const pattern = /```mermaid[^\n]*\n([\s\S]*?)```/g;
  for (const match of content.matchAll(pattern)) {
    out.push(match[1].trimEnd());
  }
  return out;
}

async function svgToPngDataUrl(svgMarkup: string, scale = 2): Promise<string> {
  const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Failed to load SVG for rasterization'));
      i.src = url;
    });
    const w = Math.max(1, Math.round((img.naturalWidth || img.width || 1200) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || img.height || 800) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    // Paint a light background so the rasterized diagram sits cleanly on
    // the light-theme PDF pages — mermaid's dark theme has transparent
    // regions that read as black otherwise.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Render each unique mermaid body via the live library and rasterize to a
 * PNG data URL. Returns a Map<hash, dataUrl>; callers stash the map on the
 * PDF document props so the markdown renderer can look up each block.
 *
 * Failures per-block are swallowed — the existing labeled-source fallback
 * in pdf-markdown.tsx will render when an entry is missing.
 */
export async function rasterizeMermaidBlocks(
  contents: string[],
): Promise<Map<string, string>> {
  if (typeof window === 'undefined') return new Map();
  const bodies = new Set<string>();
  for (const c of contents) {
    for (const body of extractMermaidBodies(c)) bodies.add(body);
  }
  if (bodies.size === 0) return new Map();

  const mermaidModule = await import('mermaid');
  const mermaid = mermaidModule.default;
  // Use a light theme for the PDF (the chat uses dark). Initialize fresh per
  // export so a theme toggle between chat and PDF doesn't carry over.
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'strict',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  });

  // Off-screen container — mermaid writes to the DOM during render and we
  // throw the node away right after grabbing the SVG string.
  const stage = document.createElement('div');
  stage.style.position = 'absolute';
  stage.style.left = '-100000px';
  stage.style.top = '-100000px';
  stage.style.pointerEvents = 'none';
  document.body.appendChild(stage);

  const map = new Map<string, string>();
  try {
    let idx = 0;
    for (const body of bodies) {
      idx += 1;
      const renderId = `mmd-pdf-${Date.now()}-${idx}`;
      try {
        const { svg } = await mermaid.render(renderId, body.trim());
        if (/syntax error in text/i.test(svg)) continue;
        const dataUrl = await svgToPngDataUrl(svg);
        map.set(hashMermaidBody(body), dataUrl);
      } catch {
        /* skip failed body — pdf-markdown will fall back to source dump */
      }
    }
  } finally {
    stage.remove();
  }
  return map;
}
