import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getMetaAuthUrl } from '@/lib/social-auth/meta';
import { getYouTubeAuthUrl } from '@/lib/social-auth/youtube';
import { getTikTokAuthUrl } from '@/lib/social-auth/tiktok';

const platformSchema = z.enum(['instagram', 'facebook', 'tiktok', 'youtube']);

/**
 * GET /api/social/connect/[platform]
 *
 * Initiate a social platform OAuth flow by redirecting to the platform's consent screen.
 * Encodes clientId, platform, and userId into a base64url state param for the callback.
 * Supports instagram, facebook, tiktok, and youtube.
 *
 * @auth Required (any authenticated user)
 * @param platform - 'instagram' | 'facebook' | 'tiktok' | 'youtube'
 * @query clientId - Client UUID to associate the connection with (required)
 * @returns Redirect to platform OAuth consent screen
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  try {
    const { platform } = await params;
    const parsed = platformSchema.safeParse(platform);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }

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

    // Encode state: clientId + platform + userId for the callback
    const state = Buffer.from(
      JSON.stringify({ clientId, platform: parsed.data, userId: user.id }),
    ).toString('base64url');

    let authUrl: string;
    switch (parsed.data) {
      case 'instagram':
      case 'facebook':
        authUrl = getMetaAuthUrl(state);
        break;
      case 'youtube':
        authUrl = getYouTubeAuthUrl(state);
        break;
      case 'tiktok':
        authUrl = getTikTokAuthUrl(state);
        break;
    }

    return NextResponse.redirect(authUrl);
  } catch (err) {
    console.error('[social/connect] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
