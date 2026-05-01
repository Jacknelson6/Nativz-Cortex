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
 * POST /api/public/connection-invites/[token]/connect/[platform]
 *
 * Public Zernio OAuth kickoff for the self-serve invite flow. The
 * invite page POSTs here per platform. We resolve the invite ⇒ client,
 * make sure a Zernio profile exists, sign a state token (with the
 * invite token embedded so the callback can mark completion + fire
 * notify hooks), and return the platform's hosted consent URL.
 *
 * Mirrors the slug-based variant in
 * `/api/public/clients/[slug]/connect/[platform]` but scopes the
 * platform list to whatever the invite asked for.
 */

const ZernioPlatform = z.enum(['tiktok', 'instagram', 'facebook', 'youtube']);

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ token: string; platform: string }> },
) {
  try {
    const { token, platform: rawPlatform } = await ctx.params;
    if (!token || token.length > 64) {
      return NextResponse.json({ error: 'invalid token' }, { status: 404 });
    }

    const platformParse = ZernioPlatform.safeParse(rawPlatform);
    if (!platformParse.success) {
      return NextResponse.json(
        {
          error:
            'Zernio does not support this platform yet. Please reach out to the team.',
        },
        { status: 400 },
      );
    }
    const platform = platformParse.data;

    const admin = createAdminClient();
    const { data: invite } = await admin
      .from('connection_invites')
      .select('id, client_id, platforms, expires_at')
      .eq('token', token)
      .maybeSingle();
    if (!invite) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    if (
      invite.expires_at &&
      new Date(invite.expires_at as string).getTime() < Date.now()
    ) {
      return NextResponse.json({ error: 'expired' }, { status: 410 });
    }
    const askedFor = (invite.platforms as string[]) ?? [];
    if (!askedFor.includes(platform)) {
      return NextResponse.json(
        { error: 'platform not in invite' },
        { status: 400 },
      );
    }

    const { data: client } = await admin
      .from('clients')
      .select('id, name')
      .eq('id', invite.client_id)
      .maybeSingle();
    if (!client) {
      return NextResponse.json({ error: 'client not found' }, { status: 404 });
    }

    const profileId = await ensureZernioProfile(
      admin,
      client.id as string,
      (client.name as string) ?? 'Client',
    );

    const stateToken = await signState({
      client_id: client.id as string,
      platform,
      ts: Date.now(),
      invite_token: token,
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
  } catch (err) {
    console.error(
      'POST /api/public/connection-invites/[token]/connect/[platform] error:',
      err,
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'failed to start connection' },
      { status: 500 },
    );
  }
}
