'use client';

import { useEffect, useMemo, useState } from 'react';
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

const MAIN_TABS: { id: MainTab; label: string; icon: typeof MessageSquare }[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'knowledge-base', label: 'Knowledge Base', icon: Library },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

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

  // Full multi-pin state — previously this was a scalar `selectedTopicSearchId`
  // with the workspace collapsing localStorage down to its last entry, which
  // threw away multi-select batches from the history feed and the
  // "Open in Strategy Lab" button. Hoisting the full array means the chip
  // bar gets the real set of pinned ids on mount, and batches survive round
  // trips through the lab.
  const [pinnedTopicSearchIds, setPinnedTopicSearchIds] = useState<string[]>([]);

  // Auto-attach the most recent completed topic search when nothing is
  // persisted yet. Kept as a fallback for the brand-new-lab experience.
  const mostRecentCompletedSearch = useMemo(
    () => topicSearches.find((s) => s.status === 'completed') ?? null,
    [topicSearches],
  );

  const hasCompletedTopicSearch = useMemo(
    () => topicSearches.some((s) => s.status === 'completed'),
    [topicSearches],
  );
  const hasPillars = pillars.length > 0;
  const brandDnaReady = !!brandGuideline && brandDnaStatus !== 'generating';
  const canGenerateIdeas = hasPillars && brandDnaReady;

  // Load saved selection from localStorage, or auto-select most recent.
  // Drop any ids that are no longer valid searches so the chip bar never
  // shows a ghost pin. Runs on mount and whenever the underlying searches
  // change — so a delete from another tab propagates.
  useEffect(() => {
    const validIds = new Set(topicSearches.map((s) => s.id));
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const ids = parsed
            .filter((x): x is string => typeof x === 'string')
            .filter((id) => validIds.has(id));
          if (ids.length > 0) {
            setPinnedTopicSearchIds(ids);
            // Re-persist the pruned list so stale ids are cleaned up.
            try {
              window.localStorage.setItem(storageKey, JSON.stringify(ids));
            } catch {
              /* ignore quota */
            }
            return;
          }
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
    if (mostRecentCompletedSearch) {
      setPinnedTopicSearchIds([mostRecentCompletedSearch.id]);
    } else {
      setPinnedTopicSearchIds([]);
    }
  }, [storageKey, mostRecentCompletedSearch, topicSearches]);

  const brandDnaHref = `/admin/clients/${clientSlug}/brand-dna`;
  const ideasHubBase = `/admin/ideas?clientId=${encodeURIComponent(clientId)}`;
  const pillarStrategyHref = `${ideasHubBase}&focus=pillars`;
  const ideasHubPillarIdeasHref = `${ideasHubBase}&focus=pillar-ideas`;
  const ideasHref = `/admin/clients/${clientSlug}/ideas`;

  // Chat tab renders its own chrome (sidebar, header, input) so the outer
  // workspace hands off its entire content area. Other tabs reuse a shared
  // container shell so the floating tab nav lines up visually with the chat
  // container the user asked for.
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col p-3 md:p-5">
      {mainTab === 'chat' ? (
        <StrategyLabNerdChat
          clientId={clientId}
          clientName={clientName}
          clientSlug={clientSlug}
          pinnedTopicSearchIds={pinnedTopicSearchIds}
          mainTabs={MAIN_TABS}
          activeMainTab={mainTab}
          onMainTabChange={(next) => setMainTab(next as MainTab)}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-nativz-border/60 bg-background/40">
          {/* Shared floating tab nav — same pill that lives inside the chat on
              the Chat tab, kept in the same position for visual continuity. */}
          <div className="flex shrink-0 items-center justify-center border-b border-nativz-border/40 px-4 py-3">
            <div className="inline-flex gap-1 rounded-full border border-nativz-border/60 bg-surface/60 p-1 shadow-sm">
              {MAIN_TABS.map((tab) => {
                const active = mainTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMainTab(tab.id)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-full px-5 py-1.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-surface-hover text-text-primary shadow-sm'
                        : 'text-text-muted hover:bg-surface-hover/60 hover:text-text-secondary',
                    )}
                  >
                    <Icon size={15} aria-hidden />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab content */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {mainTab === 'analytics' ? (
              <div className="p-5">
                <AnalyticsDashboard initialClientId={clientId} />
              </div>
            ) : (
              <div className="p-5">
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}
