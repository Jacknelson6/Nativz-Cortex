'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, X } from 'lucide-react';

interface TopicSearchItem {
  id: string;
  query: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  search_mode: string | null;
  platforms: string[] | null;
  volume: string | null;
  metrics: { trending_topics_count?: number; topic_score?: number } | null;
}

interface StrategyLabTopicSearchChipBarProps {
  clientId: string;
  clientName: string;
  attachedSearchIds: string[];
  onToggle: (searchId: string) => void;
  /**
   * Initial attached set from the Strategy Lab selection storage — on mount
   * we merge this into attachedSearchIds if the user hasn't manually picked
   * anything yet. Lets the Research page's "Bring to Strategy Lab" flow
   * pre-attach the pinned searches.
   */
  pinnedTopicSearchIds: string[];
  /**
   * When no pinned IDs are set on first load, auto-attach the latest
   * completed search. Default: off. Users disliked the chat landing with a
   * research topic they didn't choose — pinning now has to be explicit.
   */
  autoAttachLatest?: boolean;
  refreshToken?: number;
  /**
   * Lifts the client searches list to the parent so the PDF export has the
   * query text + timestamps it needs to render the research-grounding block.
   */
  onSearchesLoaded?: (searches: TopicSearchItem[]) => void;
}

/**
 * Shows a chip for each attached topic search above the chat composer, with
 * an × to detach. Adding research lives in the composer's "+" button now —
 * this component renders nothing when nothing's attached.
 */
export function StrategyLabTopicSearchChipBar({
  clientId,
  attachedSearchIds,
  onToggle,
  pinnedTopicSearchIds,
  autoAttachLatest = false,
  refreshToken,
  onSearchesLoaded,
}: StrategyLabTopicSearchChipBarProps) {
  const [clientSearches, setClientSearches] = useState<TopicSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const hasAutoAttachedRef = useRef(false);

  useEffect(() => {
    if (!clientId) {
      setClientSearches([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/nerd/searches?clientId=${clientId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const fetched = (data.searches ?? []) as TopicSearchItem[];
        setClientSearches(fetched);
        onSearchesLoaded?.(fetched);

        if (!hasAutoAttachedRef.current && attachedSearchIds.length === 0) {
          hasAutoAttachedRef.current = true;
          if (pinnedTopicSearchIds.length > 0) {
            for (const id of pinnedTopicSearchIds) onToggle(id);
          } else if (autoAttachLatest) {
            const latest = fetched.find((s) => s.status === 'completed');
            if (latest) onToggle(latest.id);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setClientSearches([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Auto-attach runs once on mount; onToggle + attachedSearchIds stay out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, refreshToken]);

  const attachedSearches = useMemo(
    () =>
      attachedSearchIds
        .map((id) => clientSearches.find((s) => s.id === id))
        .filter((s): s is TopicSearchItem => !!s),
    [attachedSearchIds, clientSearches],
  );

  if (attachedSearches.length === 0 && !loading) return null;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-1 pb-2">
      {attachedSearches.map((s) => (
        <span
          key={s.id}
          className="inline-flex max-w-[240px] items-center gap-1.5 rounded-full border border-nativz-border/60 bg-surface-hover/50 pl-2.5 pr-1 py-0.5 text-xs text-text-primary"
        >
          <FileText size={10} className="shrink-0 text-accent-text/70" aria-hidden />
          <span className="truncate" title={s.query}>
            {s.query}
          </span>
          <button
            type="button"
            onClick={() => onToggle(s.id)}
            className="cursor-pointer rounded-full p-0.5 text-text-muted/70 hover:bg-surface-hover hover:text-text-primary"
            aria-label={`Remove ${s.query} from context`}
          >
            <X size={10} />
          </button>
        </span>
      ))}
    </div>
  );
}
