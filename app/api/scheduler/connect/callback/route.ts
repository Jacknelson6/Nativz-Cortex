import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyState } from '@/lib/scheduler/oauth-state';
import { getZernioApiBase, getZernioApiKey } from '@/lib/posting';
import { handleInviteCompletion } from '@/lib/scheduler/invite-completion';

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
    let inviteToken: string | undefined;
    try {
      const payload = await verifyState(stateToken);
      clientId = payload.client_id;
      platform = payload.platform;
      inviteToken = payload.invite_token;
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

    // Zernio's OAuth redirect sometimes omits accountId/username — fall back
    // to a /v1/accounts lookup so we always persist the right late_account_id
    // instead of silently dropping the connection on our side.
    let resolvedAccountId: string | null = accountId ?? legacyProfileId ?? null;
    let resolvedUsername: string | null = username ?? null;
    let resolvedPlatform: string | null = connectedPlatform;

    if (!resolvedAccountId || !resolvedPlatform) {
      try {
        const { data: client } = await adminClient
          .from('clients')
          .select('late_profile_id')
          .eq('id', clientId)
          .single();

        if (client?.late_profile_id) {
          const res = await fetch(`${getZernioApiBase()}/accounts`, {
            headers: { Authorization: `Bearer ${getZernioApiKey()}` },
          });
          if (res.ok) {
            const body = (await res.json()) as {
              accounts?: Array<{
                _id?: string;
                platform?: string;
                username?: string;
                profileId?: { _id?: string } | string;
                createdAt?: string;
              }>;
            };
            const candidates = (body.accounts ?? [])
              .filter((a) => {
                const pid = typeof a.profileId === 'string' ? a.profileId : a.profileId?._id;
                return pid === client.late_profile_id;
              })
              .filter((a) => (platform ? a.platform === platform : true))
              .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

            const newest = candidates[0];
            if (newest?._id) {
              resolvedAccountId = newest._id;
              resolvedUsername = newest.username ?? resolvedUsername;
              resolvedPlatform = newest.platform ?? resolvedPlatform ?? platform;
            }
          }
        }
      } catch (err) {
        console.error('callback /accounts fallback failed:', err);
      }
    }

    if (resolvedPlatform && resolvedAccountId) {
      await adminClient
        .from('social_profiles')
        .upsert(
          {
            client_id: clientId,
            platform: resolvedPlatform,
            platform_user_id: resolvedUsername || resolvedAccountId,
            username: resolvedUsername ?? '',
            avatar_url: null,
            late_account_id: resolvedAccountId,
            is_active: true,
            disconnect_alerted_at: null,
          },
          { onConflict: 'client_id,platform,platform_user_id' },
        );
    }

    if (inviteToken && resolvedPlatform) {
      try {
        await handleInviteCompletion({
          admin: adminClient,
          inviteToken,
          clientId,
          platform: resolvedPlatform,
          username: resolvedUsername,
        });
      } catch (err) {
        console.error('[connect/callback] invite completion failed:', err);
      }
      return NextResponse.redirect(
        new URL(
          `/connect/invite/${inviteToken}?ok=1&platform=${resolvedPlatform}`,
          request.url,
        ),
      );
    }

    return NextResponse.redirect(
      new URL(`/admin/scheduler?connected=${connectedPlatform ?? platform}&client_id=${clientId}`, request.url)
    );
  } catch (error) {
    console.error('GET /api/scheduler/connect/callback error:', error);
    return NextResponse.redirect(new URL('/admin/scheduler?error=connection_failed', request.url));
  }
}
