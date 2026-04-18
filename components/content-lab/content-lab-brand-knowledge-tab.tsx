'use client';

import type { KnowledgeEntry, KnowledgeGraphData } from '@/lib/knowledge/types';
import { VaultLayout } from '@/components/knowledge/VaultLayout';
import { ContentLabContentStackCard } from '@/components/content-lab/content-lab-content-stack-card';
import type { Pillar } from '@/components/ideas-hub/pillar-card';
import type { PillarReferencePreview } from '@/lib/content-lab/pillar-reference-previews';

type BrandGuidelinePayload = {
  id: string;
  content: string;
  metadata: unknown;
  created_at: string;
  updated_at: string;
} | null;

type ContentLabBrandKnowledgeTabProps = {
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
 * Full knowledge surface for Strategy Lab: vault (docs, graph, meetings) and brand DNA bento.
 */
export function ContentLabBrandKnowledgeTab({
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
}: ContentLabBrandKnowledgeTabProps) {
  return (
    <div className="flex flex-col gap-8">
      <ContentLabContentStackCard
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
    </div>
  );
}
