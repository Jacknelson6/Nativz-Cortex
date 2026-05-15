'use client';

import { useEffect, useState } from 'react';
import { OutlierCreatorsTable } from '@/components/research/outlier-creators-table';
import { HashtagCloud } from '@/components/research/hashtag-cloud';
import { HookPatterns } from '@/components/research/hook-patterns';
import { ViewsOverTime, ViewsOverTimeSkeleton } from '@/components/charts/views-over-time';
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
}

export function ScrapedVideosSection({
  searchId,
  scrapedVideoCount,
  shareToken,
  webContext,
}: ScrapedVideosSectionProps) {
  const [videos, setVideos] = useState<TopicSearchVideoRow[]>([]);
  const [hooks, setHooks] = useState<TopicSearchHookRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (scrapedVideoCount === 0) return;

    let cancelled = false;
    async function loadVideos() {
      setLoading(true);
      try {
        const url = shareToken
          ? `/api/search/${searchId}/videos?token=${encodeURIComponent(shareToken)}`
          : `/api/search/${searchId}/videos`;
        const res = await fetch(url);
        const data: { videos?: TopicSearchVideoRow[]; hooks?: TopicSearchHookRow[] } = await res.json();
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
      } catch {
        // Non-blocking — existing analysis still works
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadVideos();

    return () => { cancelled = true; };
  }, [searchId, scrapedVideoCount, shareToken]);

  if (scrapedVideoCount === 0 && videos.length === 0) return null;

  if (loading) {
    // Only Views over time renders unconditionally when scrape data exists —
    // the other sections (outlier creators, hook patterns, hashtag cloud)
    // each return null on empty data, so skeletons for them would tease
    // sections that may never appear.
    return (
      <div className="space-y-6">
        <ViewsOverTimeSkeleton />
      </div>
    );
  }

  if (videos.length === 0) return null;

  return (
    <div className="space-y-6">
      <OutlierCreatorsTable videos={videos} />
      <HookPatterns hooks={hooks} />
      <HashtagCloud videos={videos} />
      <ViewsOverTime searchId={searchId} shareToken={shareToken} videos={videos} />
      {webContext && (
        <WebContextSection
          serpResults={webContext.serp_results ?? []}
          redditThreads={webContext.reddit_threads ?? []}
        />
      )}
    </div>
  );
}
