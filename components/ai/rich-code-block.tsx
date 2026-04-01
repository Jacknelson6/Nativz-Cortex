'use client';

import { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils/cn';

type VisualVariant = 'default' | 'present';

let mermaidInitialized = false;

async function initMermaid(variant: VisualVariant) {
  const mermaid = (await import('mermaid')).default;
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: variant === 'present' ? 'dark' : 'dark',
      securityLevel: 'strict',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    });
    mermaidInitialized = true;
  }
  return mermaid;
}

function setSvgFromString(container: HTMLDivElement, svgMarkup: string) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgMarkup, 'image/svg+xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    const p = document.createElement('p');
    p.className = 'text-xs text-red-400/90';
    p.textContent = 'Could not parse diagram SVG.';
    container.appendChild(p);
    return;
  }
  container.appendChild(doc.documentElement);
}

export function MermaidDiagramBlock({
  code,
  variant = 'default',
}: {
  code: string;
  variant?: VisualVariant;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const id = `mmd-${Math.random().toString(36).slice(2, 11)}`;

    (async () => {
      try {
        const mermaid = await initMermaid(variant);
        const { svg } = await mermaid.render(id, code.trim());
        if (cancelled || !containerRef.current) return;
        setSvgFromString(containerRef.current, svg);
      } catch (e) {
        if (cancelled || !containerRef.current) return;
        while (containerRef.current.firstChild) {
          containerRef.current.removeChild(containerRef.current.firstChild);
        }
        const p = document.createElement('p');
        p.className = 'text-xs text-red-400/90';
        p.textContent = `Could not render diagram: ${e instanceof Error ? e.message : String(e)}`;
        containerRef.current.appendChild(p);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, variant]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'my-3 overflow-x-auto rounded-lg border border-white/[0.06] bg-black/25 p-4 [&_svg]:max-w-none',
        variant === 'present' && 'bg-black/45',
      )}
    />
  );
}

/**
 * Renders sanitized HTML in a sandboxed iframe (SVG/CSS layouts; scripts stripped).
 */
export function HtmlVisualBlock({ code, variant = 'default' }: { code: string; variant?: VisualVariant }) {
  const srcDoc =
    typeof window !== 'undefined'
      ? DOMPurify.sanitize(code.trim(), {
          WHOLE_DOCUMENT: true,
          ADD_TAGS: [
            'style',
            'svg',
            'defs',
            'linearGradient',
            'stop',
            'path',
            'circle',
            'rect',
            'line',
            'polyline',
            'polygon',
            'g',
            'text',
            'tspan',
            'foreignObject',
            'title',
            'desc',
            'ellipse',
            'marker',
            'pattern',
            'clipPath',
            'mask',
          ],
          ADD_ATTR: [
            'viewBox',
            'xmlns',
            'width',
            'height',
            'fill',
            'stroke',
            'stroke-width',
            'd',
            'cx',
            'cy',
            'r',
            'x',
            'y',
            'x1',
            'y1',
            'x2',
            'y2',
            'points',
            'transform',
            'class',
            'id',
            'style',
            'text-anchor',
            'dominant-baseline',
            'font-size',
            'rx',
            'ry',
            'preserveAspectRatio',
          ],
        })
      : '';

  return (
    <div
      className={cn(
        'my-3 overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.03]',
        variant === 'present' && 'border-white/[0.12]',
      )}
    >
      <iframe
        title="Inline visual"
        srcDoc={srcDoc}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        className="min-h-[220px] w-full bg-[#0a0a0f]"
        style={{ minHeight: 220 }}
      />
      <p className="border-t border-white/[0.06] px-3 py-1.5 text-[10px] text-text-muted">
        Inline HTML visual (sanitized, no scripts). For flowcharts and diagrams, use a{' '}
        <code className="rounded bg-white/[0.06] px-1">mermaid</code> code block.
      </p>
    </div>
  );
}
