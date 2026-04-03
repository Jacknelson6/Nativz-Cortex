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

  // No embed script needed — using direct iframe

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
  const hasTranscript = !!(source.transcript ?? '').trim();

  return (
    <div className="fixed inset-0 z-[70] flex">
      {/* Backdrop — clicking anywhere in the dimmed area closes */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="absolute inset-0 bg-black/90"
        onClick={onClose}
      />

      {/* Main layout */}
      <div className="relative flex h-full w-full" onClick={onClose}>
        {/* Left section: arrows + video — stop propagation so clicking here doesn't close */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <div
          className="flex flex-1 items-center justify-center pr-[340px]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Left arrow */}
          <button
            type="button"
            onClick={goPrev}
            className="absolute left-8 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
            aria-label="Previous video"
          >
            <ChevronLeft size={20} />
          </button>

          {/* TikTok embed — direct iframe, no sandbox */}
          <div className="relative z-10 flex items-center justify-center">
            {videoId ? (
              <iframe
                key={videoId}
                src={`https://www.tiktok.com/player/v1/${videoId}?&music_info=1&description=1`}
                className="rounded-2xl border-0"
                style={{ width: '325px', height: '580px' }}
                allow="encrypted-media; fullscreen"
                allowFullScreen
              />
            ) : (
              <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm text-white/50" style={{ width: '325px', height: '580px' }}>
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
            className="absolute right-[360px] z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
            aria-label="Next video"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Right sidebar — stop propagation so clicking here doesn't close */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <div className="absolute right-0 top-0 z-10 flex h-full w-[340px] flex-col border-l border-white/10 bg-surface/95 backdrop-blur-md" onClick={(e) => e.stopPropagation()}>
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
                {source.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={source.thumbnailUrl}
                    alt={source.author ?? ''}
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-hover text-sm font-semibold text-text-secondary">
                    {(source.author?.[0] ?? '?').toUpperCase()}
                  </div>
                )}
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
              <p className="text-sm leading-relaxed text-text-secondary">
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
                      <Eye size={14} className="text-text-muted" /> Views
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-text-primary">
                      {formatCompactCount(source.engagement.views)}
                    </span>
                  </div>
                )}
                {source.engagement.likes != null && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-text-secondary">
                      <Heart size={14} className="text-text-muted" /> Likes
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-text-primary">
                      {formatCompactCount(source.engagement.likes)}
                    </span>
                  </div>
                )}
                {source.engagement.comments != null && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-text-secondary">
                      <MessageCircle size={14} className="text-text-muted" /> Comments
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-text-primary">
                      {formatCompactCount(source.engagement.comments)}
                    </span>
                  </div>
                )}
                {source.engagement.shares != null && source.engagement.shares > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-text-secondary">
                      <Share2 size={14} className="text-text-muted" /> Shares
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-text-primary">
                      {formatCompactCount(source.engagement.shares)}
                    </span>
                  </div>
                )}
                {er != null && (
                  <div className="flex items-center justify-between border-t border-nativz-border/40 pt-2.5">
                    <span className="text-sm font-medium text-text-secondary">Engagement rate</span>
                    <span className="text-sm font-semibold tabular-nums text-accent-text">{er.toFixed(1)}%</span>
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
                    <Calendar size={14} className="text-text-muted" /> Published
                  </span>
                  <span className="text-sm text-text-primary">{formatRelativeTime(source.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-text-secondary">
                    <PlatformBadgeSearch platform={source.platform} size="sm" /> Platform
                  </span>
                  <span className="text-sm font-medium capitalize text-text-primary">{source.platform}</span>
                </div>
              </div>
            </section>

            {/* Transcript */}
            {hasTranscript && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Transcript</p>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(source.transcript ?? '');
                      // toast would need import — just rely on clipboard
                    }}
                    className="text-[10px] font-medium text-text-muted hover:text-text-secondary"
                  >
                    Copy
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-nativz-border bg-background/40 p-3 text-xs leading-relaxed text-text-secondary">
                  {source.transcript}
                </div>
              </section>
            )}

            {/* Hook analysis */}
            {source.metadata?.hook_analysis && (
              <section>
                <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted mb-2">Hook analysis</p>
                <div className="rounded-lg border border-accent/20 bg-accent-surface/30 p-3">
                  <p className="text-xs leading-relaxed text-text-secondary">
                    {String(source.metadata.hook_analysis)}
                  </p>
                </div>
              </section>
            )}

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
                  Full analysis
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
        </div>
      </div>
    </div>
  );
}
