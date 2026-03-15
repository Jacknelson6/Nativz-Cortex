/**
 * GET /api/instagram/media
 *
 * Fetch recent Instagram media posts for a Business Account with engagement metrics.
 * Optionally fetches per-post insights (slower — makes one extra API call per post).
 *
 * @auth Required (admin)
 * @query account_id - Instagram Business Account ID (required)
 * @query limit - Max posts to return (default: 25, max: 50)
 * @query insights - If 'true', fetch per-post insight metrics (default: false)
 * @returns {{ media: InstagramMedia[] }}
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  isInstagramConfigured,
  getRecentMedia,
  getMediaInsights,
} from '@/lib/instagram/client';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    if (!isInstagramConfigured()) {
      return NextResponse.json({ error: 'Instagram not configured' }, { status: 503 });
    }

    const accountId = request.nextUrl.searchParams.get('account_id');
    if (!accountId) {
      return NextResponse.json({ error: 'account_id is required' }, { status: 400 });
    }

    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') || '25'), 50);
    const includeInsights = request.nextUrl.searchParams.get('insights') === 'true';

    const media = await getRecentMedia(accountId, limit);

    if (includeInsights) {
      const withInsights = await Promise.all(
        media.map(async (m) => {
          const insights = await getMediaInsights(m.id, m.media_type);
          return { ...m, insights };
        })
      );
      return NextResponse.json({ media: withInsights });
    }

    return NextResponse.json({ media });
  } catch (error) {
    console.error('GET /api/instagram/media error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch media' },
      { status: 500 }
    );
  }
}
