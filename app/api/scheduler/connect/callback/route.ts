import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/scheduler/connect/callback
 *
 * OAuth callback from the Late API after a social account connection. Upserts the
 * connected social_profile into the DB and redirects back to the scheduler UI.
 * All parameters are passed as query strings by Late.
 *
 * @auth None (OAuth callback — no session required)
 * @query client_id - Cortex client UUID (required)
 * @query platform - Platform being connected (required)
 * @query connected - Confirmed platform from Late (optional)
 * @query username - Connected account username from Late (optional)
 * @query profileId - Late account ID (optional)
 * @returns Redirect to /admin/scheduler
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id');
    const platform = searchParams.get('platform');
    const connectedPlatform = searchParams.get('connected');
    const username = searchParams.get('username');
    const profileId = searchParams.get('profileId');

    if (!clientId || !platform) {
      return NextResponse.redirect(new URL('/admin/scheduler?error=missing_params', request.url));
    }

    const adminClient = createAdminClient();

    // Late passes account info in callback query params
    if (connectedPlatform && username) {
      await adminClient
        .from('social_profiles')
        .upsert({
          client_id: clientId,
          platform: connectedPlatform,
          platform_user_id: username,
          username: username,
          avatar_url: null,
          late_account_id: profileId ?? null,
          is_active: true,
        }, { onConflict: 'client_id,platform,platform_user_id' });
    }

    return NextResponse.redirect(
      new URL(`/admin/scheduler?connected=${connectedPlatform ?? platform}&client_id=${clientId}`, request.url)
    );
  } catch (error) {
    console.error('GET /api/scheduler/connect/callback error:', error);
    return NextResponse.redirect(new URL('/admin/scheduler?error=connection_failed', request.url));
  }
}
