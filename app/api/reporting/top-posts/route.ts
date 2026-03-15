import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { TopPostItem } from '@/lib/types/reporting';

const querySchema = z.object({
  clientId: z.string().uuid(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  limit: z.coerce.number().int().min(1).max(50).default(3),
});

/**
 * GET /api/reporting/top-posts
 *
 * Fetch the top-performing posts for a client within a date range, ranked by total
 * engagement (likes + comments + shares + saves). Includes social profile username.
 *
 * @auth Required (any authenticated user)
 * @query clientId - Client UUID (required)
 * @query start - Date range start YYYY-MM-DD (required)
 * @query end - Date range end YYYY-MM-DD (required)
 * @query limit - Number of posts to return, 1-50 (default 3)
 * @returns {{ posts: TopPostItem[], dateRange: { start, end } }}
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      clientId: searchParams.get('clientId'),
      start: searchParams.get('start'),
      end: searchParams.get('end'),
      limit: searchParams.get('limit') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { clientId, start, end, limit } = parsed.data;

    // Query post_metrics with join to social_profiles for username
    const { data: posts, error: postsError } = await supabase
      .from('post_metrics')
      .select('*, social_profiles!inner(username)')
      .eq('client_id', clientId)
      .gte('published_at', start)
      .lte('published_at', end);

    if (postsError) {
      return NextResponse.json(
        { error: 'Failed to fetch post metrics' },
        { status: 500 },
      );
    }

    // Calculate total engagement, sort, rank, and slice
    const ranked: TopPostItem[] = (posts ?? [])
      .map((post) => {
        const totalEngagement =
          (post.likes_count ?? 0) +
          (post.comments_count ?? 0) +
          (post.shares_count ?? 0) +
          (post.saves_count ?? 0);

        const profile = post.social_profiles as unknown as {
          username: string;
        } | null;

        return {
          rank: 0,
          id: post.id,
          platform: post.platform,
          username: profile?.username ?? '',
          externalPostId: post.external_post_id,
          postUrl: post.post_url ?? null,
          thumbnailUrl: post.thumbnail_url ?? null,
          caption: post.caption ?? null,
          postType: post.post_type ?? null,
          publishedAt: post.published_at ?? null,
          views: post.views_count ?? 0,
          likes: post.likes_count ?? 0,
          comments: post.comments_count ?? 0,
          shares: post.shares_count ?? 0,
          saves: post.saves_count ?? 0,
          totalEngagement,
        };
      })
      .sort((a, b) => b.totalEngagement - a.totalEngagement)
      .slice(0, limit)
      .map((post, index) => ({
        ...post,
        rank: index + 1,
      }));

    return NextResponse.json({
      posts: ranked,
      dateRange: { start, end },
    });
  } catch (error) {
    console.error('GET /api/reporting/top-posts error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
