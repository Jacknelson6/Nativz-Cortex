'use client';

import { Eye, Heart, MessageCircle, Play, TrendingUp } from 'lucide-react';

import { PlatformBadgeSearch } from '@/components/search/platform-icon';
import { cn } from '@/lib/utils';
import type { PlatformSource } from '@/lib/types/search';
import { engagementRatePercent, resolveSourceThumbnailUrl } from '@/lib/search/source-mention-utils';
import { formatCompactCount, formatRelativeTime } from '@/lib/utils/format';

export interface SourceMentionCardProps {
  source: PlatformSource;
  onOpenDetail: (opts?: { focusRescript?: boolean }) => void;
}

function formatCreatorLine(source: PlatformSource): string {
  const a = source.author?.trim();
  if (!a) return 'Creator unknown';
  if (source.platform === 'tiktok') return `@${a.replace(/^@/, '')}`;
  return a;
}

export function SourceMentionCard({ source, onOpenDetail }: SourceMentionCardProps) {
  const thumbRaw = resolveSourceThumbnailUrl(source);
  const showThumb = source.platform !== 'web' && Boolean(thumbRaw);
  const thumb = showThumb ? thumbRaw : null;
  const isVerticalThumb =
    source.platform === 'tiktok' || (source.platform === 'youtube' && source.videoFormat === 'short');

  const views = source.engagement.views ?? 0;
  const likes = source.engagement.likes ?? 0;
  const comments = source.engagement.comments ?? 0;
  const er = engagementRatePercent(source);

  return (
    <article
      className={cn(
        'group flex h-auto w-full flex-col self-start overflow-hidden rounded-2xl border border-nativz-border bg-surface shadow-[var(--shadow-card)] transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-accent/35 hover:shadow-[var(--shadow-card-hover)]',
      )}
    >
      <div className="flex gap-2.5 px-4 pt-3 pb-3">
        <div className="shrink-0 pt-0.5">
          <PlatformBadgeSearch platform={source.platform} size="sm" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 min-w-0 flex-1 text-base font-semibold leading-snug text-text-primary">
              {source.title || 'Untitled'}
            </h3>
            <time
              className="shrink-0 pt-0.5 text-xs tabular-nums text-text-muted"
              dateTime={source.createdAt}
            >
              {formatRelativeTime(source.createdAt)}
            </time>
          </div>
          <p className="truncate text-sm font-normal leading-snug text-text-muted">
            {formatCreatorLine(source)}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-text-muted sm:text-sm">
            <span className="inline-flex items-center gap-1.5 text-text-secondary">
              <Eye size={14} className="shrink-0 opacity-80" aria-hidden />
              {formatCompactCount(views)} views
            </span>
            <span className="inline-flex items-center gap-1.5 text-text-secondary">
              <Heart size={14} className="shrink-0 opacity-80" aria-hidden />
              {formatCompactCount(likes)}
            </span>
            <span className="inline-flex items-center gap-1.5 text-text-secondary">
              <MessageCircle size={14} className="shrink-0 opacity-80" aria-hidden />
              {formatCompactCount(comments)}
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium text-accent-text">
              <TrendingUp size={14} className="shrink-0 opacity-90" aria-hidden />
              {er != null ? `${er.toFixed(1)}% ER` : '— ER'}
            </span>
          </div>
        </div>
      </div>

      {thumb ? (
        <div
          className={cn(
            'relative w-full shrink-0 overflow-hidden bg-black/30 outline-none group/thumb',
            // Shared max height for vertical + landscape so one Short doesn’t balloon the whole grid row.
            isVerticalThumb
              ? 'aspect-[9/16] min-h-0 w-full max-h-[min(15rem,45vw)] sm:max-h-[min(16rem,24vw)] lg:max-h-[min(17rem,20vw)]'
              : 'aspect-video min-h-0 w-full max-h-[min(15rem,45vw)] sm:max-h-[min(16rem,24vw)] lg:max-h-[min(17rem,20vw)]',
          )}
          role="button"
          tabIndex={0}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('[data-source-action]')) return;
            onOpenDetail();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenDetail();
            }
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumb}
            alt=""
            className="h-full w-full object-cover object-center pointer-events-none"
            loading="lazy"
            onError={(e) => {
              const el = e.currentTarget;
              const id = source.id;
              if (source.platform === 'youtube' && id && el.src.includes('maxresdefault')) {
                el.src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
              }
            }}
          />
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/55 opacity-0 transition-opacity group-hover/thumb:pointer-events-auto group-hover/thumb:opacity-100">
            <a
              data-source-action
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-md hover:bg-white/95"
              onClick={(e) => e.stopPropagation()}
            >
              <Play size={16} className="shrink-0 fill-current" aria-hidden />
              Play
            </a>
            <button
              data-source-action
              type="button"
              className="pointer-events-auto cursor-pointer rounded-full border border-white/30 bg-white/10 px-3 py-2 text-sm font-medium text-white backdrop-blur-sm hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetail({ focusRescript: true });
              }}
            >
              Analyze
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onOpenDetail()}
          className="mx-4 mb-2 flex min-h-[88px] shrink-0 items-center justify-center self-stretch rounded-xl border border-dashed border-nativz-border/60 bg-background/40 px-3 text-center text-sm text-text-muted transition-colors hover:border-nativz-border hover:bg-surface-hover/40 cursor-pointer"
        >
          Open details
        </button>
      )}
    </article>
  );
}
