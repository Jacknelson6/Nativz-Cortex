'use client';

import { useEffect, useCallback, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Heart,
  MessageCircle,
  ExternalLink,
  Sparkles,
  Calendar,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

interface VideoDetailPanelProps {
  videos: TopicSearchVideoRow[];
  initialIndex: number;
  onClose: () => void;
}

export function VideoDetailPanel({ videos, initialIndex, onClose }: VideoDetailPanelProps) {
  const [index, setIndex] = useState(initialIndex);
  const [visible, setVisible] = useState(false);

  const video = videos[index];

  // Animate in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose();
      if (e.key === 'ArrowLeft' && index > 0) setIndex((i) => i - 1);
      if (e.key === 'ArrowRight' && index < videos.length - 1) setIndex((i) => i + 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, videos.length, handleClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  if (!video) return null;

  const outlier = video.outlier_score ?? 0;
  const initials = (video.author_display_name ?? video.author_username ?? '?')[0].toUpperCase();
  const hashtags = (video.hashtags ?? []).map((h) => (h.startsWith('#') ? h : `#${h}`));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
        aria-hidden
      />

      {/* Panel */}
      <div
        className={`relative w-full max-w-[480px] h-full bg-surface border-l border-nativz-border overflow-y-auto transition-transform duration-200 ease-out ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 z-10 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Thumbnail */}
        <div className="relative aspect-video w-full bg-surface-hover overflow-hidden">
          {video.thumbnail_url ? (
            <img
              src={video.thumbnail_url}
              alt={video.title ?? 'Video thumbnail'}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-text-muted text-sm">
              No thumbnail
            </div>
          )}
        </div>

        <div className="p-5 space-y-5">
          {/* Title */}
          {video.title && (
            <h2 className="text-base font-semibold text-text-primary leading-snug">{video.title}</h2>
          )}

          {/* Creator */}
          <div className="flex items-center gap-3">
            {video.author_avatar ? (
              <img
                src={video.author_avatar}
                alt=""
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-600/20 text-pink-400 font-bold text-sm">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text-primary truncate">
                {video.author_display_name ?? video.author_username ?? 'Unknown'}
              </p>
              <p className="text-xs text-text-muted">
                @{video.author_username ?? 'unknown'}
                {video.author_followers > 0 && (
                  <span className="ml-1.5 text-text-muted/60">
                    · {formatNumber(video.author_followers)} followers
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Why this video works */}
          <div className="rounded-lg border border-nativz-border overflow-hidden">
            <div className="flex items-center gap-2 bg-pink-600/10 px-4 py-2.5 border-b border-pink-600/20">
              <Sparkles size={14} className="text-pink-400" />
              <span className="text-xs font-semibold text-pink-400 uppercase tracking-wide">
                Why this video works
              </span>
            </div>
            <div className="px-4 py-3">
              <p className="text-sm text-text-secondary leading-relaxed">
                {video.description
                  ? video.description.length > 300
                    ? `${video.description.slice(0, 300)}…`
                    : video.description
                  : 'AI analysis will appear here in a future update.'}
              </p>
            </div>
          </div>

          {/* Description */}
          {video.description && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Description</p>
              <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
                {video.description}
              </p>
              {hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {hashtags.map((h) => (
                    <span key={h} className="text-xs text-accent-text">
                      {h}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Performance */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Performance</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-text-muted">
                  <Eye size={14} /> Views
                </span>
                <span className="font-semibold text-emerald-400 tabular-nums">
                  {formatNumber(video.views)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-text-muted">
                  <Heart size={14} /> Likes
                </span>
                <span className="font-semibold text-text-primary tabular-nums">
                  {formatNumber(video.likes)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-text-muted">
                  <MessageCircle size={14} /> Comments
                </span>
                <span className="font-semibold text-text-primary tabular-nums">
                  {formatNumber(video.comments)}
                </span>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Details</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-text-muted">
                  <Calendar size={14} /> Published
                </span>
                <span className="text-text-secondary">{formatDate(video.publish_date)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted">Platform</span>
                <Badge className={`${PLATFORM_COLORS[video.platform] ?? ''} text-xs`}>
                  {PLATFORM_LABELS[video.platform] ?? video.platform}
                </Badge>
              </div>
              {outlier > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-text-muted">
                    <TrendingUp size={14} /> Virality score
                  </span>
                  <span className="font-semibold text-pink-400">{outlier.toFixed(1)}x</span>
                </div>
              )}
            </div>
          </div>

          {/* View original button */}
          <Button asChild className="w-full" variant="outline">
            <a href={video.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} className="mr-2" />
              View original
            </a>
          </Button>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-nativz-border pt-4">
            <button
              type="button"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="rounded-lg p-2 text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:pointer-events-none"
              aria-label="Previous video"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-sm text-text-muted tabular-nums">
              {index + 1} of {videos.length}
            </span>
            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(videos.length - 1, i + 1))}
              disabled={index === videos.length - 1}
              className="rounded-lg p-2 text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:pointer-events-none"
              aria-label="Next video"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
