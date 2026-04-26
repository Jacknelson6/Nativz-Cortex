'use client';

import { memo, useEffect, useState } from 'react';
import {
  ExternalLink,
  Heart,
  MessageCircle,
  Eye,
  TrendingUp,
  Play,
  Facebook,
  Instagram,
  Linkedin,
  Youtube,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TikTokMark } from '@/components/integrations/tiktok-mark';
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
  { value: 'engagement', label: 'Most engagement' },
  { value: 'views', label: 'Most views' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
];

const VERTICAL_PLATFORMS: SocialPlatform[] = ['tiktok', 'instagram', 'youtube'];

/**
 * Monochrome platform glyph rendered inline in each post card header. Echoes
 * the topic-search input aesthetic: simple silhouettes in muted text color,
 * no colored pill backgrounds, no brand-color fills. The icon is the only
 * platform identifier on the card now, so we render it at 22px in
 * `text-text-secondary` — present enough to read at a glance without
 * competing with the thumbnail or caption.
 */
function PlatformGlyph({ platform }: { platform: SocialPlatform }) {
  const size = 22;
  const className = 'shrink-0 text-text-secondary';
  switch (platform) {
    case 'tiktok':
      return <TikTokMark variant="mono" size={size} className={className} />;
    case 'instagram':
      return <Instagram size={size} className={className} aria-hidden />;
    case 'facebook':
      return <Facebook size={size} className={className} aria-hidden />;
    case 'youtube':
      return <Youtube size={size} className={className} aria-hidden />;
    case 'linkedin':
      return <Linkedin size={size} className={className} aria-hidden />;
    default:
      return null;
  }
}

export function PostDetailsGrid({ clientId, start, end }: PostDetailsGridProps) {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [platform, setPlatform] = useState<SocialPlatform | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('engagement');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadPosts() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          clientId,
          start,
          end,
          sort,
          page: String(page),
          limit: '24',
        });
        if (platform !== 'all') params.set('platform', platform);

        const r = await fetch(`/api/reporting/post-details?${params}`);
        const d = r.ok ? await r.json() : { posts: [], total: 0, hasMore: false };
        if (cancelled) return;
        setPosts(d.posts ?? []);
        setTotal(d.total ?? 0);
        setHasMore(d.hasMore ?? false);
      } catch {
        if (!cancelled) setPosts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadPosts();
    return () => {
      cancelled = true;
    };
  }, [clientId, start, end, platform, sort, page]);

  const displayed = showAll ? posts : posts.slice(0, 12);
  const canShowMore = !showAll && posts.length > 12;
  const showBottomFade = canShowMore;

  return (
    <section className="rounded-2xl border border-nativz-border/60 bg-background/20 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="ui-section-title">Post details</h3>
          <p className="mt-1 text-sm text-text-muted">
            {total > 0 ? `${total} total posts` : 'All posts published in this window'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={platform}
            onChange={(e) => {
              setPlatform(e.target.value as SocialPlatform | 'all');
              setPage(1);
              setShowAll(false);
            }}
            className="rounded-md border border-nativz-border bg-surface px-2.5 py-1.5 text-sm text-text-primary"
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
              setShowAll(false);
            }}
            className="rounded-md border border-nativz-border bg-surface px-2.5 py-1.5 text-sm text-text-primary"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[360px] rounded-2xl" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <Card>
          <p className="py-12 text-center text-sm text-text-muted">No posts match these filters.</p>
        </Card>
      ) : (
        <div className="relative">
          <div
            className={cn(
              'grid auto-rows-[min-content] grid-cols-1 items-start gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4',
              showBottomFade && 'pb-2',
            )}
          >
            {displayed.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
          {showBottomFade && (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-background from-35% via-background/70 to-transparent sm:h-32"
              aria-hidden
            />
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {canShowMore && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="flex-1 cursor-pointer py-2 text-center text-sm text-accent-text hover:underline"
          >
            Show more
          </button>
        )}
        {(hasMore || page > 1) && !loading && posts.length > 0 && (
          <div className="flex items-center gap-3 text-sm text-text-muted">
            <span>Page {page}</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPage((p) => Math.max(1, p - 1));
                  setShowAll(false);
                }}
                disabled={page === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPage((p) => p + 1);
                  setShowAll(false);
                }}
                disabled={!hasMore}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

const PostCard = memo(function PostCard({ post }: { post: PostRow }) {
  const isVertical = VERTICAL_PLATFORMS.includes(post.platform);
  const thumb = post.thumbnailUrl;

  const open = () => {
    if (post.postUrl) window.open(post.postUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <article
      className={cn(
        'group flex h-auto w-full cursor-pointer flex-col self-start overflow-hidden rounded-2xl border border-nativz-border bg-surface shadow-[var(--shadow-card)] transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-accent/35 hover:shadow-[var(--shadow-card-hover)]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-text/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      )}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
    >
      <div className="flex gap-3 px-4 pt-3 pb-3">
        <div className="shrink-0 pt-0.5">
          <PlatformGlyph platform={post.platform} />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-snug text-text-primary">
              {post.caption ?? 'Untitled post'}
            </p>
            <time
              className="shrink-0 pt-0.5 text-xs tabular-nums text-text-muted"
              dateTime={post.publishedAt ?? undefined}
            >
              {formatDate(post.publishedAt)}
            </time>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-text-muted sm:text-sm">
            <span className="inline-flex items-center gap-1.5 text-text-secondary">
              <Eye size={14} className="shrink-0 opacity-80" aria-hidden />
              {formatNumber(post.views)}
            </span>
            <span className="inline-flex items-center gap-1.5 text-text-secondary">
              <Heart size={14} className="shrink-0 opacity-80" aria-hidden />
              {formatNumber(post.likes)}
            </span>
            <span className="inline-flex items-center gap-1.5 text-text-secondary">
              <MessageCircle size={14} className="shrink-0 opacity-80" aria-hidden />
              {formatNumber(post.comments)}
            </span>
            {post.engagementRate > 0 && (
              <span className="inline-flex items-center gap-1.5 font-medium text-accent-text">
                <TrendingUp size={14} className="shrink-0 opacity-90" aria-hidden />
                {post.engagementRate.toFixed(1)}% ER
              </span>
            )}
          </div>
        </div>
      </div>

      {thumb ? (
        <div
          className={cn(
            'group/thumb relative w-full shrink-0 overflow-hidden bg-black/30 outline-none',
            isVertical
              ? 'aspect-[9/16] min-h-0 w-full max-h-[min(15rem,45vw)] sm:max-h-[min(16rem,24vw)] lg:max-h-[min(17rem,20vw)]'
              : 'aspect-video min-h-0 w-full max-h-[min(15rem,45vw)] sm:max-h-[min(16rem,24vw)] lg:max-h-[min(17rem,20vw)]',
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumb}
            alt=""
            className="pointer-events-none h-full w-full object-cover object-center"
            loading="lazy"
          />
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/55 opacity-0 transition-opacity group-hover/thumb:pointer-events-auto group-hover/thumb:opacity-100">
            {post.postUrl && (
              <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-md transition-all duration-200 group-hover/thumb:scale-105 group-hover/thumb:shadow-lg hover:bg-accent hover:text-white">
                <Play size={16} className="shrink-0 fill-current" aria-hidden />
                View
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="mx-4 mb-2 flex min-h-[88px] shrink-0 items-center justify-center self-stretch rounded-xl border border-dashed border-nativz-border/60 bg-background/40 px-3 text-center text-sm text-text-muted">
          {post.postUrl ? (
            <span className="inline-flex items-center gap-1.5">
              Open on {post.platform} <ExternalLink size={12} />
            </span>
          ) : (
            'No thumbnail'
          )}
        </div>
      )}
    </article>
  );
});
