'use client';

import { useState, useEffect, useCallback } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { HistoryFeed } from '@/components/research/history-feed';
import { cn } from '@/lib/utils/cn';
import type { HistoryItem } from '@/lib/research/history';

const STORAGE_KEY = 'cortex:topic-search-history-open';

interface TopicSearchHistoryRailProps {
  items: HistoryItem[];
  historyResetKey: string;
  serverHistoryCount: number;
  clients: { id: string; name: string }[];
  /** When false, desktop rail is narrow strip; grid column width comes from parent */
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** Topic search rail lists topic runs only; idea generations are excluded by default */
  includeIdeas?: boolean;
  enableStrategyLabBulkSelect?: boolean;
  onStrategyLabSelectionChange?: (payload: { ids: string[]; clientId: string | null }) => void;
}

export function TopicSearchHistoryRail({
  items,
  historyResetKey,
  serverHistoryCount,
  clients,
  open,
  onOpen,
  onClose,
  includeIdeas = false,
  enableStrategyLabBulkSelect = false,
  onStrategyLabSelectionChange,
}: TopicSearchHistoryRailProps) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col lg:h-full lg:min-h-0">
      {/* Mobile / tablet: full-width history (no collapse) */}
      <div className="flex min-h-0 w-full flex-1 flex-col lg:hidden">
        <HistoryFeed
          variant="sidebar"
          includeIdeas={includeIdeas}
          items={items}
          historyResetKey={historyResetKey}
          serverHistoryCount={serverHistoryCount}
          clients={clients}
          enableStrategyLabBulkSelect={enableStrategyLabBulkSelect}
          onStrategyLabSelectionChange={onStrategyLabSelectionChange}
        />
      </div>

      {/* Desktop: Nerd-style collapsible rail — single flex child so height chain works */}
      <div
        className={cn(
          'hidden min-h-0 flex-1 flex-col border-nativz-border lg:flex lg:h-full',
          open
            ? 'w-[260px] border-r bg-surface/50'
            : 'w-10 border-r border-nativz-border/50 bg-surface/30',
        )}
      >
        {!open ? (
          <div className="flex h-full min-h-0 flex-col items-center gap-3 py-3">
            <button
              type="button"
              onClick={onOpen}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
              title="Open history"
            >
              <PanelLeftOpen size={15} />
            </button>
            <div className="min-h-0 flex-1" />
            <span className="select-none text-[9px] text-text-muted/30 [writing-mode:vertical-lr] rotate-180">
              History
            </span>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between border-b border-nativz-border/50 px-3 py-3">
              <span className="text-xs font-semibold text-text-primary">History</span>
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer text-text-muted transition-colors hover:text-text-secondary"
                title="Close sidebar"
              >
                <PanelLeftClose size={15} />
              </button>
            </div>
            <HistoryFeed
              variant="sidebar"
              embeddedInNerdRail
              includeIdeas={includeIdeas}
              items={items}
              historyResetKey={historyResetKey}
              serverHistoryCount={serverHistoryCount}
              clients={clients}
              enableStrategyLabBulkSelect={enableStrategyLabBulkSelect}
              onStrategyLabSelectionChange={onStrategyLabSelectionChange}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Hydrate open state from localStorage (default open). */
export function useTopicSearchHistoryRailOpen(): [boolean, (v: boolean) => void] {
  const [open, setOpenState] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === 'false') setOpenState(false);
      if (raw === 'true') setOpenState(true);
    } catch {
      /* ignore */
    }
  }, []);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
  }, []);

  return [open, setOpen];
}
