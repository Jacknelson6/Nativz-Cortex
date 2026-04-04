'use client';

import { useEffect, useState } from 'react';
import { VideoGrid } from '@/components/research/video-grid';
import { ViralCarousel } from '@/components/research/viral-carousel';
import { OutlierCreatorsTable } from '@/components/research/outlier-creators-table';
import { HashtagCloud } from '@/components/research/hashtag-cloud';
import { HookPatterns } from '@/components/research/hook-patterns';
import { SearchStatsRow } from '@/components/results/search-stats-row';
import { ViewsOverTime } from '@/components/charts/views-over-time';
import { WebContextSection } from '@/components/results/web-context-section';
import type { TopicSearchVideoRow, TopicSearchHookRow } from '@/lib/scrapers/types';

interface WebContextData {
  serp_results?: Array<{ title: string; url: string; snippet: string; publishedDate?: string }>;
  reddit_threads?: Array<{
    title: string; url: string; subreddit: string; score: number;
    numComments: number; selftext: string; topComments: string[]; createdUtc: number;
  }>;
}

interface ScrapedVideosSectionProps {
  searchId: string;
  /** Pre-fetched count from SSR — used to decide whether to fetch at all */
  scrapedVideoCount: number;
  /** Optional share token for unauthenticated shared views */
  shareToken?: string;
  /** Web context data from pipeline_state */
  webContext?: WebContextData | null;
  /** Topic search client (for inline video analysis rescript) */
  defaultClientId?: string | null;
  clientName?: string | null;
  /** Admin-only: inline analysis uses POST /api/analysis/items. Default true. */
  enableInlineVideoAnalysis?: boolean;
}

export function ScrapedVideosSection({
  searchId,
  scrapedVideoCount,
  shareToken,
  webContext,
  defaultClientId,
  clientName,
  enableInlineVideoAnalysis = true,
}: ScrapedVideosSectionProps) {
  const [videos, setVideos] = useState<TopicSearchVideoRow[]>([]);
  const [hooks, setHooks] = useState<TopicSearchHookRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (scrapedVideoCount === 0) return;

    let cancelled = false;
    setLoading(true);

    const url = shareToken
      ? `/api/search/${searchId}/videos?token=${encodeURIComponent(shareToken)}`
      : `/api/search/${searchId}/videos`;
    fetch(url)
      .then(res => res.json())
      .then((data: { videos?: TopicSearchVideoRow[]; hooks?: TopicSearchHookRow[] }) => {
        if (cancelled) return;
        // Filter out non-English videos (titles with >40% non-Latin characters)
        const allVideos = data.videos ?? [];
        const englishVideos = allVideos.filter((v) => {
          const text = (v.title || v.description || '').replace(/[#@\s\d.,!?;:'"()\-_/\\|+=&%$]/g, '');
          if (!text) return true; // keep videos with no text
          const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
          return latinChars / text.length > 0.4;
        });
        setVideos(englishVideos);
        setHooks(data.hooks ?? []);
      })
      .catch(() => {
        // Non-blocking — existing analysis still works
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [searchId, scrapedVideoCount, shareToken]);

  if (scrapedVideoCount === 0 && videos.length === 0) return null;

  if (loading) {
    return (
      <div className="rounded-xl border border-nativz-border bg-surface p-6 space-y-3">
        <div className="h-4 w-40 animate-pulse rounded bg-surface-hover" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[9/16] max-h-48 animate-pulse rounded-xl bg-surface-hover" />
          ))}
        </div>
      </div>
    );
  }

  if (videos.length === 0) return null;

  return (
    <div className="space-y-6">
      <SearchStatsRow videos={videos} />
      <div className="rounded-xl border border-nativz-border bg-surface p-5">
        <ViralCarousel videos={videos} />
      </div>
      <VideoGrid
        videos={videos}
        searchId={searchId}
        defaultClientId={defaultClientId ?? null}
        clientName={clientName ?? null}
        enableInlineVideoAnalysis={enableInlineVideoAnalysis}
      />
      <OutlierCreatorsTable videos={videos} />
      <HookPatterns hooks={hooks} />
      <HashtagCloud videos={videos} />
      <ViewsOverTime videos={videos} />
      {webContext && (
        <WebContextSection
          serpResults={webContext.serp_results ?? []}
          redditThreads={webContext.reddit_threads ?? []}
        />
      )}
    </div>
  );
}
