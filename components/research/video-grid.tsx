'use client';

import { useState } from 'react';
import { ExternalLink, Eye, Heart, MessageCircle, TrendingUp } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { VideoDetailPanel } from '@/components/research/video-detail-panel';
import { VideoAnalysisPanel } from '@/components/research/video-analysis-panel';
import type { TopicSearchVideoRow } from '@/lib/scrapers/types';

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: 'bg-pink-500/10 text-pink-400',
  youtube: 'bg-red-500/10 text-red-400',
  instagram: 'bg-purple-500/10 text-purple-400',
};

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  youtube: 'YouTube',
  instagram: 'Instagram',
};

type SortOption = 'views' | 'outlier_score' | 'recent';
type PlatformFilter = 'all' | 'tiktok' | 'youtube' | 'instagram';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function isVerticalPlatform(platform: string): boolean {
  return platform === 'tiktok' || platform === 'instagram';
}

function VideoCard({ video, onClick }: { video: TopicSearchVideoRow; onClick?: () => void }) {
  const outlier = video.outlier_score ?? 0;
  const vertical = isVerticalPlatform(video.platform);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group block w-full text-left rounded-xl border border-nativz-border bg-surface hover:border-accent/40 transition-all overflow-hidden cursor-pointer"
    >
      {/* Thumbnail — 9:16 for short-form, 16:9 for YouTube */}
      <div className={`relative w-full bg-surface-hover overflow-hidden ${vertical ? 'aspect-[9/16]' : 'aspect-video'}`}>
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt={video.title ?? video.description?.substring(0, 60) ?? 'Video thumbnail'}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-text-muted text-xs">
            No thumbnail
          </div>
        )}

        {/* Platform badge */}
        <div className="absolute top-2 left-2">
          <Badge className={`${PLATFORM_COLORS[video.platform] ?? ''} text-[10px] px-1.5 py-0.5`}>
            {PLATFORM_LABELS[video.platform] ?? video.platform}
          </Badge>
        </div>

        {/* Outlier badge */}
        {outlier >= 3 ? (
          <div className="absolute top-2 right-2">
            <Badge className="bg-amber-500/20 text-amber-300 text-[10px] px-1.5 py-0.5 gap-0.5">
              <TrendingUp size={10} />
              {outlier.toFixed(0)}x
            </Badge>
          </div>
        ) : null}

        {/* External link indicator */}
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="rounded-full bg-black/60 p-1.5">
            <ExternalLink size={12} className="text-white" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        <p className="text-xs text-text-primary line-clamp-2 leading-snug">
          {video.title ?? video.description?.substring(0, 100) ?? 'Untitled'}
        </p>

        <p className="text-xs text-text-muted truncate">
          @{video.author_username ?? 'unknown'}
          {video.author_followers > 0 ? (
            <span className="ml-1 text-text-muted/60">
              · {formatNumber(video.author_followers)} followers
            </span>
          ) : null}
        </p>

        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span className="flex items-center gap-1 text-emerald-400/90">
            <Eye size={11} className="text-emerald-500/70 shrink-0" /> {formatNumber(video.views)}
          </span>
          <span className="flex items-center gap-1">
            <Heart size={11} /> {formatNumber(video.likes)}
          </span>
          {video.comments > 0 ? (
            <span className="flex items-center gap-1">
              <MessageCircle size={11} /> {formatNumber(video.comments)}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

interface VideoGridProps {
  videos: TopicSearchVideoRow[];
  searchId: string;
  defaultClientId: string | null;
  clientName?: string | null;
  enableInlineVideoAnalysis?: boolean;
}

export function VideoGrid({
  videos,
  searchId,
  defaultClientId,
  clientName,
  enableInlineVideoAnalysis = true,
}: VideoGridProps) {
  const [sort, setSort] = useState<SortOption>('outlier_score');
  const [platform, setPlatform] = useState<PlatformFilter>('all');
  const [showAll, setShowAll] = useState(false);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [videoAnalysisUrl, setVideoAnalysisUrl] = useState<string | null>(null);

  if (videos.length === 0) return null;

  // Filter
  let filtered = platform === 'all' ? videos : videos.filter(v => v.platform === platform);

  // Sort
  filtered = [...filtered].sort((a, b) => {
    if (sort === 'views') return (b.views ?? 0) - (a.views ?? 0);
    if (sort === 'recent') {
      const da = a.publish_date ? new Date(a.publish_date).getTime() : 0;
      const db = b.publish_date ? new Date(b.publish_date).getTime() : 0;
      return db - da;
    }
    return (b.outlier_score ?? 0) - (a.outlier_score ?? 0);
  });

  const displayed = showAll ? filtered : filtered.slice(0, 12);

  const selectedTab = 'bg-pink-500/15 text-pink-300';
  const idleTab = 'text-text-muted hover:text-text-secondary';

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-text-primary">
              Short-form videos
            </CardTitle>
            <p className="text-xs text-text-muted mt-1">
              Filter by platform and sort order
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Sort buttons */}
            <div className="flex rounded-lg border border-nativz-border overflow-hidden">
              {(['outlier_score', 'views', 'recent'] as SortOption[]).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSort(s)}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    sort === s ? selectedTab : idleTab
                  }`}
                >
                  {s === 'outlier_score' ? 'Outlier' : s === 'views' ? 'Views' : 'Recent'}
                </button>
              ))}
            </div>

            {/* Platform filter */}
            <div className="flex rounded-lg border border-nativz-border overflow-hidden">
              {(['all', 'tiktok', 'youtube', 'instagram'] as PlatformFilter[]).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    platform === p ? selectedTab : idleTab
                  }`}
                >
                  {p === 'all' ? 'All' : PLATFORM_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {displayed.map((v, i) => (
            <VideoCard
              key={`${v.platform}-${v.platform_id}`}
              video={v}
              onClick={() => setDetailIndex(i)}
            />
          ))}
        </div>

        {filtered.length > 12 && !showAll ? (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAll(true)}
            >
              Show more
            </Button>
          </div>
        ) : null}
      </Card>

      {detailIndex !== null && (
        <VideoDetailPanel
          videos={displayed}
          initialIndex={detailIndex}
          onClose={() => setDetailIndex(null)}
          showAnalyzeVideo={enableInlineVideoAnalysis}
          onOpenVideoAnalysis={
            enableInlineVideoAnalysis
              ? (url) => {
                  setVideoAnalysisUrl(url);
                  setDetailIndex(null);
                }
              : undefined
          }
        />
      )}

      {enableInlineVideoAnalysis && videoAnalysisUrl && (
        <VideoAnalysisPanel
          open
          onClose={() => setVideoAnalysisUrl(null)}
          sourceUrl={videoAnalysisUrl}
          topicSearchId={searchId}
          clientId={defaultClientId}
          clientName={clientName ?? null}
        />
      )}
    </div>
  );
}
