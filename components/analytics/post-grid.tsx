'use client';

// ZNA-04: client wrapper for the analytics post grid. Owns local state for
// platform filter, sort selection, and load-more pagination. Initial page
// data is server-rendered; subsequent pages are fetched from the same admin
// or portal endpoint (resolved via `endpoint` prop so this component can be
// reused in both contexts).

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { PostCard } from './post-card';
import { PostGridFilterBar, type StatusChip } from './post-grid-filter-bar';
import type {
  PostCard as PostCardData,
  PostGridPlatform,
  PostGridSort,
  PostGridOrder,
  PostsResponse,
} from '@/lib/analytics/posts-query';
import type { PostCardSignal } from '@/lib/analytics/resolve-post-signals';
import type { PostCardTrajectory } from '@/lib/analytics/resolve-post-trajectories';

type PostCardWithExtras = PostCardData & {
  signal?: PostCardSignal;
  trajectory?: PostCardTrajectory;
};
type PostsResponseWithExtras = Omit<PostsResponse, 'posts'> & { posts: PostCardWithExtras[] };

interface Props {
  initial: PostsResponseWithExtras;
  endpoint: '/api/analytics/zernio/posts' | '/api/portal/analytics/zernio/posts';
  clientId?: string;            // required for admin endpoint, ignored for portal
  brandAvatarUrl?: string | null;
  availablePlatforms: PostGridPlatform[];
  rangeSinceDays: number;
}

export function PostGrid({
  initial,
  endpoint,
  clientId,
  brandAvatarUrl,
  availablePlatforms,
  rangeSinceDays,
}: Props) {
  const audience: 'admin' | 'portal' = endpoint.startsWith('/api/portal/') ? 'portal' : 'admin';
  const [selectedPlatforms, setSelectedPlatforms] = useState<PostGridPlatform[]>(availablePlatforms);
  const [sort, setSort] = useState<PostGridSort>(initial.sort);
  const [aboveAvgOnly, setAboveAvgOnly] = useState(false);
  const [status, setStatus] = useState<StatusChip>('any');
  const order: PostGridOrder = initial.order;
  const [posts, setPosts] = useState<PostCardWithExtras[]>(initial.posts);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.next_cursor);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  const buildQuery = useCallback(
    (cursor: string | null): string => {
      const params = new URLSearchParams();
      if (clientId && endpoint.startsWith('/api/analytics/')) {
        params.set('client_id', clientId);
      }
      if (selectedPlatforms.length > 0 && selectedPlatforms.length !== availablePlatforms.length) {
        params.set('platforms', selectedPlatforms.join(','));
      }
      params.set('sort', sort);
      params.set('order', order);
      params.set('limit', '30');
      params.set('since_days', String(rangeSinceDays));
      if (aboveAvgOnly) params.set('signal', 'above_avg');
      if (status !== 'any') params.set('status', status);
      if (cursor) params.set('cursor', cursor);
      return `${endpoint}?${params.toString()}`;
    },
    [clientId, endpoint, selectedPlatforms, availablePlatforms, sort, order, rangeSinceDays, aboveAvgOnly, status],
  );

  // Refetch from page 1 whenever filter or sort changes (after initial render).
  const filterFingerprint = useMemo(
    () => `${selectedPlatforms.slice().sort().join(',')}|${sort}|${aboveAvgOnly ? '1' : '0'}|${status}`,
    [selectedPlatforms, sort, aboveAvgOnly, status],
  );
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);
  useEffect(() => {
    if (!hasMounted) return;
    if (selectedPlatforms.length === 0) {
      setPosts([]);
      setNextCursor(null);
      return;
    }
    setLoading(true);
    fetch(buildQuery(null), { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: PostsResponseWithExtras) => {
        startTransition(() => {
          setPosts(data.posts ?? []);
          setNextCursor(data.next_cursor ?? null);
        });
      })
      .catch((err) => {
        console.error('[zna-04] post grid refetch failed', err);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterFingerprint, hasMounted]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const res = await fetch(buildQuery(nextCursor), { cache: 'no-store' });
      const data: PostsResponseWithExtras = await res.json();
      setPosts((prev) => [...prev, ...(data.posts ?? [])]);
      setNextCursor(data.next_cursor ?? null);
    } catch (err) {
      console.error('[zna-04] post grid load-more failed', err);
    } finally {
      setLoading(false);
    }
  }, [nextCursor, loading, buildQuery]);

  return (
    <section className="space-y-3">
      <PostGridFilterBar
        platforms={availablePlatforms}
        selectedPlatforms={selectedPlatforms}
        onPlatformChange={setSelectedPlatforms}
        sort={sort}
        onSortChange={setSort}
        aboveAvgOnly={aboveAvgOnly}
        onAboveAvgOnlyChange={setAboveAvgOnly}
        status={status}
        onStatusChange={setStatus}
        audience={audience}
      />

      {posts.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-surface p-8 text-center">
          <div className="text-sm font-medium">
            No posts in the last {rangeSinceDays} days.
          </div>
          <div className="text-xs text-white/50 mt-1">
            Posts that publish will show up here automatically.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} brandAvatarUrl={brandAvatarUrl} />
          ))}
        </div>
      )}

      {nextCursor ? (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="h-9 px-4 rounded-full bg-white/5 text-sm text-white/80 hover:bg-white/10 whitespace-nowrap disabled:opacity-60"
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
