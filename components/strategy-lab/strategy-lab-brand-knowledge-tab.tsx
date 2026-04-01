'use client';

import Link from 'next/link';
import { FileText, Mic2 } from 'lucide-react';
import type { KnowledgeEntry, KnowledgeGraphData } from '@/lib/knowledge/types';
import { VaultLayout } from '@/components/knowledge/VaultLayout';
import { StrategyLabContentStackCard } from '@/components/strategy-lab/strategy-lab-content-stack-card';
import { StrategyLabProspectAudit } from '@/components/strategy-lab/strategy-lab-prospect-audit';
import { StrategyLabVisualizer } from '@/components/strategy-lab/strategy-lab-visualizer';
import type { Pillar } from '@/components/ideas-hub/pillar-card';
import type { PillarReferencePreview } from '@/lib/strategy-lab/pillar-reference-previews';

type BrandGuidelinePayload = {
  id: string;
  content: string;
  metadata: unknown;
  created_at: string;
  updated_at: string;
} | null;

type StrategyLabBrandKnowledgeTabProps = {
  clientId: string;
  clientSlug: string;
  clientName: string;
  brandDnaStatus: string;
  brandGuideline: BrandGuidelinePayload;
  vaultEntries: KnowledgeEntry[];
  vaultGraphData: KnowledgeGraphData;
  pillars: Pillar[];
  pillarReferencePreviews: Record<string, PillarReferencePreview>;
  hasCompletedTopicSearch: boolean;
  hasPillars: boolean;
  canGenerateIdeas: boolean;
  pillarStrategyHref: string;
  ideasHubPillarIdeasHref: string;
  ideasHref: string;
  brandDnaHref: string;
};

/**
 * Full knowledge surface for Strategy Lab: vault (docs, graph, meetings), brand DNA bento, and legacy tools.
 */
export function StrategyLabBrandKnowledgeTab({
  clientId,
  clientSlug,
  clientName,
  brandDnaStatus,
  brandGuideline,
  vaultEntries,
  vaultGraphData,
  pillars,
  pillarReferencePreviews,
  hasCompletedTopicSearch,
  hasPillars,
  canGenerateIdeas,
  pillarStrategyHref,
  ideasHubPillarIdeasHref,
  ideasHref,
  brandDnaHref,
}: StrategyLabBrandKnowledgeTabProps) {
  const knowledgePageHref = `/admin/clients/${clientSlug}/knowledge`;

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-xl border border-nativz-border/50 bg-surface/50 px-4 py-4 sm:px-5">
        <p className="text-sm text-text-secondary">
          Everything here is indexed for Cortex in Strategy Lab — upload docs, connect meeting notes, and keep
          brand DNA current so chat and agents stay aligned on <span className="font-medium text-text-primary">{clientName}</span>.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={knowledgePageHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-text underline-offset-4 hover:underline"
          >
            <FileText className="h-4 w-4 shrink-0" aria-hidden />
            Open full knowledge page
          </Link>
          <Link
            href="/admin/meetings"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted underline-offset-4 hover:text-accent-text hover:underline"
          >
            <Mic2 className="h-4 w-4 shrink-0" aria-hidden />
            Meeting notes
          </Link>
        </div>
      </div>

      <StrategyLabContentStackCard
        clientId={clientId}
        brandDnaStatus={brandDnaStatus}
        brandGuideline={brandGuideline}
        hasCompletedTopicSearch={hasCompletedTopicSearch}
        hasPillars={hasPillars}
        pillars={pillars}
        pillarReferencePreviews={pillarReferencePreviews}
        canGenerateIdeas={canGenerateIdeas}
        pillarStrategyHref={pillarStrategyHref}
        ideasHubPillarIdeasHref={ideasHubPillarIdeasHref}
        ideasHref={ideasHref}
        brandDnaHref={brandDnaHref}
        variant="brand-dna-only"
      />

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">Knowledge vault</h2>
        <div className="overflow-hidden rounded-xl border border-nativz-border/60 bg-surface">
          <VaultLayout
            clientId={clientId}
            clientName={clientName}
            clientSlug={clientSlug}
            initialEntries={vaultEntries}
            initialGraphData={vaultGraphData}
          />
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">Prospect audit</h2>
          <div className="rounded-xl border border-nativz-border/50 bg-surface/40 p-4">
            <StrategyLabProspectAudit clientId={clientId} />
          </div>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">Visualizer</h2>
          <div className="rounded-xl border border-nativz-border/50 bg-surface/40 p-4">
            <StrategyLabVisualizer clientId={clientId} />
          </div>
        </div>
      </div>
    </div>
  );
}
