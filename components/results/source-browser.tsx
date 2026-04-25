'use client';

import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import { SourceMentionCard } from '@/components/results/source-mention-card';
import type { PlatformSource } from '@/lib/types/search';
import { sortSources } from '@/lib/search/source-sources-sort';
import { isSourceLikelyEnglish } from '@/lib/search/is-likely-english';
import { VideoAnalysisPanel } from '@/components/research/video-analysis-panel';
import { TikTokEmbedCarousel } from '@/components/results/tiktok-embed-carousel';

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
  /** Portal viewers can't call the admin-only analysis endpoints —
   *  suppress the "Analyze" affordance and the on-click analysis panel
   *  for non-TikTok sources when false. Defaults to true (admin). */
  allowAnalyze?: boolean;
}

export function SourceBrowser({
  sources,
  searchId,
  searchQuery,
  clientContext,
  defaultClientId,
  allowAnalyze = true,
}: SourceBrowserProps) {
  const [showAll, setShowAll] = useState(false);
  const [analysisSource, setAnalysisSource] = useState<PlatformSource | null>(null);
  const [carouselIndex, setCarouselIndex] = useState<number | null>(null);

  // Reddit + web results don't have meaningful video engagement metrics
  // (views/likes/ER), so they're surfaced as standalone summary cards
  // (WebSearchSummaryCard / RedditScanSummaryCard) above this grid instead
  // of being rendered with "0 views / — ER" in the video card layout.
  //
  // Also drop non-English sources — the Apify scrapers pull from any locale
  // that matches the keyword, and Arabic/CJK/etc. results aren't useful to a
  // US-focused agency and add noise to the grid. Filter is a Latin-letter
  // ratio heuristic (see lib/search/is-likely-english.ts) — intentionally
  // permissive for very short titles so we don't lose emoji-heavy English.
  const listSources = (sources ?? []).filter(
    (s) => s.platform !== 'reddit' && s.platform !== 'web' && isSourceLikelyEnglish(s),
  );

  const allSorted = useMemo(
    () =>
      sortSources(listSources, 'similar', {
        searchQuery,
        industry: clientContext?.industry,
        clientName: clientContext?.name,
        topicKeywords: clientContext?.topicKeywords,
      }),
    [listSources, searchQuery, clientContext],
  );

  const displayed = showAll ? allSorted : allSorted.slice(0, 12);

  // TikTok sources for the carousel (all sorted, not just displayed)
  const tiktokSources = useMemo(
    () => allSorted.filter((s) => s.platform === 'tiktok'),
    [allSorted],
  );

  if (!listSources.length) return null;

  const hasMore = listSources.length > 12;
  const showBottomFade = !showAll && hasMore;

  function openCarousel(source: PlatformSource) {
    const idx = tiktokSources.findIndex(
      (s) => s.id === source.id && s.platform === source.platform,
    );
    setCarouselIndex(idx >= 0 ? idx : 0);
  }

  return (
    <section className="rounded-2xl border border-nativz-border/50 bg-background/20 p-4 sm:p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold tracking-tight text-text-primary">Sources</h3>
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
            const isVideo = source.platform === 'tiktok' || source.platform === 'youtube';
            const isTikTok = source.platform === 'tiktok';
            return (
              <div key={key} className="min-w-0 self-start">
                <SourceMentionCard
                  source={source}
                  onOpenDetail={() => {
                    if (isTikTok) {
                      // Clicking the card opens the TikTok embed carousel
                      openCarousel(source);
                    } else if (isVideo && allowAnalyze) {
                      setAnalysisSource(source);
                    } else {
                      window.open(source.url, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  onAnalyze={isVideo && allowAnalyze ? () => setAnalysisSource(source) : undefined}
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

      {/* TikTok embed carousel */}
      <TikTokEmbedCarousel
        sources={tiktokSources}
        initialIndex={carouselIndex ?? 0}
        open={carouselIndex != null}
        onClose={() => setCarouselIndex(null)}
        topicSearchId={searchId}
        disableAnalysis={!allowAnalyze}
        clientId={defaultClientId}
      />

      {/* Video analysis panel — admin-only (portal viewers hit 403 on
          /api/analysis/items for topic_search_id routes). */}
      {allowAnalyze && (
        <VideoAnalysisPanel
          open={analysisSource != null}
          onClose={() => setAnalysisSource(null)}
          sourceUrl={analysisSource?.url ?? ''}
          topicSearchId={searchId}
          clientId={defaultClientId}
          clientName={clientContext?.name ?? null}
        />
      )}
    </section>
  );
}
