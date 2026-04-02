'use client';

import { ExternalLink } from 'lucide-react';

type Props = {
  /** Base URL of the TrustGraph Workbench (e.g. http://localhost:8888) */
  baseUrl: string;
};

/**
 * Embeds the TrustGraph Workbench UI (vector search, Graph Visualizer, Relationships, flows).
 * If the upstream app sets X-Frame-Options, use “Open in new tab” instead.
 *
 * @see https://github.com/trustgraph-ai/trustgraph
 */
export function TrustGraphWorkbenchEmbed({ baseUrl }: Props) {
  const src = baseUrl.replace(/\/$/, '');

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2.5 border-b border-nativz-border bg-surface">
        <p className="text-xs text-text-muted leading-relaxed max-w-[min(100%,42rem)]">
          TrustGraph Workbench — 3D graph visualizer, relationships, vector search, flows, and knowledge cores.
          Deploy locally with{' '}
          <code className="text-[10px] px-1 py-0.5 rounded bg-background text-text-secondary">npx @trustgraph/config</code>
          . Upstream:{' '}
          <a
            href="https://github.com/trustgraph-ai/trustgraph"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-text hover:underline"
          >
            trustgraph-ai/trustgraph
          </a>
          .
        </p>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-nativz-border bg-background px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors"
        >
          <ExternalLink size={13} />
          Open Workbench
        </a>
      </div>
      <iframe
        title="TrustGraph Workbench"
        src={src}
        className="flex-1 w-full min-h-0 border-0 bg-background"
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </div>
  );
}
