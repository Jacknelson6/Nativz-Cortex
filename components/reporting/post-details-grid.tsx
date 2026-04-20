'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, ThumbsUp, MessageCircle, Share2, Eye, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PlatformBadge } from './platform-badge';
import type { SocialPlatform } from '@/lib/types/reporting';

interface PostRow {
  id: string;
  platform: SocialPlatform;
  postUrl: string | null;
  thumbnailUrl: string | null;
  caption: string | null;
  publishedAt: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  engagementRate: number;
  totalEngagement: number;
}

type SortKey = 'newest' | 'oldest' | 'engagement' | 'views';

interface PostDetailsGridProps {
  clientId: string;
  start: string;
  end: string;
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const PLATFORM_OPTIONS: Array<{ value: SocialPlatform | 'all'; label: string }> = [
  { value: 'all', label: 'All platforms' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'linkedin', label: 'LinkedIn' },
];

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'engagement', label: 'Most engagement' },
  { value: 'views', label: 'Most views' },
];

export function PostDetailsGrid({ clientId, start, end }: PostDetailsGridProps) {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [platform, setPlatform] = useState<SocialPlatform | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('newest');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      clientId,
      start,
      end,
      sort,
      page: String(page),
      limit: '24',
    });
    if (platform !== 'all') params.set('platform', platform);

    fetch(`/api/reporting/post-details?${params}`)
      .then((r) => (r.ok ? r.json() : { posts: [], total: 0, hasMore: false }))
      .then((d) => {
        setPosts(d.posts ?? []);
        setTotal(d.total ?? 0);
        setHasMore(d.hasMore ?? false);
      })
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [clientId, start, end, platform, sort, page]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-nativz-border/70">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Post details</h3>
          <p className="text-xs text-text-muted mt-0.5">{total} total posts in this window</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={platform}
            onChange={(e) => {
              setPlatform(e.target.value as SocialPlatform | 'all');
              setPage(1);
            }}
            className="rounded-md border border-nativz-border bg-surface px-2 py-1 text-xs text-text-primary"
          >
            {PLATFORM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortKey);
              setPage(1);
            }}
            className="rounded-md border border-nativz-border bg-surface px-2 py-1 text-xs text-text-primary"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : posts.length === 0 ? (
        <p className="p-8 text-center text-sm text-text-muted">No posts match these filters.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {posts.map((p) => (
            <a
              key={p.id}
              href={p.postUrl ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex gap-3 rounded-lg border border-nativz-border bg-surface p-3 transition-colors hover:border-accent-border/60 hover:bg-surface-hover"
            >
              {p.thumbnailUrl ? (
                <img
                  src={p.thumbnailUrl}
                  alt=""
                  className="h-24 w-14 flex-shrink-0 rounded-md object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="h-24 w-14 flex-shrink-0 rounded-md bg-surface-hover" />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center justify-between">
                  <PlatformBadge platform={p.platform} showLabel={false} size="sm" />
                  {p.postUrl && <ExternalLink size={12} className="text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />}
                </div>
                <p className="text-[11px] text-text-muted">{formatDate(p.publishedAt)}</p>
                <p className="text-xs text-text-primary line-clamp-3 leading-snug">
                  {p.caption ?? '—'}
                </p>
                <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-muted tabular-nums">
                  <span className="inline-flex items-center gap-0.5"><Eye size={10} />{formatNumber(p.views)}</span>
                  <span className="inline-flex items-center gap-0.5"><ThumbsUp size={10} />{formatNumber(p.likes)}</span>
                  <span className="inline-flex items-center gap-0.5"><MessageCircle size={10} />{formatNumber(p.comments)}</span>
                  <span className="inline-flex items-center gap-0.5"><Share2 size={10} />{formatNumber(p.shares)}</span>
                  {p.engagementRate > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-accent-text">
                      <TrendingUp size={10} />{p.engagementRate.toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      {(hasMore || page > 1) && !loading && (
        <div className="flex items-center justify-between gap-3 border-t border-nativz-border/70 px-5 py-3">
          <span className="text-xs text-text-muted">Page {page}</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
