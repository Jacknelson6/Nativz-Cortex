'use client';

import { useEffect, useState } from 'react';
import { VideoGrid } from '@/components/research/video-grid';
import { OutlierCreatorsTable } from '@/components/research/outlier-creators-table';
import { HashtagCloud } from '@/components/research/hashtag-cloud';
import { HookPatterns } from '@/components/research/hook-patterns';
import { SearchStatsRow } from '@/components/results/search-stats-row';
import { ViewsOverTime } from '@/components/charts/views-over-time';
import type { TopicSearchVideoRow, TopicSearchHookRow } from '@/lib/scrapers/types';

interface ScrapedVideosSectionProps {
  searchId: string;
  /** Pre-fetched count from SSR — used to decide whether to fetch at all */
  scrapedVideoCount: number;
  /** Optional share token for unauthenticated shared views */
  shareToken?: string;
}

export function ScrapedVideosSection({ searchId, scrapedVideoCount, shareToken }: ScrapedVideosSectionProps) {
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
        setVideos(data.videos ?? []);
        setHooks(data.hooks ?? []);
      })
      .catch(() => {
        // Non-blocking — existing analysis still works
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [searchId, scrapedVideoCount]);

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

  const platformCounts = {
    tiktok: videos.filter(v => v.platform === 'tiktok').length,
    youtube: videos.filter(v => v.platform === 'youtube').length,
    instagram: videos.filter(v => v.platform === 'instagram').length,
  };

  return (
    <div className="space-y-6">
      <SearchStatsRow videos={videos} />
      <OutlierCreatorsTable videos={videos} />
      <VideoGrid videos={videos} platformCounts={platformCounts} />
      <HashtagCloud videos={videos} />
      <ViewsOverTime videos={videos} />
      <HookPatterns hooks={hooks} />
    </div>
  );
}
