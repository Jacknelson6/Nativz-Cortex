'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Film, ClipboardList, ArrowRight } from 'lucide-react';
import { StrategyLabSection } from '@/components/strategy-lab/strategy-lab-section';
import type { Pillar } from '@/components/ideas-hub/pillar-card';
import {
  TopicSearchSelectionCard,
  type TopicSearchRow,
} from '@/components/strategy-lab/topic-search-selection-card';
import { StrategyLabStepper } from '@/components/strategy-lab/strategy-lab-stepper';
import { StrategyLabAssistantCard } from '@/components/strategy-lab/strategy-lab-assistant-card';
import { StrategyLabContentStackCard } from '@/components/strategy-lab/strategy-lab-content-stack-card';
import type { PillarReferencePreview } from '@/lib/strategy-lab/pillar-reference-previews';

const STORAGE_PREFIX = 'strategy-lab:selected-topic-searches:';

type MoodboardRow = {
  id: string;
  name: string;
  thumbnails: string[];
  itemCount: number;
};

type BrandGuidelinePayload = {
  id: string;
  content: string;
  metadata: unknown;
  created_at: string;
  updated_at: string;
} | null;

export function StrategyLabWorkspace({
  clientId,
  clientSlug,
  clientName,
  brandDnaStatus,
  brandGuideline,
  topicSearches,
  pillars,
  pillarReferencePreviews,
  moodBoards,
  hasCompletedIdeaGeneration,
}: {
  clientId: string;
  clientSlug: string;
  clientName: string;
  brandDnaStatus: string;
  brandGuideline: BrandGuidelinePayload;
  topicSearches: TopicSearchRow[];
  pillars: Pillar[];
  pillarReferencePreviews: Record<string, PillarReferencePreview>;
  moodBoards: MoodboardRow[];
  hasCompletedIdeaGeneration: boolean;
}) {
  const storageKey = `${STORAGE_PREFIX}${clientId}`;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const hasCompletedTopicSearch = useMemo(
    () => topicSearches.some((s) => s.status === 'completed'),
    [topicSearches],
  );
  const hasPillars = pillars.length > 0;
  const brandDnaReady = !!brandGuideline && brandDnaStatus !== 'generating';
  const canGenerateIdeas = hasPillars && brandDnaReady;
  const hasAnalysisBoards = moodBoards.length > 0;

  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const ids = parsed.filter((x): x is string => typeof x === 'string');
      setSelectedIds(new Set(ids));
    } catch {
      // ignore corrupt storage
    }
  }, [storageKey]);

  const persistSelection = useCallback(
    (next: Set<string>) => {
      setSelectedIds(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // ignore quota
      }
    },
    [storageKey],
  );

  const toggleId = useCallback(
    (id: string) => {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistSelection(next);
    },
    [selectedIds, persistSelection],
  );

  const brandDnaHref = `/admin/clients/${clientSlug}/brand-dna`;
  const ideasHref = `/admin/clients/${clientSlug}/ideas`;
  const ideasHubBase = `/admin/ideas?clientId=${encodeURIComponent(clientId)}`;
  const pillarStrategyHref = `${ideasHubBase}&focus=pillars`;
  const ideasHubPillarIdeasHref = `${ideasHubBase}&focus=pillar-ideas`;

  return (
    <div className="flex flex-col gap-6">
      <StrategyLabStepper
        hasCompletedTopicSearch={hasCompletedTopicSearch}
        hasPillars={hasPillars}
        brandDnaReady={brandDnaReady}
        hasCompletedIdeaGeneration={hasCompletedIdeaGeneration}
        hasAnalysisBoards={hasAnalysisBoards}
      />

      <TopicSearchSelectionCard
        topicSearches={topicSearches}
        selectedIds={selectedIds}
        onToggle={toggleId}
      />

      <StrategyLabAssistantCard clientId={clientId} clientName={clientName} />

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
      />

      <StrategyLabSection
        icon={Film}
        title="Analysis boards"
        actions={
          <Link
            href={`/admin/analysis?createBoard=1&clientId=${encodeURIComponent(clientId)}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-surface px-3 py-2 text-sm font-semibold text-accent-text transition hover:bg-accent-surface/80"
          >
            New analysis board
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        }
      >
        <ol className="mb-6 list-inside list-decimal space-y-2 rounded-lg border border-nativz-border/40 bg-background/30 px-4 py-3 text-sm text-text-secondary">
          <li>
            Add videos from a topic search (it includes links) or paste your own URLs onto a board.
          </li>
          <li>Review the board&apos;s analysis: hooks, takeaways, and patterns across clips.</li>
          <li>Use those insights to generate new video ideas and talking points for shoots (including from PDF briefs), or send the board to Cortex for a strategic read.</li>
        </ol>

        {moodBoards.length === 0 ? (
          <p className="text-sm text-text-muted">
            No boards for this client yet. Create an analysis board to compare reference videos side by
            side.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {moodBoards.map((b) => {
              const boardHref = `/admin/analysis/${b.id}`;
              const nerdBoardHref = `/admin/nerd?strategySource=strategy-lab&strategyClient=${encodeURIComponent(clientId)}&strategyBoardId=${encodeURIComponent(b.id)}&strategyBoardName=${encodeURIComponent(b.name)}`;
              return (
              <li key={b.id}>
                <div className="group flex h-full flex-col overflow-hidden rounded-xl border border-nativz-border/50 bg-background/50 transition hover:border-accent/40">
                  <Link href={boardHref} className="block">
                  <div className="relative aspect-[16/10] w-full bg-black/30">
                    {b.thumbnails.length >= 4 ? (
                      <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-px bg-black/40">
                        {b.thumbnails.slice(0, 4).map((src, ti) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={ti} src={src} alt="" className="h-full w-full object-cover" />
                        ))}
                      </div>
                    ) : b.thumbnails.length > 0 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.thumbnails[0]} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ClipboardList className="h-10 w-10 text-text-muted/35" aria-hidden />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 px-3 py-3">
                    <span className="line-clamp-2 font-medium text-foreground group-hover:text-accent-text">
                      {b.name}
                    </span>
                    <span className="text-xs text-text-muted">
                      {b.itemCount === 1 ? '1 item' : `${b.itemCount} items`} · Open board
                    </span>
                  </div>
                  </Link>
                  <div className="mt-auto flex items-center gap-2 border-t border-nativz-border/35 px-3 py-3">
                    <Link
                      href={nerdBoardHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent-surface px-3 py-2 text-xs font-semibold text-accent-text transition hover:bg-accent-surface/80"
                    >
                      Send to Cortex
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                    <Link
                      href={boardHref}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border/60 bg-background/40 px-3 py-2 text-xs font-medium text-text-secondary transition hover:border-accent/30 hover:text-text-primary"
                    >
                      Open board
                    </Link>
                  </div>
                </div>
              </li>
            )})}
          </ul>
        )}
      </StrategyLabSection>
    </div>
  );
}
