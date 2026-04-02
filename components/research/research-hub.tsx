'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ResearchTopicForm, type ResearchTopicSnapshot } from './research-topic-form';
import { ResearchWizard } from './research-wizard';
import {
  TopicSearchHistoryRail,
  useTopicSearchHistoryRailOpen,
} from './topic-search-history-rail';
import type { HistoryItem } from '@/lib/research/history';
import type { ClientOption } from '@/components/ui/client-picker';
import { cn } from '@/lib/utils/cn';

interface ResearchHubProps {
  clients: ClientOption[];
  historyItems: HistoryItem[];
  /** When true, new searches use llm_v1 and go to subtopics planning first */
  topicPipelineLlmV1?: boolean;
  /** Greeting name on the search card */
  userFirstName?: string | null;
}

export function ResearchHub({
  clients,
  historyItems,
  topicPipelineLlmV1 = false,
  userFirstName = null,
}: ResearchHubProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillQuery = searchParams.get('query') ?? '';

  const [legacyModalOpen, setLegacyModalOpen] = useState(false);
  const [legacySnapshot, setLegacySnapshot] = useState<ResearchTopicSnapshot | null>(null);

  const [optimisticItems, setOptimisticItems] = useState<HistoryItem[]>([]);
  const [historyRailOpen, setHistoryRailOpen] = useTopicSearchHistoryRailOpen();
  const [strategyLabBulkSelection, setStrategyLabBulkSelection] = useState<{
    ids: string[];
    clientId: string | null;
  }>({ ids: [], clientId: null });
  const prevHistoryRef = useRef(historyItems);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleStrategyLabSelectionChange = useCallback(
    (payload: { ids: string[]; clientId: string | null }) => {
      setStrategyLabBulkSelection(payload);
    },
    [],
  );

  useEffect(() => {
    if (prevHistoryRef.current !== historyItems) {
      prevHistoryRef.current = historyItems;
      setOptimisticItems((prev) =>
        prev.filter((opt) => !historyItems.some((h) => h.id === opt.id))
      );
    }
  }, [historyItems]);

  useEffect(() => {
    const fromOptimistic = optimisticItems
      .filter((item) => item.status === 'processing' || item.status === 'pending')
      .map((item) => item.id);
    const fromHistory = historyItems
      .filter(
        (item) =>
          (item.type === 'topic' || item.type === 'brand_intel') &&
          (item.status === 'processing' || item.status === 'pending')
      )
      .map((item) => item.id);
    const processingIds = [...new Set([...fromOptimistic, ...fromHistory])];

    if (processingIds.length === 0) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    pollingRef.current = setInterval(async () => {
      for (const id of processingIds) {
        try {
          const res = await fetch(`/api/search/${id}`);
          if (!res.ok) continue;
          const data = await res.json();
          if (data.status && data.status !== 'processing' && data.status !== 'pending') {
            router.refresh();
            if (pollingRef.current) clearInterval(pollingRef.current);
            return;
          }
        } catch {
          // Ignore polling errors
        }
      }
    }, 5000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [optimisticItems, historyItems, router]);

  /** Stable array identity when contents unchanged — avoids HistoryFeed strategy-lab sync loops. */
  const allItems = useMemo(
    () => [...optimisticItems, ...historyItems],
    [optimisticItems, historyItems],
  );

  const handleResearchStarted = useCallback((item: {
    id: string;
    query: string;
    mode: string;
    clientName: string | null;
    needsSubtopics?: boolean;
  }) => {
    const needsSubtopics = Boolean(item.needsSubtopics);
    setOptimisticItems((prev) => [{
      id: item.id,
      type: item.mode === 'client_strategy' ? 'brand_intel' as const : 'topic' as const,
      title: item.query,
      status: needsSubtopics ? 'pending_subtopics' : 'processing',
      clientName: item.clientName,
      clientId: null,
      createdAt: new Date().toISOString(),
      href: needsSubtopics
        ? `/admin/search/${item.id}/subtopics`
        : `/admin/search/${item.id}/processing`,
    }, ...prev]);
  }, []);

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col px-6 pb-12 sm:px-8 lg:pl-0',
        /* Mobile / tablet: fill viewport so history list can flex to “View more” */
        'max-lg:min-h-[calc(100dvh-3.5rem)] max-lg:flex-1',
        /* Lock to viewport below header: no page scroll on lg+; only the history rail scrolls */
        'lg:h-[calc(100vh-3.5rem)] lg:min-h-0 lg:max-h-[calc(100vh-3.5rem)] lg:overflow-hidden lg:pb-0',
      )}
    >
      <section
        className={cn(
          'flex w-full flex-1 flex-col pt-6 sm:pt-8 md:pt-12 lg:pt-0',
          'min-h-0',
          'lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden',
        )}
      >
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col gap-8 lg:grid lg:items-stretch lg:gap-10',
            'lg:overflow-hidden',
            historyRailOpen
              ? 'lg:grid-cols-[260px_minmax(0,1fr)]'
              : 'lg:grid-cols-[2.5rem_minmax(0,1fr)]',
          )}
        >
          {/* Main column: center hero in remaining space; min-h-0 so grid does not overflow the page */}
          <div
            className={cn(
              'flex min-w-0 w-full shrink-0 justify-center lg:col-start-2 lg:row-start-1 xl:pl-2',
              'lg:min-h-0 lg:flex-1 lg:flex-col lg:items-center lg:justify-center lg:overflow-hidden',
            )}
          >
            <div className="w-full max-w-3xl -translate-y-1.5 lg:-translate-y-2">
              <ResearchTopicForm
                clients={clients}
                initialQuery={prefillQuery}
                topicPipelineLlmV1={topicPipelineLlmV1}
                userFirstName={userFirstName}
                strategyLabBulkSelection={strategyLabBulkSelection}
                onStarted={handleResearchStarted}
                onLegacyContinue={(snap) => {
                  setLegacySnapshot(snap);
                  setLegacyModalOpen(true);
                }}
              />
            </div>
          </div>
          {/* History rail: left of content on lg+ (between app nav and workspace) */}
          <aside
            className={cn(
              'flex min-h-0 w-full flex-col',
              'max-lg:flex-1',
              'lg:col-start-1 lg:row-start-1 lg:h-full lg:max-h-full lg:shrink-0 lg:self-stretch lg:overflow-hidden',
            )}
          >
            <TopicSearchHistoryRail
              open={historyRailOpen}
              onOpen={() => setHistoryRailOpen(true)}
              onClose={() => setHistoryRailOpen(false)}
              items={allItems}
              historyResetKey={historyItems.map((i) => i.id).join(',')}
              serverHistoryCount={historyItems.length}
              clients={clients.map((c) => ({ id: c.id, name: c.name }))}
              enableStrategyLabBulkSelect
              onStrategyLabSelectionChange={handleStrategyLabSelectionChange}
            />
          </aside>
        </div>
      </section>

      {!topicPipelineLlmV1 && (
        <ResearchWizard
          open={legacyModalOpen}
          onClose={() => {
            setLegacyModalOpen(false);
            setLegacySnapshot(null);
          }}
          clients={clients}
          step1Snapshot={legacySnapshot}
          topicPipelineLlmV1={topicPipelineLlmV1}
          onStarted={handleResearchStarted}
        />
      )}
    </div>
  );
}
