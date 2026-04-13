'use client';

/**
 * ArtifactZoomModal — Claude-web-style artifact canvas for the Nerd chat.
 *
 * Opens when the user clicks a rendered mermaid diagram or html-visual block.
 * Shows the artifact at full size inside the existing Dialog, with:
 *   - Copy source (mermaid code or HTML markup)
 *   - Download SVG   (mermaid only)
 *   - Download PNG   (mermaid only — SVG rasterized via canvas)
 *
 * Keeps the modal thin on purpose: the live renderers
 * (MermaidDiagramBlock / HtmlVisualBlock) already know how to render their
 * kind, so we just instantiate them with a larger variant and wrap them in
 * chrome. No second mermaid initialization.
 */

import { useState } from 'react';
import { Copy, Check, Download, FileImage } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { HtmlVisualBlock, MermaidDiagramBlock, GraphvizDiagramBlock } from '@/components/ai/rich-code-block';
import { toast } from 'sonner';

export type ArtifactKind = 'mermaid' | 'html-visual' | 'graphviz';

interface ArtifactZoomModalProps {
  open: boolean;
  onClose: () => void;
  kind: ArtifactKind;
  source: string;
}

function useCopyState() {
  const [copied, setCopied] = useState(false);
  return {
    copied,
    copy: (text: string) => {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        })
        .catch(() => toast.error('Copy failed'));
    },
  };
}

/**
 * Find the actual SVG element produced by MermaidDiagramBlock inside the
 * modal body. We re-query on download because mermaid's async render replaces
 * the container children, so a ref captured at mount might be stale.
 */
function findMermaidSvg(container: HTMLElement | null): SVGSVGElement | null {
  if (!container) return null;
  return container.querySelector('svg');
}

function serializeSvg(svg: SVGSVGElement): string {
  // Clone so we can safely set explicit width/height + xmlns before serializing.
  const clone = svg.cloneNode(true) as SVGSVGElement;
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  const serializer = new XMLSerializer();
  return serializer.serializeToString(clone);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function rasterizeSvgToPng(svgMarkup: string, scale = 2): Promise<Blob> {
  const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Failed to load SVG into an Image'));
      i.src = url;
    });
    const w = Math.max(1, Math.round((img.naturalWidth || img.width || 1200) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || img.height || 800) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ArtifactZoomModal({ open, onClose, kind, source }: ArtifactZoomModalProps) {
  const { copied, copy } = useCopyState();
  const [downloading, setDownloading] = useState<null | 'svg' | 'png'>(null);

  const isMermaid = kind === 'mermaid';
  const isGraphviz = kind === 'graphviz';
  // Both SVG-emitting renderers share the download affordances.
  const isSvgKind = isMermaid || isGraphviz;
  const title = isMermaid ? 'Diagram' : isGraphviz ? 'Graph' : 'Visual';

  async function handleDownloadSvg() {
    const host = document.querySelector<HTMLElement>('[data-artifact-zoom-body]');
    const svg = findMermaidSvg(host);
    if (!svg) {
      toast.error('Diagram is still rendering');
      return;
    }
    setDownloading('svg');
    try {
      const markup = serializeSvg(svg);
      downloadBlob(new Blob([markup], { type: 'image/svg+xml' }), 'diagram.svg');
    } finally {
      setDownloading(null);
    }
  }

  async function handleDownloadPng() {
    const host = document.querySelector<HTMLElement>('[data-artifact-zoom-body]');
    const svg = findMermaidSvg(host);
    if (!svg) {
      toast.error('Diagram is still rendering');
      return;
    }
    setDownloading('png');
    try {
      const markup = serializeSvg(svg);
      const blob = await rasterizeSvgToPng(markup);
      downloadBlob(blob, 'diagram.png');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PNG download failed');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={title} maxWidth="5xl" bodyClassName="p-0">
      <div className="flex items-center justify-end gap-1.5 border-b border-white/[0.06] px-4 py-2">
        <button
          type="button"
          onClick={() => copy(source)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:bg-white/[0.06] hover:text-text-primary"
          title="Copy source"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy source'}
        </button>
        {isSvgKind && (
          <>
            <button
              type="button"
              onClick={handleDownloadSvg}
              disabled={downloading !== null}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:bg-white/[0.06] hover:text-text-primary disabled:opacity-50"
              title="Download SVG"
            >
              <Download size={13} />
              SVG
            </button>
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={downloading !== null}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:bg-white/[0.06] hover:text-text-primary disabled:opacity-50"
              title="Download PNG"
            >
              <FileImage size={13} />
              PNG
            </button>
          </>
        )}
      </div>
      <div
        data-artifact-zoom-body
        className="max-h-[calc(100vh-12rem)] overflow-auto bg-[#0a0a0f] p-6 [&_svg]:mx-auto [&_svg]:max-w-full"
      >
        {isMermaid ? (
          <MermaidDiagramBlock code={source} variant="present" disableZoom />
        ) : isGraphviz ? (
          <GraphvizDiagramBlock code={source} variant="present" disableZoom />
        ) : (
          <HtmlVisualBlock code={source} variant="present" disableZoom />
        )}
      </div>
    </Dialog>
  );
}
