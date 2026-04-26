'use client';

import {
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  ExternalLink,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PlatformBadge } from './platform-badge';
import type { TopPostItem } from '@/lib/types/reporting';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

const limitOptions = [3, 5, 10];

function platformTint(platform: string): string {
  switch (platform) {
    case 'tiktok': return 'var(--platform-tiktok-mark)';
    case 'instagram': return 'var(--platform-instagram-mark)';
    case 'facebook': return 'var(--platform-facebook-mark)';
    case 'youtube': return 'var(--platform-youtube-mark)';
    case 'linkedin': return 'var(--platform-linkedin-mark)';
    default: return 'var(--platform-default-mark)';
  }
}

interface TopPostsViewProps {
  posts: TopPostItem[];
  loading: boolean;
  limit: number;
  onLimitChange: (n: number) => void;
}

export function TopPostsView({
  posts,
  loading,
  limit,
  onLimitChange,
}: TopPostsViewProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-muted">Show top</span>
        <div className="inline-flex rounded-lg bg-surface-hover/50 p-1">
          {limitOptions.map((n) => (
            <button
              key={n}
              onClick={() => onLimitChange(n)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                limit === n
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: limit }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : (posts ?? []).length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">
          No posts found for this period
        </p>
      ) : (
        <div className="space-y-2">
          {(posts ?? []).map((post) => (
            <TopPostRow key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}

function TopPostRow({ post }: { post: TopPostItem }) {
  const open = () => {
    if (post.postUrl) window.open(post.postUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      role={post.postUrl ? 'button' : undefined}
      tabIndex={post.postUrl ? 0 : undefined}
      onClick={open}
      onKeyDown={(e) => {
        if (!post.postUrl) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      className="group flex items-center gap-3 rounded-lg border border-nativz-border/70 bg-background/30 p-2.5 transition-colors hover:border-accent/30 hover:bg-surface-hover/40 focus:outline-none focus:ring-1 focus:ring-accent/40"
    >
      <div className="flex shrink-0 items-center justify-center text-xs font-semibold tabular-nums text-text-muted w-5">
        {post.rank}
      </div>

      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-surface-hover">
        {post.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: platformTint(post.platform) }}
          >
            <Eye size={16} className="text-white/70" />
          </div>
        )}
        <div className="absolute bottom-0 right-0 p-0.5">
          <PlatformBadge platform={post.platform} showLabel={false} size="sm" />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text-primary">
          {post.caption?.trim() ? post.caption : '—'}
        </p>
        <p className="text-xs text-text-muted">{formatDate(post.publishedAt)}</p>
      </div>

      <div className="hidden shrink-0 items-center gap-3 text-xs tabular-nums text-text-secondary sm:flex">
        <Metric icon={<Eye size={12} />} value={post.views ?? 0} />
        <Metric icon={<Heart size={12} />} value={post.likes ?? 0} />
        <Metric icon={<MessageCircle size={12} />} value={post.comments ?? 0} />
        <Metric icon={<Share2 size={12} />} value={post.shares ?? 0} />
        <Metric icon={<Bookmark size={12} />} value={post.saves ?? 0} />
      </div>

      {post.postUrl && (
        <ExternalLink
          size={14}
          className="shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      )}
    </div>
  );
}

function Metric({ icon, value }: { icon: React.ReactNode; value: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      {icon}
      {formatNumber(value)}
    </span>
  );
}
