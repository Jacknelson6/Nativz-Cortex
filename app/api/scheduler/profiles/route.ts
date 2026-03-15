import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/scheduler/profiles
 *
 * List active social profiles connected to a client for use in the post scheduler.
 * Returns profiles that have been connected via Late OAuth, ordered by platform name.
 *
 * @auth Required (any authenticated user)
 * @query client_id - Client UUID (required)
 * @returns {{ profiles: { id, platform, username, avatar_url, late_account_id }[] }}
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clientId = new URL(request.url).searchParams.get('client_id');
    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: profiles, error } = await adminClient
      .from('social_profiles')
      .select('id, platform, username, avatar_url, late_account_id')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .order('platform');

    if (error) {
      console.error('List profiles error:', error);
      return NextResponse.json({ error: 'Failed to load profiles' }, { status: 500 });
    }

    return NextResponse.json({ profiles: profiles ?? [] });
  } catch (error) {
    console.error('GET /api/scheduler/profiles error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
