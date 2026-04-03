'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Calendar,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import type { PlatformSource } from '@/lib/types/search';
import { formatCompactCount, formatRelativeTime } from '@/lib/utils/format';
import { engagementRatePercent } from '@/lib/search/source-mention-utils';
import { PlatformBadgeSearch } from '@/components/search/platform-icon';

/**
 * Extract TikTok video ID from a TikTok URL.
 * Handles: /video/1234, /@user/video/1234, /t/XXXXX (short links won't work for embed)
 */
function extractTikTokVideoId(url: string): string | null {
  try {
    const match = url.match(/\/video\/(\d+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

interface TikTokEmbedCarouselProps {
  sources: PlatformSource[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
  onAnalyze?: (source: PlatformSource) => void;
}

export function TikTokEmbedCarousel({
  sources,
  initialIndex,
  open,
  onClose,
  onAnalyze,
}: TikTokEmbedCarouselProps) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  const source = sources[index] ?? null;
  const videoId = source ? extractTikTokVideoId(source.url) : null;
  const total = sources.length;

  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : total - 1));
  }, [total]);

  const goNext = useCallback(() => {
    setIndex((i) => (i < total - 1 ? i + 1 : 0));
  }, [total]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose, goPrev, goNext]);

  if (!open || !source) return null;

  const er = engagementRatePercent(source);

  return (
    <div className="fixed inset-0 z-[70] flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white/80 transition hover:bg-white/20 hover:text-white"
        aria-label="Close"
      >
        <X size={20} />
      </button>

      {/* Main layout: arrows + video + sidebar */}
      <div className="relative flex h-full w-full items-center justify-center">
        {/* Left arrow */}
        <button
          type="button"
          onClick={goPrev}
          className="absolute left-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white sm:left-8"
          aria-label="Previous video"
        >
          <ChevronLeft size={24} />
        </button>

        {/* Center: TikTok embed */}
        <div className="relative z-10 flex h-full max-h-[min(85vh,700px)] w-full max-w-[400px] items-center justify-center px-16 sm:px-20">
          {videoId ? (
            <iframe
              key={videoId}
              src={`https://www.tiktok.com/embed/v2/${videoId}?lang=en-US`}
              className="h-full w-full rounded-2xl"
              style={{ aspectRatio: '9/16', maxHeight: '85vh' }}
              allow="encrypted-media"
              allowFullScreen
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          ) : (
            <div className="flex aspect-[9/16] w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm text-white/50">
              <div className="text-center px-4">
                <p>Embed unavailable</p>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-accent-text hover:underline"
                >
                  Open on TikTok <ExternalLink size={12} />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Right arrow */}
        <button
          type="button"
          onClick={goNext}
          className="absolute right-[340px] z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white sm:right-[360px] lg:right-[380px]"
          aria-label="Next video"
        >
          <ChevronRight size={24} />
        </button>

        {/* Right sidebar — details */}
        <div className="absolute right-0 top-0 z-10 flex h-full w-[320px] flex-col border-l border-white/10 bg-surface/95 backdrop-blur-md sm:w-[340px]">
          <div className="flex items-center justify-between border-b border-nativz-border/60 px-5 py-4">
            <h3 className="text-sm font-semibold text-text-primary">Video details</h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-text-muted hover:bg-surface-hover hover:text-text-secondary"
            >
              <X size={16} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Creator */}
            <section>
              <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted mb-2">Creator</p>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-hover text-sm font-semibold text-text-secondary">
                  {(source.author?.[0] ?? '?').toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {source.author || 'Unknown creator'}
                  </p>
                  <p className="text-xs text-text-muted">
                    @{(source.author ?? '').replace(/^@/, '')}
                  </p>
                </div>
              </div>
            </section>

            {/* Description */}
            <section>
              <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted mb-2">Description</p>
              <p className="text-sm leading-relaxed text-text-secondary line-clamp-6">
                {source.content || source.title || 'No description'}
              </p>
            </section>

            {/* Performance */}
            <section>
              <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted mb-3">Performance</p>
              <div className="space-y-2.5">
                {source.engagement.views != null && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-text-secondary">
                      <Eye size={14} className="text-text-muted" />
                      Views
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-text-primary">
                      {formatCompactCount(source.engagement.views)}
                    </span>
                  </div>
                )}
                {source.engagement.likes != null && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-text-secondary">
                      <Heart size={14} className="text-text-muted" />
                      Likes
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-text-primary">
                      {formatCompactCount(source.engagement.likes)}
                    </span>
                  </div>
                )}
                {source.engagement.comments != null && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-text-secondary">
                      <MessageCircle size={14} className="text-text-muted" />
                      Comments
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-text-primary">
                      {formatCompactCount(source.engagement.comments)}
                    </span>
                  </div>
                )}
                {source.engagement.shares != null && source.engagement.shares > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-text-secondary">
                      <Share2 size={14} className="text-text-muted" />
                      Shares
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-text-primary">
                      {formatCompactCount(source.engagement.shares)}
                    </span>
                  </div>
                )}
                {er != null && (
                  <div className="flex items-center justify-between border-t border-nativz-border/40 pt-2.5">
                    <span className="text-sm font-medium text-text-secondary">Engagement rate</span>
                    <span className="text-sm font-semibold tabular-nums text-accent-text">
                      {er.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* Details */}
            <section>
              <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted mb-3">Details</p>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-text-secondary">
                    <Calendar size={14} className="text-text-muted" />
                    Published
                  </span>
                  <span className="text-sm text-text-primary">
                    {formatRelativeTime(source.createdAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-text-secondary">
                    <PlatformBadgeSearch platform={source.platform} size="sm" />
                    Platform
                  </span>
                  <span className="text-sm font-medium capitalize text-text-primary">
                    {source.platform}
                  </span>
                </div>
              </div>
            </section>

            {/* Actions */}
            <div className="space-y-2 pt-2">
              {onAnalyze && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onAnalyze(source);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-surface px-4 py-2.5 text-sm font-medium text-accent-text transition hover:bg-accent-surface/80"
                >
                  <Sparkles size={14} />
                  View analysis
                </button>
              )}
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-nativz-border px-4 py-2.5 text-sm font-medium text-text-secondary transition hover:bg-surface-hover"
              >
                <ExternalLink size={14} />
                View original
              </a>
            </div>
          </div>

          {/* Counter */}
          <div className="border-t border-nativz-border/60 px-5 py-3 text-right">
            <span className="text-xs tabular-nums text-text-muted">
              {index + 1} of {total}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
