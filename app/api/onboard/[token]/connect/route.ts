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
 * POST /api/onboard/[token]/connect
 *
 * Flow-token-gated Zernio OAuth kickoff for the new blueprint-based intake
 * form. Mirror of /api/onboarding/public/connect (which uses legacy tracker
 * tokens) — this one resolves the share_token against onboarding_flows.
 *
 * On account.connected webhook, the existing autoTickOnboardingForConnection
 * helper ticks the matching checklist item (extended in this PR to also
 * match by item.data.platform for blueprint items).
 */

const Body = z.object({
  platform: z.enum(['tiktok', 'instagram', 'facebook', 'youtube']),
  itemId: z.string().uuid().optional(),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await ctx.params;
    if (!UUID_RE.test(token)) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    const { platform } = parsed.data;

    const admin = createAdminClient();

    const { data: flow } = await admin
      .from('onboarding_flows')
      .select('id, client_id, status, clients!inner(id, name)')
      .eq('share_token', token)
      .maybeSingle();
    if (!flow || flow.status === 'archived' || !flow.client_id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const clientsField = (flow as { clients: unknown }).clients;
    const client = Array.isArray(clientsField)
      ? (clientsField[0] as { id: string; name: string } | undefined)
      : (clientsField as { id: string; name: string } | null);
    if (!client) {
      return NextResponse.json({ error: 'Client missing' }, { status: 404 });
    }

    const profileId = await ensureZernioProfile(admin, client.id, client.name);

    const service = getPostingService();
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
    const result = await service.connectProfile({
      platform: platform as SocialPlatform,
      callbackUrl,
      profileId,
    });

    await admin
      .from('onboarding_flows')
      .update({ last_poc_activity_at: new Date().toISOString() })
      .eq('id', flow.id);

    return NextResponse.json({ authUrl: result.authorizationUrl });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to start connection';
    console.error('[onboard:connect] error', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
