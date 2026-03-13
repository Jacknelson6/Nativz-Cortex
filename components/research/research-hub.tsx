'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Sparkles } from 'lucide-react';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { ResearchWizard } from './research-wizard';
import { IdeasWizard } from './ideas-wizard';
import { HistoryFeed } from './history-feed';
import { HistoryModal } from './history-modal';
import type { HistoryItem } from '@/lib/research/history';
import type { ClientOption } from '@/components/ui/client-picker';

interface ResearchHubProps {
  clients: ClientOption[];
  historyItems: HistoryItem[];
}

export function ResearchHub({ clients, historyItems }: ResearchHubProps) {
  const router = useRouter();
  const [researchOpen, setResearchOpen] = useState(false);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [optimisticItems, setOptimisticItems] = useState<HistoryItem[]>([]);
  const prevHistoryRef = useRef(historyItems);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear optimistic items when server data refreshes (avoids duplicates)
  useEffect(() => {
    if (prevHistoryRef.current !== historyItems) {
      prevHistoryRef.current = historyItems;
      setOptimisticItems((prev) =>
        prev.filter((opt) => !historyItems.some((h) => h.id === opt.id))
      );
    }
  }, [historyItems]);

  // Poll processing items until they complete, then refresh server data
  useEffect(() => {
    const processingIds = optimisticItems
      .filter((item) => item.status === 'processing')
      .map((item) => item.id);

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
  }, [optimisticItems, router]);

  const allItems = [...optimisticItems, ...historyItems];

  const handleResearchStarted = useCallback((item: { id: string; query: string; mode: string; clientName: string | null }) => {
    setOptimisticItems((prev) => [{
      id: item.id,
      type: item.mode === 'client_strategy' ? 'brand_intel' as const : 'topic' as const,
      title: item.query,
      status: 'processing',
      clientName: item.clientName,
      clientId: null,
      createdAt: new Date().toISOString(),
      href: `/admin/search/${item.id}`,
    }, ...prev]);
  }, []);

  return (
    <div className="p-6 space-y-12">
      {/* Header + Cards */}
      <div className="flex flex-col items-center justify-center pt-8">
        <div className="w-full max-w-3xl">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-white">What would you like to research today?</h1>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Research card */}
            <SpotlightCard spotlightColor="rgba(91, 163, 230, 0.15)" className="p-7">
              <button
                type="button"
                onClick={() => setResearchOpen(true)}
                className="w-full text-left"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-surface mb-3">
                    <Search size={18} className="text-accent-text" />
                  </div>
                  <h2 className="text-base font-semibold text-text-primary mb-1">Research</h2>
                  <p className="text-sm text-text-muted mb-5">
                    Search what people are saying about a brand or topic
                  </p>
                  <div className="w-full rounded-xl bg-accent-surface/50 border border-accent/25 py-2.5 text-center">
                    <span className="text-sm font-semibold text-accent-text">Start research</span>
                  </div>
                </div>
              </button>
            </SpotlightCard>

            {/* Ideas card */}
            <SpotlightCard spotlightColor="rgba(234, 179, 8, 0.15)" className="p-7">
              <button
                type="button"
                onClick={() => setIdeasOpen(true)}
                className="w-full text-left"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-500/10 mb-3">
                    <Sparkles size={18} className="text-yellow-400" />
                  </div>
                  <h2 className="text-base font-semibold text-text-primary mb-1">Video ideas</h2>
                  <p className="text-sm text-text-muted mb-5">
                    Generate content ideas powered by AI + knowledge
                  </p>
                  <div className="w-full rounded-xl bg-yellow-500/10 border border-yellow-500/25 py-2.5 text-center">
                    <span className="text-sm font-semibold text-yellow-400">Generate ideas</span>
                  </div>
                </div>
              </button>
            </SpotlightCard>
          </div>
        </div>
      </div>

      {/* History feed */}
      <div className="max-w-3xl mx-auto w-full">
        <HistoryFeed
          items={allItems}
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          onViewAll={() => setHistoryModalOpen(true)}
        />
      </div>

      {/* Wizards */}
      <ResearchWizard
        open={researchOpen}
        onClose={() => setResearchOpen(false)}
        clients={clients}
        onStarted={handleResearchStarted}
      />
      <IdeasWizard
        open={ideasOpen}
        onClose={() => setIdeasOpen(false)}
        clients={clients}
      />

      {/* History modal */}
      <HistoryModal
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        initialItems={historyItems}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
