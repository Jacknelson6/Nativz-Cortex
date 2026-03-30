'use client';

import Link from 'next/link';
import { BotMessageSquare, ArrowRight } from 'lucide-react';
import { StrategyLabSection } from '@/components/strategy-lab/strategy-lab-section';

type StrategyLabAssistantCardProps = {
  clientId: string;
  clientName: string;
};

/**
 * Entry to Cortex (Nerd) with this client pre-attached for strategy review and Q&A.
 */
export function StrategyLabAssistantCard({ clientId, clientName }: StrategyLabAssistantCardProps) {
  const nerdHref = `/admin/nerd?strategySource=strategy-lab&strategyClient=${encodeURIComponent(clientId)}`;

  return (
    <StrategyLabSection
      icon={BotMessageSquare}
      title="Strategy assistant"
      description="Chat with Cortex (The Nerd) about this client. When you @mention the client, the server injects a Strategy Lab snapshot (pillars, recent topic searches, brand tone, idea run counts) plus the usual knowledge vault summary — use tools for live analytics."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={nerdHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-surface px-3 py-2 text-sm font-semibold text-accent-text transition hover:bg-accent-surface/80"
          >
            Open chat
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            href={`/admin/analytics/social?clientId=${encodeURIComponent(clientId)}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border/60 bg-background/40 px-3 py-2 text-sm font-medium text-text-secondary transition hover:border-accent/30 hover:text-text-primary"
          >
            Analytics
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      }
    >
      <p className="text-sm text-text-secondary">
        Roadmap: performance rollups, affiliates, and video understanding (tracked in the Strategy Lab brain PRD).
        Today: Strategy Lab snapshot + knowledge vault + Nerd tools for {clientName.trim() || 'this client'}.
      </p>
    </StrategyLabSection>
  );
}
