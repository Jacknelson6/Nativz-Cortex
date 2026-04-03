'use client';

import { BookOpen, ExternalLink } from 'lucide-react';

type Props = {
  /** Base URL of the TrustGraph Workbench (e.g. http://localhost:8081) */
  baseUrl: string;
};

/**
 * Shown when the user picks TrustGraph but `NEXT_PUBLIC_TRUSTGRAPH_WORKBENCH_URL` is unset.
 * Makes the tab discoverable without silent failure.
 */
export function TrustGraphWorkbenchSetup() {
  return (
    <div className="flex flex-1 min-h-0 flex-col items-center justify-center p-8 bg-background">
      <div className="max-w-lg w-full rounded-xl border border-nativz-border bg-surface p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen size={18} className="text-accent-text" />
          <h2 className="text-sm font-semibold text-text-primary">Connect TrustGraph Workbench</h2>
        </div>
        <p className="text-xs text-text-muted leading-relaxed mb-4">
          The Workbench (graph visualizer, relationships, vector search) runs as its own app. Point Cortex at it with a public env var, then restart{' '}
          <code className="text-[10px] px-1 py-0.5 rounded bg-background">npm run dev</code>.
        </p>
        <p className="text-xs font-medium text-text-secondary mb-2">Add to <code className="text-[10px] text-text-muted">.env.local</code>:</p>
        <pre className="text-left text-xs font-mono text-text-primary bg-background border border-nativz-border rounded-lg p-3 mb-4 overflow-x-auto">
          {`NEXT_PUBLIC_TRUSTGRAPH_WORKBENCH_URL=http://localhost:8081`}
        </pre>
        <p className="text-xs text-text-muted mb-4">
          Use the host and port where <strong className="text-text-secondary">Workbench</strong> is listening (here <strong className="text-text-secondary">8081</strong> on your Mac mini; upstream quickstarts often use <strong className="text-text-secondary">8888</strong>). The API gateway may be a different port (e.g. <strong className="text-text-secondary">8080</strong>). See{' '}
          <a
            href="https://github.com/trustgraph-ai/trustgraph#quickstart"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-text hover:underline"
          >
            TrustGraph quickstart
          </a>
          .
        </p>
        <a
          href="https://github.com/trustgraph-ai/trustgraph"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-text hover:underline"
        >
          <ExternalLink size={13} />
          trustgraph-ai/trustgraph on GitHub
        </a>
      </div>
    </div>
  );
}

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
