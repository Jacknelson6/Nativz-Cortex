/**
 * ZNA-04: server-side query that powers the analytics post grid.
 *
 * - Pulls `post_metrics` rows filtered by client, platform set, and a
 *   `since_days` window.
 * - Supports cursor pagination on the chosen sort field with a stable `id`
 *   tiebreak so two posts with the same published_at don't get duplicated or
 *   skipped.
 * - Resolves the rendered thumbnail URL with precedence:
 *     storage URL → Zernio CDN URL → null (fallback tile in UI).
 * - Recomputes engagement_rate on the fly using `views_count` as denominator
 *   per analytics accuracy pass (saves excluded).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type PostGridPlatform = 'tiktok' | 'instagram' | 'facebook' | 'youtube';
export type PostGridSort = 'published_at' | 'views_count' | 'engagement_rate';
export type PostGridOrder = 'asc' | 'desc';

export interface PostCard {
  id: string;
  client_id: string;
  platform: PostGridPlatform;
  external_post_id: string;
  post_url: string;
  caption: string;
  post_type: string | null;
  published_at: string;
  views_count: number;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  saves_count: number;
  engagement_rate: number;
  thumbnail_url: string | null;
  thumbnail_source: 'storage' | 'cdn' | 'fallback';
  watch_time_seconds: number | null;
}

export interface PostsResponse {
  client_id: string;
  range_since_days: number;
  sort: PostGridSort;
  order: PostGridOrder;
  posts: PostCard[];
  next_cursor: string | null;
}

export interface LoadPostsArgs {
  supabase: SupabaseClient;
  clientId: string;
  platforms?: PostGridPlatform[];
  sort: PostGridSort;
  order: PostGridOrder;
  limit: number;
  cursor?: string;
  sinceDays: number;
}

export interface LoadPostsResult {
  posts: PostCard[];
  nextCursor: string | null;
}

interface CursorPayload {
  v: number | string;
  id: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const raw = Buffer.from(cursor, 'base64').toString('utf8');
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.id === 'string' &&
      (typeof parsed.v === 'number' || typeof parsed.v === 'string')
    ) {
      return parsed as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}

function computeEngagementRate(row: {
  views_count: number | null;
  likes_count: number | null;
  comments_count: number | null;
  shares_count: number | null;
}): number {
  const views = row.views_count ?? 0;
  if (views <= 0) return 0;
  const interactions =
    (row.likes_count ?? 0) + (row.comments_count ?? 0) + (row.shares_count ?? 0);
  return (interactions / views) * 100;
}

function resolveThumbnail(row: {
  thumbnail_storage_url: string | null;
  thumbnail_url: string | null;
}): { url: string | null; source: 'storage' | 'cdn' | 'fallback' } {
  if (row.thumbnail_storage_url) {
    return { url: row.thumbnail_storage_url, source: 'storage' };
  }
  if (row.thumbnail_url) {
    return { url: row.thumbnail_url, source: 'cdn' };
  }
  return { url: null, source: 'fallback' };
}

function sortToColumn(sort: PostGridSort): string {
  // engagement_rate is computed in app code so we sort by views as a
  // best-effort proxy, then re-sort the page in memory to honour true ER.
  if (sort === 'engagement_rate') return 'views_count';
  return sort;
}

export async function loadPostsForGrid(args: LoadPostsArgs): Promise<LoadPostsResult> {
  const {
    supabase,
    clientId,
    platforms,
    sort,
    order,
    limit,
    cursor,
    sinceDays,
  } = args;

  const sinceIso = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const sortColumn = sortToColumn(sort);
  const ascending = order === 'asc';

  let query = supabase
    .from('post_metrics')
    .select(
      'id, client_id, platform, external_post_id, post_url, caption, post_type, published_at, views_count, likes_count, comments_count, shares_count, saves_count, watch_time_seconds, thumbnail_url, thumbnail_storage_url',
    )
    .eq('client_id', clientId)
    .gte('published_at', sinceIso);

  if (platforms && platforms.length > 0) {
    query = query.in('platform', platforms);
  }

  // Fetch limit+1 so we can detect whether a next page exists without a
  // separate count query.
  query = query
    .order(sortColumn, { ascending })
    .order('id', { ascending })
    .limit(limit + 1);

  const decoded = cursor ? decodeCursor(cursor) : null;
  if (decoded) {
    // Build a (sortValue, id) tuple cursor: rows whose sortColumn is strictly
    // past the cursor value, or rows whose sortColumn equals the cursor value
    // but whose id is strictly past it.
    const v = decoded.v;
    if (ascending) {
      query = query.or(
        `${sortColumn}.gt.${v},and(${sortColumn}.eq.${v},id.gt.${decoded.id})`,
      );
    } else {
      query = query.or(
        `${sortColumn}.lt.${v},and(${sortColumn}.eq.${v},id.lt.${decoded.id})`,
      );
    }
  }

  const { data: rows, error } = await query;
  if (error) {
    throw new Error(`loadPostsForGrid query failed: ${error.message}`);
  }

  const fetched = rows ?? [];
  const hasMore = fetched.length > limit;
  const slice = hasMore ? fetched.slice(0, limit) : fetched;

  let cards: PostCard[] = slice.map((row) => {
    const thumb = resolveThumbnail(row);
    return {
      id: row.id,
      client_id: row.client_id,
      platform: row.platform as PostGridPlatform,
      external_post_id: row.external_post_id ?? '',
      post_url: row.post_url ?? '',
      caption: row.caption ?? '',
      post_type: row.post_type ?? null,
      published_at: row.published_at,
      views_count: row.views_count ?? 0,
      likes_count: row.likes_count ?? 0,
      comments_count: row.comments_count ?? 0,
      shares_count: row.shares_count ?? 0,
      saves_count: row.saves_count ?? 0,
      engagement_rate: computeEngagementRate(row),
      thumbnail_url: thumb.url,
      thumbnail_source: thumb.source,
      // TikTok watch_time_seconds always null until Zernio surfaces it.
      watch_time_seconds:
        row.platform === 'tiktok' ? null : row.watch_time_seconds ?? null,
    };
  });

  // engagement_rate is computed in JS, so re-sort the page in memory when the
  // caller asked for that sort. Database-side sort by views still produces a
  // sensible neighbourhood for cursor pagination.
  if (sort === 'engagement_rate') {
    cards = [...cards].sort((a, b) =>
      ascending ? a.engagement_rate - b.engagement_rate : b.engagement_rate - a.engagement_rate,
    );
  }

  // Cursor must reflect the DB-sort order so the next page query continues
  // from where the SQL left off. For engagement_rate, the JS re-sort above
  // reorders `cards` in-memory but the DB neighbourhood is still keyed by
  // views_count + id, so we encode the cursor from `slice` (raw DB order),
  // not `cards` (post-resort order). Otherwise the next page can skip or
  // duplicate rows.
  let nextCursor: string | null = null;
  if (hasMore && slice.length > 0) {
    const last = slice[slice.length - 1];
    const v: number | string =
      sort === 'published_at'
        ? last.published_at
        : sort === 'views_count'
          ? (last.views_count ?? 0)
          : // engagement_rate: DB-paginates by views_count
            (last.views_count ?? 0);
    nextCursor = encodeCursor({ v, id: last.id });
  }

  return { posts: cards, nextCursor };
}
