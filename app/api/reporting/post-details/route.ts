import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const querySchema = z.object({
  clientId: z.string().uuid(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  platform: z.enum(['facebook', 'instagram', 'tiktok', 'youtube', 'linkedin']).optional(),
  sort: z.enum(['newest', 'oldest', 'engagement', 'views']).default('engagement'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

/**
 * GET /api/reporting/post-details
 *
 * Paginated + filterable list of posts for a client — drives the "Post
 * Details" grid. Pure DB read against post_metrics (already synced from
 * Zernio), so no extra Zernio calls per view.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    clientId: searchParams.get('clientId'),
    start: searchParams.get('start') ?? undefined,
    end: searchParams.get('end') ?? undefined,
    platform: searchParams.get('platform') ?? undefined,
    sort: searchParams.get('sort') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid params', details: parsed.error.flatten() }, { status: 400 });
  }

  const { clientId, start, end, platform, sort, page, limit } = parsed.data;
  const offset = (page - 1) * limit;

  let baseQuery = supabase
    .from('post_metrics')
    .select(
      'id, platform, external_post_id, post_url, thumbnail_url, caption, post_type, published_at, views_count, likes_count, comments_count, shares_count, saves_count, reach_count, engagement_rate',
      { count: 'exact' },
    )
    .eq('client_id', clientId);

  if (platform) baseQuery = baseQuery.eq('platform', platform);
  if (start) baseQuery = baseQuery.gte('published_at', `${start}T00:00:00`);
  if (end) baseQuery = baseQuery.lte('published_at', `${end}T23:59:59`);

  // Engagement sort must sum likes+comments+shares+saves — Postgres can't
  // ORDER BY an arbitrary expression without a SQL function or generated
  // column, so we pull a wider page and sort in JS. Capped at 500 to keep
  // memory bounded; any client with >500 posts in a window would need a
  // proper computed column.
  if (sort === 'engagement') {
    const { data, count } = await baseQuery
      .order('likes_count', { ascending: false, nullsFirst: false })
      .range(0, 499);
    const rows = data ?? [];
    const ranked = rows
      .map((p) => ({
        raw: p,
        total:
          (p.likes_count ?? 0) +
          (p.comments_count ?? 0) +
          (p.shares_count ?? 0) +
          (p.saves_count ?? 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(offset, offset + limit)
      .map(({ raw: p }) => shapePost(p));

    return NextResponse.json({
      posts: ranked,
      page,
      limit,
      total: count ?? rows.length,
      hasMore: (count ?? rows.length) > offset + limit,
    });
  }

  let query = baseQuery;
  switch (sort) {
    case 'oldest':
      query = query.order('published_at', { ascending: true, nullsFirst: false });
      break;
    case 'views':
      query = query.order('views_count', { ascending: false, nullsFirst: false });
      break;
    case 'newest':
    default:
      query = query.order('published_at', { ascending: false, nullsFirst: false });
  }

  const { data, count } = await query.range(offset, offset + limit - 1);

  return NextResponse.json({
    posts: (data ?? []).map(shapePost),
    page,
    limit,
    total: count ?? 0,
    hasMore: (count ?? 0) > offset + limit,
  });
}

type PostRow = {
  id: string;
  platform: string;
  external_post_id: string | null;
  post_url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  post_type: string | null;
  published_at: string | null;
  views_count: number | null;
  likes_count: number | null;
  comments_count: number | null;
  shares_count: number | null;
  saves_count: number | null;
  reach_count: number | null;
  engagement_rate: number | null;
};

function shapePost(p: PostRow) {
  return {
    id: p.id,
    platform: p.platform,
    postId: p.external_post_id,
    postUrl: p.post_url,
    thumbnailUrl: p.thumbnail_url,
    caption: p.caption,
    postType: p.post_type,
    publishedAt: p.published_at,
    views: p.views_count ?? 0,
    likes: p.likes_count ?? 0,
    comments: p.comments_count ?? 0,
    shares: p.shares_count ?? 0,
    saves: p.saves_count ?? 0,
    reach: p.reach_count ?? 0,
    engagementRate: p.engagement_rate ?? 0,
    totalEngagement:
      (p.likes_count ?? 0) + (p.comments_count ?? 0) + (p.shares_count ?? 0) + (p.saves_count ?? 0),
  };
}
