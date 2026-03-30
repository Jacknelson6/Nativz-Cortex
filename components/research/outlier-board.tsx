'use client';

import { ExternalLink, Eye, TrendingUp, Users } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { TopicSearchVideoRow } from '@/lib/scrapers/types';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: 'border-pink-500/30',
  youtube: 'border-red-500/30',
  instagram: 'border-purple-500/30',
};

function OutlierCard({ video, rank }: { video: TopicSearchVideoRow; rank: number }) {
  const outlier = video.outlier_score ?? 0;
  return (
    <a
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex items-start gap-3 rounded-xl border ${PLATFORM_COLORS[video.platform] ?? 'border-nativz-border'} bg-surface p-3 hover:bg-surface-hover/60 transition-all`}
    >
      {/* Rank */}
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-300 text-xs font-bold">
        {rank}
      </div>

      {/* Thumbnail */}
      <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-hover">
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : null}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs font-medium text-text-primary line-clamp-1">
          {video.title ?? video.description?.substring(0, 80) ?? 'Untitled'}
        </p>

        <div className="flex items-center gap-2 text-[11px]">
          {video.author_avatar ? (
            <img
              src={video.author_avatar}
              alt=""
              className="h-4 w-4 rounded-full"
              loading="lazy"
            />
          ) : null}
          <span className="text-text-muted truncate">@{video.author_username ?? 'unknown'}</span>
          {video.author_followers > 0 ? (
            <span className="flex items-center gap-0.5 text-text-muted/60">
              <Users size={10} />
              {formatNumber(video.author_followers)}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1 text-text-muted">
            <Eye size={11} />
            {formatNumber(video.views)}
          </span>
          <Badge className="bg-amber-500/15 text-amber-300 text-[10px] px-1.5 py-0 gap-0.5">
            <TrendingUp size={9} />
            {outlier.toFixed(0)}x outlier
          </Badge>
          {video.author_followers > 0 ? (
            <span className="text-text-muted/50 text-[10px]">
              {formatNumber(video.views)} views from {formatNumber(video.author_followers)} follower creator
            </span>
          ) : null}
        </div>
      </div>

      <ExternalLink size={14} className="shrink-0 text-text-muted/40 opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
    </a>
  );
}

interface OutlierBoardProps {
  videos: TopicSearchVideoRow[];
}

export function OutlierBoard({ videos }: OutlierBoardProps) {
  // Get top 10 outlier videos
  const topOutliers = [...videos]
    .filter(v => (v.outlier_score ?? 0) >= 2)
    .sort((a, b) => (b.outlier_score ?? 0) - (a.outlier_score ?? 0))
    .slice(0, 10);

  if (topOutliers.length === 0) return null;

  return (
    <Card className="space-y-3">
      <div>
        <CardTitle className="text-base font-semibold text-text-primary flex items-center gap-2">
          <TrendingUp size={16} className="text-amber-400" />
          Outlier board
        </CardTitle>
        <p className="text-xs text-text-muted mt-1">
          Videos performing significantly above their creator&apos;s baseline
        </p>
      </div>

      <div className="space-y-2">
        {topOutliers.map((v, i) => (
          <OutlierCard key={`${v.platform}-${v.platform_id}`} video={v} rank={i + 1} />
        ))}
      </div>
    </Card>
  );
}
