'use client';

import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import { SourceMentionCard } from '@/components/results/source-mention-card';
import {
  SourceDetailDialog,
  type LinkedIdeaOption,
} from '@/components/results/source-detail-dialog';
import type { PlatformSource } from '@/lib/types/search';
import type { ClientOption } from '@/components/ui/client-picker';
import { sortSources } from '@/lib/search/source-sources-sort';

function sourceKey(source: PlatformSource): string {
  return `${source.platform}:${source.id}`;
}

interface SourceBrowserProps {
  sources: PlatformSource[];
  searchId: string;
  searchQuery: string;
  clientContext: {
    name: string;
    industry?: string;
    topicKeywords?: string[];
  } | null;
  defaultClientId: string | null;
  clients: ClientOption[];
  linkedIdeas: LinkedIdeaOption[];
}

export function SourceBrowser({
  sources,
  searchId,
  searchQuery,
  clientContext,
  defaultClientId,
  clients,
  linkedIdeas,
}: SourceBrowserProps) {
  const [showAll, setShowAll] = useState(false);
  const [detail, setDetail] = useState<{
    source: PlatformSource;
    focusRescript?: boolean;
  } | null>(null);

  const listSources = sources ?? [];

  const displayed = useMemo(() => {
    const sorted = sortSources(listSources, 'views', {
      searchQuery,
      industry: clientContext?.industry,
      clientName: clientContext?.name,
      topicKeywords: clientContext?.topicKeywords,
    });
    return showAll ? sorted : sorted.slice(0, 12);
  }, [listSources, showAll, searchQuery, clientContext]);

  if (!listSources.length) return null;

  const hasMore = listSources.length > 12;
  const showBottomFade = !showAll && hasMore;

  return (
    <section className="rounded-2xl border border-nativz-border/50 bg-background/20 p-4 sm:p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">Sources</h3>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-text-muted">
          Short-form video sources across platforms, most viewed first, left to right across each row
        </p>
      </div>

      <div className="relative">
        <div
          className={cn(
            'grid auto-rows-[min-content] grid-cols-1 items-start gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4 xl:gap-4 2xl:gap-5',
            showBottomFade && 'pb-2',
          )}
        >
          {displayed.map((source) => {
            const key = sourceKey(source);
            return (
              <div key={key} className="min-w-0 self-start">
                <SourceMentionCard
                  source={source}
                  onOpenDetail={(opts) => setDetail({ source, ...opts })}
                />
              </div>
            );
          })}
        </div>
        {showBottomFade ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-background from-35% via-background/70 to-transparent sm:h-32"
            aria-hidden
          />
        ) : null}
      </div>

      {!showAll && hasMore && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-4 w-full cursor-pointer py-2 text-center text-sm text-accent-text hover:underline"
        >
          Show more
        </button>
      )}

      <SourceDetailDialog
        key={detail?.source ? sourceKey(detail.source) : 'closed'}
        open={detail != null}
        onClose={() => setDetail(null)}
        source={detail?.source ?? null}
        focusRescript={detail?.focusRescript}
        searchId={searchId}
        defaultClientId={defaultClientId}
        clients={clients}
        linkedIdeas={linkedIdeas}
      />
    </section>
  );
}
