'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Film, ClipboardList, ArrowRight, Compass, BotMessageSquare, Library, BarChart3 } from 'lucide-react';
import type { KnowledgeEntry, KnowledgeGraphData } from '@/lib/knowledge/types';
import { StrategyLabSection } from '@/components/strategy-lab/strategy-lab-section';
import type { Pillar } from '@/components/ideas-hub/pillar-card';
import {
  TopicSearchSelectionCard,
  type TopicSearchRow,
} from '@/components/strategy-lab/topic-search-selection-card';
import { StrategyLabStepper } from '@/components/strategy-lab/strategy-lab-stepper';
import { StrategyLabContentStackCard } from '@/components/strategy-lab/strategy-lab-content-stack-card';
import { StrategyLabBrandKnowledgeTab } from '@/components/strategy-lab/strategy-lab-brand-knowledge-tab';
import { StrategyLabNerdChat } from '@/components/strategy-lab/strategy-lab-nerd-chat';
import { AnalyticsDashboard } from '@/components/reporting/analytics-dashboard';
import type { PillarReferencePreview } from '@/lib/strategy-lab/pillar-reference-previews';

type MainTab = 'content-strategy' | 'brand-knowledge' | 'analytics';
type ContentStrategyPanel = 'chat' | 'knowledge';

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
  vaultEntries,
  vaultGraphData,
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
  vaultEntries: KnowledgeEntry[];
  vaultGraphData: KnowledgeGraphData;
}) {
  const storageKey = `${STORAGE_PREFIX}${clientId}`;

  const [mainTab, setMainTab] = useState<MainTab>('content-strategy');
  const [csPanel, setCsPanel] = useState<ContentStrategyPanel>('chat');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const pinnedTopicSearchIds = useMemo(() => [...selectedIds], [selectedIds]);

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
      /* ignore corrupt storage */
    }
  }, [storageKey]);

  const persistSelection = useCallback(
    (next: Set<string>) => {
      setSelectedIds(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        /* ignore quota */
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

  const MAIN_TABS: { id: MainTab; label: string; icon: typeof Compass }[] = [
    { id: 'content-strategy', label: 'Content strategy', icon: Compass },
    { id: 'brand-knowledge', label: 'Brand knowledge', icon: Library },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  const CS_PANELS: { id: ContentStrategyPanel; label: string; icon: typeof BotMessageSquare }[] = [
    { id: 'chat', label: 'Chat with the Nerd', icon: BotMessageSquare },
    { id: 'knowledge', label: 'Brand knowledge', icon: Library },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Main tabs */}
      <div className="flex gap-1 rounded-lg border border-nativz-border bg-surface p-1">
        {MAIN_TABS.map((tab) => {
          const active = mainTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMainTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all ${
                active
                  ? 'bg-accent-surface text-accent-text'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary'
              }`}
            >
              <Icon size={16} aria-hidden />
              {tab.label}
            </button>
          );
        })}
      </div>

      {mainTab === 'analytics' ? (
        <div className="overflow-hidden rounded-xl border border-nativz-border/60 bg-surface">
          <div className="border-b border-nativz-border/50 px-4 py-3">
            <h3 className="text-sm font-semibold text-text-primary">Client analytics</h3>
            <p className="text-xs text-text-muted">Cross-platform social performance for this workspace.</p>
          </div>
          <div className="p-4">
            <AnalyticsDashboard initialClientId={clientId} />
          </div>
        </div>
      ) : mainTab === 'brand-knowledge' ? (
        <StrategyLabBrandKnowledgeTab
          clientId={clientId}
          clientSlug={clientSlug}
          clientName={clientName}
          brandDnaStatus={brandDnaStatus}
          brandGuideline={brandGuideline}
          vaultEntries={vaultEntries}
          vaultGraphData={vaultGraphData}
          pillars={pillars}
          pillarReferencePreviews={pillarReferencePreviews}
          hasCompletedTopicSearch={hasCompletedTopicSearch}
          hasPillars={hasPillars}
          canGenerateIdeas={canGenerateIdeas}
          pillarStrategyHref={pillarStrategyHref}
          ideasHubPillarIdeasHref={ideasHubPillarIdeasHref}
          ideasHref={ideasHref}
          brandDnaHref={brandDnaHref}
        />
      ) : (
        <>
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

          <p className="text-sm text-text-muted">
            Pin topic searches above so the first message in chat includes them as context for Cortex.
          </p>

          {/* Content strategy — chat / knowledge peek */}
          <div className="flex flex-col gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Strategy workspace
            </span>
            <div className="flex flex-wrap gap-1 rounded-lg border border-nativz-border/80 bg-background/30 p-1">
              {CS_PANELS.map((p) => {
                const Icon = p.icon;
                const active = csPanel === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setCsPanel(p.id)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-all sm:text-sm ${
                      active
                        ? 'bg-accent-surface text-accent-text'
                        : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary'
                    }`}
                  >
                    <Icon size={14} className="shrink-0" />
                    <span className="hidden sm:inline">{p.label}</span>
                    <span className="sm:hidden">{p.label.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>

            {csPanel === 'chat' ? (
              <StrategyLabNerdChat
                clientId={clientId}
                clientName={clientName}
                clientSlug={clientSlug}
                pinnedTopicSearchIds={pinnedTopicSearchIds}
              />
            ) : null}

            {csPanel === 'knowledge' ? (
              <div className="space-y-4 rounded-xl border border-nativz-border/60 bg-surface/50 p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-text-primary">Brand knowledge in Cortex</h3>
                    <p className="mt-1 text-sm text-text-secondary">
                      Vault entries, brand DNA, meeting notes, and uploads stay synced for this client. Open the full
                      Brand knowledge tab to manage everything.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMainTab('brand-knowledge')}
                    className="shrink-0 rounded-lg bg-accent-surface px-4 py-2 text-sm font-semibold text-accent-text transition hover:bg-accent-surface/80"
                  >
                    Open Brand knowledge
                  </button>
                </div>
                <ul className="list-inside list-disc space-y-1 text-sm text-text-muted">
                  <li>Knowledge vault (documents, graph, feed)</li>
                  <li>Brand DNA bento, color palette, and guideline</li>
                  <li>Meeting notes and prospect tools</li>
                </ul>
              </div>
            ) : null}
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
            variant="pillars-only"
          />

          <StrategyLabSection icon={Film} title="Analysis boards">
            <ol className="mb-6 list-inside list-decimal space-y-2 rounded-lg border border-nativz-border/40 bg-background/30 px-4 py-3 text-sm text-text-secondary">
              <li>
                Add videos from a topic search (it includes links) or paste your own URLs onto a board.
              </li>
              <li>Review the board&apos;s analysis: hooks, takeaways, and patterns across clips.</li>
              <li>
                Use those insights to generate new video ideas and talking points for shoots (including from PDF
                briefs), or send the board to Cortex for a strategic read.
              </li>
            </ol>

            {moodBoards.length === 0 ? (
              <p className="text-sm text-text-muted">
                No boards for this client yet. Use Cortex in chat to add reference videos and run the same analysis
                flow.
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
                  );
                })}
              </ul>
            )}
          </StrategyLabSection>
        </>
      )}
    </div>
  );
}
