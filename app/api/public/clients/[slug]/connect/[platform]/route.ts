import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPostingService } from '@/lib/posting';
import { signState } from '@/lib/scheduler/oauth-state';
import { ensureZernioProfile } from '@/lib/onboarding/ensure-zernio-profile';
import type { SocialPlatform } from '@/lib/posting/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/public/clients/[slug]/connect/[platform]
 *
 * Slug-based public Zernio OAuth kickoff. Powers the "Send connection
 * links" modal on the Connections matrix: an admin copies a stable URL
 * like `https://cortex.nativz.io/connect/{slug}/tiktok` and forwards
 * it to the client. When the client clicks, the landing page POSTs
 * here, we mint a fresh Zernio auth URL, and the page redirects them
 * to the platform's hosted consent screen.
 *
 * No tracker / share_token / login required - we identify the client
 * purely by slug. The risk profile is identical to the existing
 * onboarding/public/connect endpoint (anyone with the link can connect
 * an account), and the worst case is a wrong account being attached,
 * which the agency notices in the matrix and disconnects.
 *
 * Mirrors `/api/onboarding/public/connect` for the OAuth state token
 * + callback path so no changes are needed downstream.
 */

const Platform = z.enum(['tiktok', 'instagram', 'facebook', 'youtube']);

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ slug: string; platform: string }> },
) {
  try {
    const { slug, platform: rawPlatform } = await ctx.params;
    const parsed = Platform.safeParse(rawPlatform);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 });
    }
    const platform = parsed.data;

    if (!slug || slug.length > 100) {
      return NextResponse.json({ error: 'Invalid client' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: client } = await admin
      .from('clients')
      .select('id, name')
      .eq('slug', slug)
      .maybeSingle();
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Ensure a Zernio profile exists. ensureZernioProfile is idempotent;
    // if the profile already exists it just reads the id off `clients`.
    const profileId = await ensureZernioProfile(admin, client.id, client.name);

    const stateToken = await signState({
      client_id: client.id,
      platform,
      ts: Date.now(),
    });

    const reqUrl = new URL(request.url);
    const originFromRequest = `${reqUrl.protocol}//${reqUrl.host}`;
    const origin =
      originFromRequest ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'https://cortex.nativz.io';
    const callbackUrl = `${origin.replace(/\/$/, '')}/api/scheduler/connect/callback?state=${stateToken}`;

    const service = getPostingService();
    const result = await service.connectProfile({
      platform: platform as SocialPlatform,
      callbackUrl,
      profileId,
    });

    return NextResponse.json({ authUrl: result.authorizationUrl });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : 'Failed to start connection';
    console.error('POST /api/public/clients/[slug]/connect/[platform] error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
