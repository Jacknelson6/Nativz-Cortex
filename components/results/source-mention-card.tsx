'use client';

import { useState } from 'react';
import {
  BarChart3,
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  FileText,
  Heart,
  MessageCircle,
  Share2,
} from 'lucide-react';

import { PlatformIcon, PLATFORM_CONFIG } from '@/components/search/platform-icon';
import { cn } from '@/lib/utils';
import type { PlatformComment, PlatformSource } from '@/lib/types/search';
import {
  resolveSourceThumbnailUrl,
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
  const config = PLATFORM_CONFIG[source.platform];
  const thumb = resolveSourceThumbnailUrl(source);
  const isVideoThumb = thumb != null && (source.platform === 'youtube' || source.platform === 'tiktok');
  /** 16:9 for all video thumbs so grid rows align */
  const aspectClass = 'aspect-video w-full';

  const titleText = source.platform === 'web' ? stripHtml(source.title) : source.title;
  const bodyText =
    source.platform === 'web'
      ? stripHtml(source.content ?? '')
      : (source.content ?? source.title ?? '').trim();

  const place = sourcePlaceLabel(source);

  let timeLabel = '';
  try {
    timeLabel = formatRelativeTime(source.createdAt);
  } catch {
    timeLabel = '';
  }

  /** Platform name + relative time so TikTok/YouTube stay identifiable next to creator in title */
  const sublineMeta = [config.label, timeLabel].filter(Boolean).join(' · ');

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
        <div className="flex shrink-0 items-center gap-0.5">
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-accent-text hover:bg-white/[0.06] transition-colors"
          >
            Open
            <ExternalLink size={12} />
          </a>
          <button
            type="button"
            onClick={onToggleSave}
            className="shrink-0 p-1 rounded-md text-text-muted hover:text-accent-text hover:bg-white/[0.06] cursor-pointer transition-colors"
            aria-label={saved ? 'Remove saved' : 'Save source'}
          >
            {saved ? <BookmarkCheck size={18} className="text-accent-text" /> : <Bookmark size={18} />}
          </button>
        </div>
      </div>

      {/* Thumbnail */}
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
          <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">{bodyText}</p>
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
        </div>

        <CommentsBlock comments={source.comments ?? []} authorPrefix={commentPrefix} />

        {source.transcript && (
          <div className="pt-1 border-t border-nativz-border/60">
            <div className="flex items-center gap-1.5 text-[11px] text-text-muted mb-1">
              <FileText size={10} />
              Transcript
            </div>
            <p className="text-[11px] text-text-secondary leading-relaxed max-h-32 overflow-y-auto border-l-2 border-nativz-border pl-2.5">
              {source.transcript}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}
