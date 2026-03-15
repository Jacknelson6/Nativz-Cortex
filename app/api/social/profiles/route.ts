import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/social/profiles
 *
 * List active social profiles for a client, ordered by platform name. Used by the
 * analytics and reporting UIs to enumerate connected accounts.
 *
 * @auth Required (any authenticated user)
 * @query clientId - Client UUID to filter by (required)
 * @returns {SocialProfile[]}
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clientId = request.nextUrl.searchParams.get('clientId');
    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('social_profiles')
      .select('id, platform, platform_user_id, username, avatar_url, is_active, created_at, updated_at')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .order('platform');

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error('[social/profiles] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
