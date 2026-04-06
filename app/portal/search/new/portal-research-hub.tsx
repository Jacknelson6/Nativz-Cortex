'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ResearchTopicForm } from '@/components/research/research-topic-form';
import {
  TopicSearchHistoryRail,
  useTopicSearchHistoryRailOpen,
} from '@/components/research/topic-search-history-rail';
import type { HistoryItem } from '@/lib/research/history';
import { cn } from '@/lib/utils/cn';

interface PortalResearchHubProps {
  client: { id: string; name: string; logo_url: string | null; agency: string | null };
  historyItems: HistoryItem[];
  userFirstName?: string | null;
}

export function PortalResearchHub({
  client,
  historyItems,
  userFirstName = null,
}: PortalResearchHubProps) {
  const router = useRouter();
  const [optimisticItems, setOptimisticItems] = useState<HistoryItem[]>([]);
  const [historyRailOpen, setHistoryRailOpen] = useTopicSearchHistoryRailOpen();
  const prevHistoryRef = useRef(historyItems);

  // Detect server-side history refresh (e.g. revalidation after search completes)
  if (historyItems !== prevHistoryRef.current) {
    prevHistoryRef.current = historyItems;
    setOptimisticItems([]);
  }

  const allItems = [...optimisticItems, ...historyItems];

  // Remap admin hrefs → portal hrefs in history items
  const portalItems = allItems.map((item) => ({
    ...item,
    href: item.href.replace(/^\/admin\//, '/portal/'),
  }));

  const handleSearchStarted = useCallback(
    (info: { id: string; query: string; mode: string; clientName: string | null; needsSubtopics?: boolean }) => {
      const now = new Date().toISOString();
      const optimisticItem: HistoryItem = {
        id: info.id,
        type: info.mode === 'client_strategy' ? 'brand_intel' : 'topic',
        title: info.query,
        status: info.needsSubtopics ? 'pending_subtopics' : 'processing',
        clientName: info.clientName,
        clientId: client.id,
        createdAt: now,
        href: info.needsSubtopics
          ? `/portal/search/${info.id}/subtopics`
          : `/portal/search/${info.id}/processing`,
      };
      setOptimisticItems((prev) => [optimisticItem, ...prev]);
    },
    [client.id],
  );

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col',
        'lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden',
      )}
    >
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-8 lg:grid lg:items-stretch lg:gap-10',
          'lg:overflow-hidden',
          'lg:transition-[grid-template-columns] lg:duration-300 lg:ease-[cubic-bezier(0.32,0.72,0,1)]',
          historyRailOpen
            ? 'lg:grid-cols-[300px_minmax(0,1fr)]'
            : 'lg:grid-cols-[2.5rem_minmax(0,1fr)]',
        )}
      >
        {/* Main column: centered search form */}
        <div
          className={cn(
            'flex min-w-0 w-full shrink-0 justify-center lg:col-start-2 lg:row-start-1 xl:pl-2',
            'lg:min-h-0 lg:flex-1 lg:flex-col lg:items-center lg:justify-center lg:overflow-hidden',
          )}
        >
          <div className="w-full max-w-xl px-4 pt-8 lg:pt-0">
            <ResearchTopicForm
              clients={[client]}
              portalMode
              fixedClientId={client.id}
              fixedClientName={client.name}
              userFirstName={userFirstName}
              onStarted={handleSearchStarted}
            />
          </div>
        </div>

        {/* History rail — left column on desktop, below on mobile */}
        <div
          className={cn(
            'flex min-h-0 w-full flex-col',
            'max-lg:flex-1',
            'lg:col-start-1 lg:row-start-1 lg:sticky lg:top-0 lg:h-screen lg:shrink-0 lg:self-start lg:overflow-hidden',
          )}
        >
          <TopicSearchHistoryRail
            open={historyRailOpen}
            onOpen={() => setHistoryRailOpen(true)}
            onClose={() => setHistoryRailOpen(false)}
            items={portalItems}
            historyResetKey={historyItems.map((i) => i.id).join(',')}
            serverHistoryCount={historyItems.length}
            clients={[{ id: client.id, name: client.name }]}
            includeIdeas={false}
            enableStrategyLabBulkSelect={false}
            hideClientInSidebar
            enableFolders={false}
          />
        </div>
      </div>
    </div>
  );
}
