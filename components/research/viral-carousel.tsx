'use client';

import { useRef } from 'react';
import { ChevronLeft, ChevronRight, Flame } from 'lucide-react';
import type { TopicSearchVideoRow } from '@/lib/scrapers/types';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ViralCard({ video }: { video: TopicSearchVideoRow }) {
  const outlier = video.outlier_score ?? 0;
  const initial = (video.author_username ?? 'U')[0].toUpperCase();

  return (
    <a
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex-shrink-0 w-[160px] snap-start rounded-xl border border-nativz-border bg-surface overflow-hidden hover:border-pink-500/40 transition-all"
    >
      {/* Thumbnail */}
      <div className="relative aspect-[9/16] w-full overflow-hidden">
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt={video.title ?? video.description?.substring(0, 60) ?? 'Video thumbnail'}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-surface-hover text-text-muted text-xs">
            No thumbnail
          </div>
        )}

        {/* View count badge — top left */}
        <div className="absolute top-2 left-2">
          <span className="bg-green-600/90 text-white text-xs px-2 py-0.5 rounded-full font-medium">
            {formatNumber(video.views)}
          </span>
        </div>

        {/* Outlier multiplier badge — top right */}
        {outlier >= 2 && (
          <div className="absolute top-2 right-2">
            <span className="bg-pink-600/90 text-white text-xs px-2 py-0.5 rounded-full font-medium">
              {outlier.toFixed(0)}x
            </span>
          </div>
        )}
      </div>

      {/* Creator info */}
      <div className="flex items-center gap-2 px-2.5 py-2">
        {video.author_avatar ? (
          <img
            src={video.author_avatar}
            alt=""
            className="h-6 w-6 rounded-full shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="h-6 w-6 rounded-full bg-pink-600/20 text-pink-400 flex items-center justify-center text-[10px] font-bold shrink-0">
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-text-primary truncate font-medium">
            @{video.author_username ?? 'unknown'}
          </p>
          <p className="text-[10px] text-text-muted truncate">
            {formatDate(video.publish_date)}
          </p>
        </div>
      </div>
    </a>
  );
}

interface ViralCarouselProps {
  videos: TopicSearchVideoRow[];
}

export function ViralCarousel({ videos }: ViralCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sort by views descending for "most viral"
  const sorted = [...videos].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));

  if (sorted.length === 0) return null;

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const cardWidth = 160 + 12; // card width + gap
    const distance = cardWidth * 3;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Flame size={18} className="text-orange-400" />
          Most viral
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => scroll('left')}
            className="h-8 w-8 flex items-center justify-center rounded-full bg-surface/80 backdrop-blur border border-nativz-border hover:bg-surface-hover transition-colors"
          >
            <ChevronLeft size={16} className="text-text-muted" />
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            className="h-8 w-8 flex items-center justify-center rounded-full bg-surface/80 backdrop-blur border border-nativz-border hover:bg-surface-hover transition-colors"
          >
            <ChevronRight size={16} className="text-text-muted" />
          </button>
        </div>
      </div>

      {/* Scrollable container */}
      <div className="relative">
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 scrollbar-none"
        >
          {sorted.map(v => (
            <ViralCard key={`${v.platform}-${v.platform_id}`} video={v} />
          ))}
        </div>
      </div>
    </div>
  );
}
