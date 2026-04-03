'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Library, BarChart3, MessageSquare } from 'lucide-react';
import type { KnowledgeEntry, KnowledgeGraphData } from '@/lib/knowledge/types';
import type { Pillar } from '@/components/ideas-hub/pillar-card';
import type { TopicSearchRow } from '@/components/strategy-lab/topic-search-selection-card';
import { StrategyLabBrandKnowledgeTab } from '@/components/strategy-lab/strategy-lab-brand-knowledge-tab';
import { StrategyLabNerdChat } from '@/components/strategy-lab/strategy-lab-nerd-chat';
import { AnalyticsDashboard } from '@/components/reporting/analytics-dashboard';
import type { PillarReferencePreview } from '@/lib/strategy-lab/pillar-reference-previews';
import { strategyLabTopicSearchStorageKey } from '@/lib/strategy-lab/topic-search-selection-storage';
import { cn } from '@/lib/utils';

type MainTab = 'chat' | 'knowledge-base' | 'analytics';

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
  moodBoards: _moodBoards,
  hasCompletedIdeaGeneration: _hasCompletedIdeaGeneration,
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
  const storageKey = strategyLabTopicSearchStorageKey(clientId);

  const [mainTab, setMainTab] = useState<MainTab>('chat');
  const [selectedTopicSearchId, setSelectedTopicSearchId] = useState<string | null>(null);

  // Auto-attach the most recent completed topic search
  const mostRecentCompletedSearch = useMemo(
    () => topicSearches.find((s) => s.status === 'completed') ?? null,
    [topicSearches],
  );

  const pinnedTopicSearchIds = useMemo(
    () => (selectedTopicSearchId ? [selectedTopicSearchId] : []),
    [selectedTopicSearchId],
  );

  const hasCompletedTopicSearch = useMemo(
    () => topicSearches.some((s) => s.status === 'completed'),
    [topicSearches],
  );
  const hasPillars = pillars.length > 0;
  const brandDnaReady = !!brandGuideline && brandDnaStatus !== 'generating';
  const canGenerateIdeas = hasPillars && brandDnaReady;

  // Load saved selection from localStorage, or auto-select most recent
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const ids = parsed.filter((x): x is string => typeof x === 'string');
          const mostRecent = ids.at(-1);
          if (mostRecent) {
            setSelectedTopicSearchId(mostRecent);
            return;
          }
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
    // Auto-select most recent completed search if nothing saved
    if (mostRecentCompletedSearch) {
      setSelectedTopicSearchId(mostRecentCompletedSearch.id);
    }
  }, [storageKey, mostRecentCompletedSearch]);

  // Validate selected search still exists
  useEffect(() => {
    if (!selectedTopicSearchId) return;
    const exists = topicSearches.some((search) => search.id === selectedTopicSearchId);
    if (!exists) {
      setSelectedTopicSearchId(null);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([]));
      } catch {
        /* ignore quota */
      }
    }
  }, [selectedTopicSearchId, topicSearches, storageKey]);

  const attachTopicSearch = useCallback(
    (id: string) => {
      setSelectedTopicSearchId(id);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([id]));
      } catch {
        /* ignore quota */
      }
    },
    [storageKey],
  );

  // Keep attachTopicSearch reference for future use
  void attachTopicSearch;

  const brandDnaHref = `/admin/clients/${clientSlug}/brand-dna`;
  const ideasHubBase = `/admin/ideas?clientId=${encodeURIComponent(clientId)}`;
  const pillarStrategyHref = `${ideasHubBase}&focus=pillars`;
  const ideasHubPillarIdeasHref = `${ideasHubBase}&focus=pillar-ideas`;
  const ideasHref = `/admin/clients/${clientSlug}/ideas`;

  const MAIN_TABS: { id: MainTab; label: string; icon: typeof MessageSquare }[] = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'knowledge-base', label: 'Knowledge Base', icon: Library },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Floating pill nav — centered at top */}
      <div className="flex justify-center py-3">
        <div className="inline-flex gap-1 rounded-full border border-nativz-border bg-surface p-1 shadow-sm">
          {MAIN_TABS.map((tab) => {
            const active = mainTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMainTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-all',
                  active
                    ? 'bg-accent-surface text-accent-text shadow-sm'
                    : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary',
                )}
              >
                <Icon size={15} aria-hidden />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content — fills remaining height */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {mainTab === 'analytics' ? (
          <div className="h-full overflow-y-auto px-6 py-4">
            <div className="overflow-hidden rounded-xl border border-nativz-border/60 bg-surface">
              <div className="border-b border-nativz-border/50 px-4 py-3">
                <h3 className="text-sm font-semibold text-text-primary">Client analytics</h3>
                <p className="text-xs text-text-muted">Cross-platform social performance for this workspace.</p>
              </div>
              <div className="p-4">
                <AnalyticsDashboard initialClientId={clientId} />
              </div>
            </div>
          </div>
        ) : mainTab === 'knowledge-base' ? (
          <div className="h-full overflow-y-auto px-6 py-4">
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
          </div>
        ) : (
          /* Chat tab — full height, chat is the primary experience */
          <div className="flex h-full flex-col px-6 py-2">
            <StrategyLabNerdChat
              clientId={clientId}
              clientName={clientName}
              clientSlug={clientSlug}
              pinnedTopicSearchIds={pinnedTopicSearchIds}
            />
          </div>
        )}
      </div>
    </div>
  );
}
