'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ResearchTopicForm } from './research-topic-form';
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
  /** Greeting name on the search card */
  userFirstName?: string | null;
  /** URL `?query=` from the server — avoids useSearchParams() here so Radix IDs match SSR (hydration). */
  prefillQuery?: string;
}

export function ResearchHub({
  clients,
  historyItems,
  userFirstName = null,
  prefillQuery = '',
}: ResearchHubProps) {
  const router = useRouter();

  const [optimisticItems, setOptimisticItems] = useState<HistoryItem[]>([]);
  const [historyRailOpen, setHistoryRailOpen] = useTopicSearchHistoryRailOpen();
  const [contentLabBulkSelection, setContentLabBulkSelection] = useState<{
    ids: string[];
    clientId: string | null;
  }>({ ids: [], clientId: null });
  /**
   * Brand (client) selection persists across navigation via localStorage so
   * the user doesn't have to re-pick their brand every time they open a
   * report and hit back. Null means "All brands" — also persisted so an
   * explicit "clear brand" sticks too.
   */
  const [selectedClientId, setSelectedClientIdState] = useState<string | null>(null);
  const SELECTED_CLIENT_STORAGE_KEY = 'cortex:research-hub:selected-client-id';

  useEffect(() => {
    try {
      const raw =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(SELECTED_CLIENT_STORAGE_KEY)
          : null;
      if (raw === null) return;
      // Stored value is either a client UUID, or the literal string "null"
      // (explicit "All brands"). Either way, honour it.
      const stored = raw === 'null' ? null : raw;
      // Validate the stored id still exists — a stale UUID for a removed
      // client would silently hide all rows.
      if (stored && !clients.some((c) => c.id === stored)) return;
      setSelectedClientIdState(stored);
    } catch {
      /* ignore corrupt storage */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSelectedClientId = useCallback((id: string | null) => {
    setSelectedClientIdState(id);
    try {
      window.localStorage.setItem(SELECTED_CLIENT_STORAGE_KEY, id ?? 'null');
    } catch {
      /* ignore quota */
    }
  }, []);

  const prevHistoryRef = useRef(historyItems);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleContentLabSelectionChange = useCallback(
    (payload: { ids: string[]; clientId: string | null }) => {
      setContentLabBulkSelection(payload);
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
      // Poll every in-flight search each tick — previously this broke out
      // after the first completed one, leaving stuck icons for any other
      // searches still processing. Now the icons refresh as soon as each
      // search flips, and the interval only clears once they're all done.
      let anyChanged = false;
      let stillProcessing = 0;
      await Promise.all(
        processingIds.map(async (id) => {
          try {
            const res = await fetch(`/api/search/${id}`, { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json();
            if (data.status && data.status !== 'processing' && data.status !== 'pending') {
              anyChanged = true;
            } else {
              stillProcessing += 1;
            }
          } catch {
            // Treat transient errors as "still processing" so the poll
            // keeps trying instead of giving up and leaving a zombie icon.
            stillProcessing += 1;
          }
        }),
      );
      if (anyChanged) router.refresh();
      if (stillProcessing === 0 && pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }, 3000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [optimisticItems, historyItems, router]);

  /** Stable array identity when contents unchanged — avoids HistoryFeed content-lab sync loops. */
  const allItems = useMemo(() => {
    const combined = [...optimisticItems, ...historyItems];
    if (!selectedClientId) return combined;
    return combined.filter(item => item.clientId === selectedClientId);
  }, [optimisticItems, historyItems, selectedClientId]);

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
            'flex min-h-0 flex-1 flex-col gap-8 lg:grid lg:h-full lg:gap-0 lg:overflow-hidden',
            '',
            'lg:transition-[grid-template-columns] lg:duration-300 lg:ease-[cubic-bezier(0.32,0.72,0,1)]',
            historyRailOpen
              ? 'lg:grid-cols-[300px_minmax(0,1fr)]'
              : 'lg:grid-cols-[2.5rem_minmax(0,1fr)]',
          )}
        >
          {/* Main column: center hero in remaining space; min-h-0 so grid does not overflow the page */}
          <div
            className={cn(
              'flex min-w-0 w-full shrink-0 justify-center lg:col-start-2 lg:row-start-1 xl:pl-2',
              'lg:h-full lg:flex-col lg:items-center lg:justify-center lg:overflow-hidden',
            )}
          >
            <div className="w-full max-w-3xl -translate-y-1.5 lg:-translate-y-2">
              <ResearchTopicForm
                clients={clients}
                initialQuery={prefillQuery}
                userFirstName={userFirstName}
                contentLabBulkSelection={contentLabBulkSelection}
                onStarted={handleResearchStarted}
                onClientChange={setSelectedClientId}
                initialClientId={selectedClientId}
              />
            </div>
          </div>
          {/* History rail: left of content on lg+ (between app nav and workspace) */}
          <aside
            className={cn(
              'flex min-h-0 w-full flex-col',
              'max-lg:flex-1',
              'lg:col-start-1 lg:row-start-1 lg:h-full lg:overflow-hidden',
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
              enableContentLabBulkSelect
              onContentLabSelectionChange={handleContentLabSelectionChange}
              hideClientInSidebar
              filterClientId={selectedClientId}
            />
          </aside>
        </div>
      </section>

    </div>
  );
}
