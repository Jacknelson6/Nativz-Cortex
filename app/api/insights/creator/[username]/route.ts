import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { scrapeCreatorEnrichment } from '@/lib/tiktok-shop/scrape-creator-enrichment';

export const maxDuration = 120;
const ADMIN_ROLES = ['admin', 'super_admin'];
const FRESH_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/insights/creator/[username]
 *
 * Returns cached lemur enrichment for a creator. If the cached snapshot
 * is older than 24h or `?refresh=1` is passed, re-run lemur and update
 * the snapshot. The UI labels anything older than 24h as stale.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await params;
    const handle = decodeURIComponent(username).replace(/^@/, '').trim().toLowerCase();
    if (!handle) {
      return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: userData } = await admin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!userData || !ADMIN_ROLES.includes(userData.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get('refresh') === '1';

    const { data: snapshot } = await admin
      .from('tiktok_shop_creator_snapshots')
      .select('*')
      .eq('username', handle)
      .maybeSingle();

    const isStale =
      !snapshot ||
      !snapshot.fetched_at ||
      Date.now() - new Date(snapshot.fetched_at).getTime() > FRESH_TTL_MS;

    if (snapshot && !isStale && !forceRefresh) {
      return NextResponse.json({
        creator: snapshot.data,
        fetched_at: snapshot.fetched_at,
        stale: false,
      });
    }

    // Run lemur fresh.
    const enrichment = await scrapeCreatorEnrichment(handle);
    if (!enrichment) {
      // If we have a stale cached version, return it with stale=true so
      // the UI can at least show something.
      if (snapshot) {
        return NextResponse.json({
          creator: snapshot.data,
          fetched_at: snapshot.fetched_at,
          stale: true,
          error: 'Live refresh failed — showing last cached snapshot',
        });
      }
      return NextResponse.json(
        { error: 'Enrichment failed for @' + handle },
        { status: 502 },
      );
    }

    const now = new Date().toISOString();
    await admin
      .from('tiktok_shop_creator_snapshots')
      .upsert(
        {
          username: handle,
          nickname: enrichment.nickname,
          avatar_url: enrichment.avatarUrl,
          region: enrichment.region,
          bio: enrichment.bio,
          data: enrichment as unknown as Record<string, unknown>,
          fetched_at: now,
        },
        { onConflict: 'username' },
      );

    return NextResponse.json({
      creator: enrichment,
      fetched_at: now,
      stale: false,
    });
  } catch (error) {
    console.error('GET /api/insights/creator/[username] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
