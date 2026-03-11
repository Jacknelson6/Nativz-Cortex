import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  exchangeMetaCode,
  getMetaPages,
  getFacebookPageProfile,
  getInstagramProfile,
} from '@/lib/social-auth/meta';
import { exchangeYouTubeCode } from '@/lib/social-auth/youtube';
import { exchangeTikTokCode } from '@/lib/social-auth/tiktok';
import type { OAuthResult } from '@/lib/social-auth/types';

const platformSchema = z.enum(['instagram', 'facebook', 'tiktok', 'youtube']);

interface StatePayload {
  clientId: string;
  platform: string;
  userId: string;
}

/**
 * GET /api/social/callback/[platform]?code=xxx&state=xxx
 * OAuth callback — exchanges code for tokens, upserts social_profiles.
 * Redirects back to the client settings page on completion.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  try {
    const { platform } = await params;
    const parsed = platformSchema.safeParse(platform);
    if (!parsed.success) {
      return NextResponse.redirect(`${appUrl}/admin/clients?error=invalid_platform`);
    }

    const code = request.nextUrl.searchParams.get('code');
    const stateParam = request.nextUrl.searchParams.get('state');

    if (!code || !stateParam) {
      return NextResponse.redirect(`${appUrl}/admin/clients?error=missing_params`);
    }

    // Decode state
    let state: StatePayload;
    try {
      state = JSON.parse(Buffer.from(stateParam, 'base64url').toString());
    } catch {
      return NextResponse.redirect(`${appUrl}/admin/clients?error=invalid_state`);
    }

    const admin = createAdminClient();

    // Look up client slug for redirect
    const { data: client } = await admin
      .from('clients')
      .select('slug')
      .eq('id', state.clientId)
      .single();

    const redirectBase = client?.slug
      ? `${appUrl}/admin/clients/${client.slug}`
      : `${appUrl}/admin/clients`;

    switch (parsed.data) {
      case 'instagram':
      case 'facebook': {
        // Meta flow: code → long-lived token → pages → save per page/IG account
        const longLivedToken = await exchangeMetaCode(code);
        const pages = await getMetaPages(longLivedToken);

        if (pages.length === 0) {
          return NextResponse.redirect(`${redirectBase}?error=no_pages_found`);
        }

        for (const page of pages) {
          // Save Facebook page profile
          if (parsed.data === 'facebook' || page.instagram_business_account) {
            const fbResult = await getFacebookPageProfile(page.id, page.access_token);
            await upsertProfile(admin, {
              clientId: state.clientId,
              platform: 'facebook',
              result: fbResult,
              pageAccessToken: page.access_token,
              pageId: page.id,
            });
          }

          // Save Instagram business account if linked
          if (page.instagram_business_account) {
            const igResult = await getInstagramProfile(
              page.instagram_business_account.id,
              page.access_token,
            );
            await upsertProfile(admin, {
              clientId: state.clientId,
              platform: 'instagram',
              result: igResult,
              pageAccessToken: page.access_token,
              pageId: page.instagram_business_account.id,
            });
          }
        }
        break;
      }

      case 'youtube': {
        const result = await exchangeYouTubeCode(code);
        await upsertProfile(admin, {
          clientId: state.clientId,
          platform: 'youtube',
          result,
        });
        break;
      }

      case 'tiktok': {
        const result = await exchangeTikTokCode(code);
        await upsertProfile(admin, {
          clientId: state.clientId,
          platform: 'tiktok',
          result,
        });
        break;
      }
    }

    return NextResponse.redirect(`${redirectBase}?connected=${parsed.data}`);
  } catch (err) {
    console.error('[social/callback] Error:', err);
    return NextResponse.redirect(
      `${appUrl}/admin/clients?error=oauth_failed&message=${encodeURIComponent(
        err instanceof Error ? err.message : 'Unknown error',
      )}`,
    );
  }
}

/** Upsert a social profile with tokens */
async function upsertProfile(
  admin: ReturnType<typeof createAdminClient>,
  opts: {
    clientId: string;
    platform: string;
    result: OAuthResult;
    pageAccessToken?: string;
    pageId?: string;
  },
) {
  const { clientId, platform, result, pageAccessToken, pageId } = opts;

  const { error } = await admin.from('social_profiles').upsert(
    {
      client_id: clientId,
      platform,
      platform_user_id: result.profile.platformUserId,
      username: result.profile.username,
      avatar_url: result.profile.avatarUrl ?? null,
      access_token: result.tokens.accessToken,
      refresh_token: result.tokens.refreshToken ?? null,
      token_expires_at: result.tokens.expiresAt?.toISOString() ?? null,
      page_access_token: pageAccessToken ?? result.tokens.pageAccessToken ?? null,
      page_id: pageId ?? result.tokens.pageId ?? null,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'platform,platform_user_id' },
  );

  if (error) {
    console.error(`[social/callback] Failed to upsert ${platform} profile:`, error);
    throw new Error(`Failed to save ${platform} profile`);
  }
}
