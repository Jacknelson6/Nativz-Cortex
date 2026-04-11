'use client';

import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import DOMPurify from 'dompurify';
import { Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type VisualVariant = 'default' | 'present';

// Modal is lazy-loaded so the default code path never pulls in the
// (small) zoom-modal bundle until the user actually clicks Expand.
const ArtifactZoomModal = lazy(() =>
  import('./artifact-zoom-modal').then((m) => ({ default: m.ArtifactZoomModal })),
);

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

/**
 * Mermaid 11+ returns a valid SVG for parse failures (bomb icon + "Syntax error in text"),
 * so render() does not throw. Treat that as failure and show a text fallback instead.
 */
function isMermaidErrorSvg(svg: string): boolean {
  const s = svg.toLowerCase();
  return (
    s.includes('syntax error in text') ||
    s.includes('class="error-text"') ||
    s.includes("class='error-text'") ||
    (s.includes('error-icon') && s.includes('error-text'))
  );
}

function renderMermaidFallback(container: HTMLDivElement, code: string, detail?: string) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  const wrap = document.createElement('div');
  wrap.className = 'space-y-2 text-left';
  const msg = document.createElement('p');
  msg.className = 'text-xs text-text-muted';
  msg.textContent =
    detail ??
    'This diagram could not be rendered. The Mermaid syntax may be invalid or unsupported.';
  const pre = document.createElement('pre');
  pre.className =
    'max-h-40 overflow-auto rounded-md bg-black/40 p-2 text-xs leading-relaxed text-text-secondary whitespace-pre-wrap break-words';
  pre.textContent = code.trim();
  wrap.appendChild(msg);
  wrap.appendChild(pre);
  container.appendChild(wrap);
}

export function MermaidDiagramBlock({
  code,
  variant = 'default',
  /** When true, skip zoom affordance — used by the zoom modal itself to
   *  avoid infinite recursive expand buttons. */
  disableZoom = false,
}: {
  code: string;
  variant?: VisualVariant;
  disableZoom?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomOpen, setZoomOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = `mmd-${Math.random().toString(36).slice(2, 11)}`;

    (async () => {
      try {
        const mermaid = await initMermaid(variant);
        const { svg } = await mermaid.render(id, code.trim());
        if (cancelled || !containerRef.current) return;
        if (isMermaidErrorSvg(svg)) {
          renderMermaidFallback(containerRef.current, code);
          return;
        }
        setSvgFromString(containerRef.current, svg);
      } catch (e) {
        if (cancelled || !containerRef.current) return;
        renderMermaidFallback(
          containerRef.current,
          code,
          `Could not render diagram: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, variant]);

  // The zoom modal reuses this component with disableZoom=true so it never
  // stacks another expand button on the fullscreen copy.
  const wrapperBase = cn(
    'group relative my-3 overflow-x-auto rounded-lg border border-white/[0.06] bg-black/25 p-4 [&_svg]:max-w-none',
    variant === 'present' && 'bg-black/45',
    !disableZoom && 'cursor-zoom-in transition-colors hover:border-white/[0.12] hover:bg-black/35',
  );

  if (disableZoom) {
    return <div ref={containerRef} className={wrapperBase} />;
  }

  return (
    <>
      <div
        ref={containerRef}
        role="button"
        tabIndex={0}
        onClick={() => setZoomOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setZoomOpen(true);
          }
        }}
        aria-label="Expand diagram"
        className={wrapperBase}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setZoomOpen(true);
          }}
          className="absolute right-2 top-2 z-10 inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/[0.08] bg-black/60 px-2 py-1 text-[10px] font-medium text-text-muted opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:text-text-primary"
          aria-hidden
          tabIndex={-1}
        >
          <Maximize2 size={10} />
          Expand
        </button>
      </div>
      {zoomOpen && (
        <Suspense fallback={null}>
          <ArtifactZoomModal
            open={zoomOpen}
            onClose={() => setZoomOpen(false)}
            kind="mermaid"
            source={code}
          />
        </Suspense>
      )}
    </>
  );
}

/**
 * Renders sanitized HTML in a sandboxed iframe (SVG/CSS layouts; scripts stripped).
 */
export function HtmlVisualBlock({
  code,
  variant = 'default',
  /** When true, skip the expand affordance — used by the zoom modal itself. */
  disableZoom = false,
}: {
  code: string;
  variant?: VisualVariant;
  disableZoom?: boolean;
}) {
  const [zoomOpen, setZoomOpen] = useState(false);
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

  const iframeEl = (
    <iframe
      title="Inline visual"
      srcDoc={srcDoc}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      className="min-h-[220px] w-full bg-[#0a0a0f]"
      style={{ minHeight: 220 }}
    />
  );

  if (disableZoom) {
    return (
      <div
        className={cn(
          'my-3 overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.03]',
          variant === 'present' && 'border-white/[0.12]',
        )}
      >
        {iframeEl}
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          'group relative my-3 overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.03] transition-colors hover:border-white/[0.12]',
          variant === 'present' && 'border-white/[0.12]',
        )}
      >
        <button
          type="button"
          onClick={() => setZoomOpen(true)}
          className="absolute right-2 top-2 z-10 inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/[0.08] bg-black/60 px-2 py-1 text-[10px] font-medium text-text-muted opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:text-text-primary"
          title="Expand visual"
        >
          <Maximize2 size={10} />
          Expand
        </button>
        {iframeEl}
        <p className="border-t border-white/[0.06] px-3 py-1.5 text-[10px] text-text-muted">
          Inline HTML visual (sanitized, no scripts). For flowcharts and diagrams, use a{' '}
          <code className="rounded bg-white/[0.06] px-1">mermaid</code> code block.
        </p>
      </div>
      {zoomOpen && (
        <Suspense fallback={null}>
          <ArtifactZoomModal
            open={zoomOpen}
            onClose={() => setZoomOpen(false)}
            kind="html-visual"
            source={code}
          />
        </Suspense>
      )}
    </>
  );
}
