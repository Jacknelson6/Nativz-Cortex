import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyState } from '@/lib/scheduler/oauth-state';

/**
 * GET /api/scheduler/connect/callback
 *
 * OAuth callback from Zernio after a social account connection. Verifies the
 * signed state token, reads the connected account details from query params
 * (standard flow: Zernio appends ?connected={platform}&accountId=Y&username=Z),
 * upserts the social_profile into the DB, and redirects back to the scheduler UI.
 *
 * @auth None (OAuth callback — no session required, but state token is HMAC-verified)
 * @query state - Signed state token containing client_id and platform (required)
 * @query connected - Platform name from Zernio (e.g. instagram, tiktok)
 * @query accountId - Zernio account ID for the connected account
 * @query username - Connected account username
 * @query profileId - Zernio profile ID (echoed back)
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

    // Zernio standard flow appends: ?connected={platform}&accountId=Y&username=Z&profileId=X
    const connectedPlatform = searchParams.get('connected');
    const username = searchParams.get('username');
    const accountId = searchParams.get('accountId');
    // Legacy: older Zernio versions may pass profileId instead of accountId
    const legacyProfileId = searchParams.get('profileId');

    const adminClient = createAdminClient();

    if (connectedPlatform && (username || accountId)) {
      const zernioAccountId = accountId ?? legacyProfileId ?? null;

      await adminClient
        .from('social_profiles')
        .upsert({
          client_id: clientId,
          platform: connectedPlatform,
          platform_user_id: username || accountId || '',
          username: username || '',
          avatar_url: null,
          late_account_id: zernioAccountId,
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
