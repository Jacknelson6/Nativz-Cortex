'use client';

import {
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  ExternalLink,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
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
    year: 'numeric',
  });
}

const limitOptions = [3, 5, 10];

function platformTint(platform: string): string {
  switch (platform) {
    case 'tiktok': return 'linear-gradient(135deg, #25F4EE 0%, #000000 50%, #FE2C55 100%)';
    case 'instagram': return 'linear-gradient(135deg, #FDC830 0%, #F37335 50%, #C13584 100%)';
    case 'facebook': return '#1877F2';
    case 'youtube': return '#FF0300';
    case 'linkedin': return '#0A66C2';
    default: return '#2a2a2a';
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
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-muted">Show top</span>
        <div className="inline-flex rounded-lg bg-surface-hover/50 p-1">
          {limitOptions.map((n) => (
            <button
              key={n}
              onClick={() => onLimitChange(n)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
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
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: limit }).map((_, i) => (
            <Skeleton key={i} className="aspect-[9/16]" />
          ))}
        </div>
      ) : (posts ?? []).length === 0 ? (
        <Card>
          <p className="text-center text-text-muted py-8">
            No posts found for this period
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {(posts ?? []).map((post) => (
            <Card
              key={post.id}
              padding="none"
              interactive
              onClick={() => {
                if (post.postUrl) {
                  window.open(post.postUrl, '_blank', 'noopener');
                }
              }}
            >
              <div className="relative">
                <div className="aspect-[9/16] bg-surface-hover overflow-hidden rounded-t-xl">
                  {post.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.thumbnailUrl}
                      alt={post.caption ?? 'Post thumbnail'}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center"
                      style={{ background: platformTint(post.platform) }}
                    >
                      <Eye size={32} className="text-white/70" />
                    </div>
                  )}
                  {/* Bottom-fade so caption + metrics sit on a legible ground */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
                </div>
                <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-white text-sm font-bold shadow-md">
                  {post.rank}
                </span>
                <span className="absolute right-2 top-2">
                  <PlatformBadge
                    platform={post.platform}
                    showLabel={false}
                    size="sm"
                  />
                </span>
                {post.postUrl && (
                  <ExternalLink
                    size={14}
                    className="absolute right-2 bottom-2 text-white/70"
                    aria-hidden
                  />
                )}
              </div>

              <div className="p-3 space-y-2">
                <p className="line-clamp-2 text-sm text-text-secondary min-h-[2.5rem] leading-snug">
                  {post.caption ?? '—'}
                </p>
                <p className="text-xs text-text-muted">{formatDate(post.publishedAt)}</p>

                <div className="grid grid-cols-5 gap-1 pt-1">
                  {[
                    { icon: <Eye size={14} />, value: post.views ?? 0 },
                    { icon: <Heart size={14} />, value: post.likes ?? 0 },
                    { icon: <MessageCircle size={14} />, value: post.comments ?? 0 },
                    { icon: <Share2 size={14} />, value: post.shares ?? 0 },
                    { icon: <Bookmark size={14} />, value: post.saves ?? 0 },
                  ].map((metric, i) => (
                    <div
                      key={i}
                      className="flex flex-col items-center gap-0.5 rounded-md bg-surface-hover/50 px-1 py-1.5 text-text-secondary"
                    >
                      {metric.icon}
                      <span className="text-xs font-semibold tabular-nums">
                        {formatNumber(metric.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
