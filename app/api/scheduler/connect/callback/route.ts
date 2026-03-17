import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyState } from '@/lib/scheduler/oauth-state';

/**
 * GET /api/scheduler/connect/callback
 *
 * OAuth callback from the Late API after a social account connection. Verifies the
 * signed state token, upserts the connected social_profile into the DB, and redirects
 * back to the scheduler UI.
 *
 * @auth None (OAuth callback — no session required, but state token is HMAC-verified)
 * @query state - Signed state token containing client_id and platform (required)
 * @query connected - Confirmed platform from Late (optional)
 * @query username - Connected account username from Late (optional)
 * @query profileId - Late account ID (optional)
 * @returns Redirect to /admin/scheduler
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const stateToken = searchParams.get('state');

    if (!stateToken) {
      return NextResponse.redirect(new URL('/admin/scheduler?error=missing_state', request.url));
    }

    // Verify HMAC signature and extract payload
    let clientId: string;
    let platform: string;
    try {
      const payload = await verifyState(stateToken);
      clientId = payload.client_id;
      platform = payload.platform;
    } catch (err) {
      console.error('OAuth state verification failed:', err);
      return NextResponse.redirect(new URL('/admin/scheduler?error=invalid_state', request.url));
    }

    const connectedPlatform = searchParams.get('connected');
    const username = searchParams.get('username');
    const profileId = searchParams.get('profileId');

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
