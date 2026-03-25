'use client';

import { useState } from 'react';
import {
  BarChart3,
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Heart,
  MessageCircle,
  Share2,
  Zap,
} from 'lucide-react';

import { PlatformIcon, PLATFORM_CONFIG } from '@/components/search/platform-icon';
import { cn } from '@/lib/utils';
import type { PlatformComment, PlatformSource } from '@/lib/types/search';
import {
  engagementRatePercent,
  resolveSourceThumbnailUrl,
  roughSentimentScore,
  sentimentChip,
  sourceCategoryLabel,
  sourcePlaceLabel,
  formatViewsApprox,
} from '@/lib/search/source-mention-utils';
import { formatRelativeTime, formatNumber } from '@/lib/utils/format';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

function StatChip({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span className="flex items-center gap-1 text-[11px] text-text-muted tabular-nums">
      {icon}
      {value}
    </span>
  );
}

function CommentsBlock({ comments, authorPrefix = '@' }: { comments: PlatformComment[]; authorPrefix?: string }) {
  const [open, setOpen] = useState(false);
  if (comments.length === 0) return null;

  const shown = open ? comments : comments.slice(0, 2);

  return (
    <div className="mt-2 space-y-1.5">
      {shown.map((c) => (
        <div key={c.id} className="border-l-2 border-nativz-border pl-2.5 py-0.5">
          <p className="text-[11px] text-text-secondary leading-relaxed">
            <span className="text-text-muted font-medium">
              {authorPrefix}
              {c.author}
            </span>{' '}
            {c.text}
          </p>
          {c.likes > 0 && <span className="text-[10px] text-text-muted">{c.likes} likes</span>}
        </div>
      ))}
      {comments.length > 2 && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-[11px] text-accent-text hover:underline cursor-pointer"
        >
          {open ? 'Show less' : `Show all ${comments.length} comments`}
        </button>
      )}
    </div>
  );
}

export interface SourceMentionCardProps {
  source: PlatformSource;
  saved: boolean;
  onToggleSave: () => void;
}

export function SourceMentionCard({ source, saved, onToggleSave }: SourceMentionCardProps) {
  const [showTranscript, setShowTranscript] = useState(false);
  const config = PLATFORM_CONFIG[source.platform];
  const thumb = resolveSourceThumbnailUrl(source);
  const isVideoThumb = thumb != null && (source.platform === 'youtube' || source.platform === 'tiktok');
  const aspectClass =
    source.platform === 'tiktok' || source.videoFormat === 'short'
      ? 'aspect-[9/16] max-h-52 w-full mx-auto'
      : 'aspect-video w-full';

  const titleText = source.platform === 'web' ? stripHtml(source.title) : source.title;
  const bodyText =
    source.platform === 'web'
      ? stripHtml(source.content ?? '')
      : (source.content ?? source.title ?? '').trim();

  const sentiment = roughSentimentScore(`${titleText} ${bodyText}`);
  const chip = sentimentChip(sentiment);
  const category = sourceCategoryLabel(source);
  const place = sourcePlaceLabel(source);
  const er = engagementRatePercent(source);

  const authorLine =
    source.platform === 'reddit' && source.author
      ? `u/${source.author.replace(/^u\//, '')}`
      : source.platform === 'tiktok' && source.author
        ? `@${source.author.replace(/^@/, '')}`
        : source.author || '';

  let timeLabel = '';
  try {
    timeLabel = formatRelativeTime(source.createdAt);
  } catch {
    timeLabel = '';
  }

  const sublineMeta =
    source.platform === 'youtube'
      ? timeLabel || 'Video'
      : [authorLine, timeLabel].filter(Boolean).join(' · ');

  const commentPrefix =
    source.platform === 'reddit' ? 'u/' : source.platform === 'tiktok' ? '@' : '@';

  return (
    <article className="rounded-xl border border-nativz-border bg-surface overflow-hidden flex flex-col h-full shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={cn('shrink-0 inline-flex', config.color)}>
            <PlatformIcon platform={source.platform} size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-text-primary truncate">{place}</p>
            <p className="text-[11px] text-text-muted truncate">{sublineMeta}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleSave}
          className="shrink-0 p-1 rounded-md text-text-muted hover:text-accent-text hover:bg-white/[0.06] cursor-pointer transition-colors"
          aria-label={saved ? 'Remove saved' : 'Save source'}
        >
          {saved ? <BookmarkCheck size={18} className="text-accent-text" /> : <Bookmark size={18} />}
        </button>
      </div>

      {/* Thumbnail (short-form vertical vs long-form wide) */}
      {isVideoThumb && thumb && (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`block relative bg-black/40 ${aspectClass}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumb}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            onError={(e) => {
              const el = e.currentTarget;
              const id = source.id;
              if (source.platform === 'youtube' && id && el.src.includes('maxresdefault')) {
                el.src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
              }
            }}
          />
        </a>
      )}

      <div className="px-3 pb-3 flex flex-col flex-1 gap-2">
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-text-primary hover:text-accent-text transition-colors line-clamp-2 leading-snug"
        >
          {titleText}
        </a>

        {bodyText && (
          <p className="text-xs text-text-secondary line-clamp-3 leading-relaxed">{bodyText}</p>
        )}

        {/* Metrics */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
          {source.engagement.views != null && (
            <StatChip icon={<BarChart3 size={12} />} value={formatViewsApprox(source.engagement.views)} />
          )}
          {source.engagement.likes != null && (
            <StatChip icon={<Heart size={12} />} value={formatNumber(source.engagement.likes)} />
          )}
          {source.engagement.comments != null && (
            <StatChip icon={<MessageCircle size={12} />} value={formatNumber(source.engagement.comments)} />
          )}
          {source.engagement.shares != null && source.engagement.shares > 0 && (
            <StatChip icon={<Share2 size={12} />} value={formatNumber(source.engagement.shares)} />
          )}
          {er != null && (
            <StatChip icon={<Zap size={12} />} value={`${er}%`} />
          )}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          <span className="inline-flex items-center rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-text-secondary">
            {chip.emoji} {chip.label}
          </span>
          <span className="inline-flex items-center rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-text-secondary">
            {category}
          </span>
        </div>

        <CommentsBlock comments={source.comments ?? []} authorPrefix={commentPrefix} />

        {source.transcript && (
          <div className="pt-1 border-t border-nativz-border/60">
            <button
              type="button"
              onClick={() => setShowTranscript(!showTranscript)}
              className="flex items-center gap-1.5 text-[11px] text-accent-text hover:underline cursor-pointer"
            >
              <FileText size={10} />
              {showTranscript ? 'Hide transcript' : 'Show transcript'}
              {showTranscript ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
            {showTranscript && (
              <p className="text-[11px] text-text-secondary leading-relaxed max-h-32 overflow-y-auto border-l-2 border-nativz-border pl-2.5 mt-1">
                {source.transcript}
              </p>
            )}
          </div>
        )}

        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-accent-text hover:underline mt-auto pt-1"
        >
          Open <ExternalLink size={10} />
        </a>
      </div>
    </article>
  );
}
