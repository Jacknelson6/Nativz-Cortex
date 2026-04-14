'use client';

import { useEffect, useMemo, useState } from 'react';
import type { KnowledgeEntry, KnowledgeGraphData } from '@/lib/knowledge/types';
import type { Pillar } from '@/components/ideas-hub/pillar-card';
import type { TopicSearchRow } from '@/components/strategy-lab/topic-search-selection-card';
import { StrategyLabNerdChat } from '@/components/strategy-lab/strategy-lab-nerd-chat';
import { strategyLabTopicSearchStorageKey } from '@/lib/strategy-lab/topic-search-selection-storage';

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

/**
 * Content Lab workspace — after the April 2026 refactor this is a thin shell
 * that hydrates the pinned-topic-search state from localStorage and hands off
 * to the chat. The old Knowledge Base / Analytics / Artifacts tab nav was
 * removed; artifacts now live in the left rail, knowledge and analytics live
 * at their own sidebar routes.
 *
 * The brand-dna / pillar / moodboard / vault props are still loaded by the
 * page-level fetch so future surfaces (e.g. a Brand Knowledge peek panel) can
 * be re-attached here without reshaping the server fetch.
 */
export function StrategyLabWorkspace({
  clientId,
  clientSlug,
  clientName,
  topicSearches,
  // Brand, pillar, moodboard, and vault props are kept for future use. They
  // were rendered by the retired Knowledge Base tab.
}: {
  clientId: string;
  clientSlug: string;
  clientName: string;
  brandDnaStatus: string;
  brandGuideline: BrandGuidelinePayload;
  topicSearches: TopicSearchRow[];
  pillars: Pillar[];
  pillarReferencePreviews: Record<string, unknown>;
  moodBoards: MoodboardRow[];
  hasCompletedIdeaGeneration: boolean;
  vaultEntries: KnowledgeEntry[];
  vaultGraphData: KnowledgeGraphData;
}) {
  const storageKey = strategyLabTopicSearchStorageKey(clientId);

  const [pinnedTopicSearchIds, setPinnedTopicSearchIds] = useState<string[]>([]);

  const mostRecentCompletedSearch = useMemo(
    () => topicSearches.find((s) => s.status === 'completed') ?? null,
    [topicSearches],
  );

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

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <StrategyLabNerdChat
        clientId={clientId}
        clientName={clientName}
        clientSlug={clientSlug}
        pinnedTopicSearchIds={pinnedTopicSearchIds}
      />
    </div>
  );
}
