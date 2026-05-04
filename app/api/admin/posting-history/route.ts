import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

/**
 * GET /api/admin/posting-history
 *
 * Cross-brand posting log. Lists every scheduled post that has reached a
 * publish-stage state (`published`, `partially_failed`, `failed`,
 * `publishing`) along with its per-platform results. Ordered by
 * `published_at` desc with `scheduled_at` desc as a fallback so attempts
 * still mid-publish surface near the top.
 *
 * Each row includes:
 *   - client name + logo
 *   - drop_id (for routing to /admin/calendar/{dropId})
 *   - caption snippet
 *   - status / scheduled_at / published_at / failure_reason
 *   - platforms[]: { platform, username, status, failure_reason, external_post_url }
 *
 * @auth admin only
 * @query limit - max rows (default 200)
 * @query status - 'all' | 'failed' | 'partial' | 'success' (default 'all')
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get('limit') ?? 200), 500);
  const filter = searchParams.get('status') ?? 'all';

  const adminClient = createAdminClient();

  let query = adminClient
    .from('scheduled_posts')
    .select(
      `
        id,
        client_id,
        caption,
        status,
        scheduled_at,
        published_at,
        failure_reason,
        clients ( id, name, logo_url ),
        scheduled_post_platforms (
          status,
          failure_reason,
          external_post_url,
          social_profiles ( platform, username )
        )
      `,
    )
    .in('status', ['published', 'partially_failed', 'failed', 'publishing'])
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('scheduled_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (filter === 'failed') query = query.eq('status', 'failed');
  if (filter === 'partial') query = query.eq('status', 'partially_failed');
  if (filter === 'success') query = query.eq('status', 'published');

  const { data: posts, error } = await query;
  if (error) {
    console.error('Posting history error:', error);
    return NextResponse.json({ error: 'failed to load' }, { status: 500 });
  }

  // Pull drop_id mapping in a single round-trip so we can deep-link rows
  // back to their content drop without N+1ing the calendar tables.
  const postIds = (posts ?? []).map((p) => p.id as string);
  const dropIdByPostId: Record<string, string> = {};
  if (postIds.length > 0) {
    const { data: dropVideos } = await adminClient
      .from('content_drop_videos')
      .select('scheduled_post_id, drop_id')
      .in('scheduled_post_id', postIds);
    for (const v of (dropVideos ?? []) as Array<{ scheduled_post_id: string; drop_id: string }>) {
      dropIdByPostId[v.scheduled_post_id] = v.drop_id;
    }
  }

  const rows = (posts ?? []).map((p: Record<string, unknown>) => {
    const client = p.clients as { id: string; name: string; logo_url: string | null } | null;
    const platforms = ((p.scheduled_post_platforms as Array<Record<string, unknown>>) ?? []).map(
      (spp) => {
        const profile = spp.social_profiles as Record<string, unknown> | null;
        return {
          platform: (profile?.platform as string) ?? '',
          username: (profile?.username as string | null) ?? null,
          status: (spp.status as string) ?? 'pending',
          failure_reason: (spp.failure_reason as string | null) ?? null,
          external_post_url: (spp.external_post_url as string | null) ?? null,
        };
      },
    );
    return {
      id: p.id as string,
      client_id: p.client_id as string,
      client_name: client?.name ?? null,
      client_logo_url: client?.logo_url ?? null,
      drop_id: dropIdByPostId[p.id as string] ?? null,
      caption: ((p.caption as string | null) ?? '').slice(0, 200),
      status: p.status as string,
      scheduled_at: (p.scheduled_at as string | null) ?? null,
      published_at: (p.published_at as string | null) ?? null,
      failure_reason: (p.failure_reason as string | null) ?? null,
      platforms,
    };
  });

  return NextResponse.json({ rows });
}
