import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPostingService, getZernioApiBase, getZernioApiKey } from '@/lib/posting';
import { signState } from '@/lib/scheduler/oauth-state';
import type { SocialPlatform } from '@/lib/posting/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/onboarding/public/connect
 *
 * Share-token-gated kickoff for Zernio's hosted OAuth flow. Lets a client
 * on the public /onboarding/[slug] page connect their TikTok / Instagram /
 * Facebook / YouTube in one click — no admin login, no OAuth chrome on our
 * side. Zernio hosts the auth page; we just generate the URL and hand it over.
 *
 * Flow:
 *   1. Validate share token → fetch tracker → get client_id
 *   2. ensureLateProfile() — creates a Zernio profile for the client if
 *      none exists, stores id on clients.late_profile_id
 *   3. Sign an OAuth state token with {client_id, platform} so the
 *      existing /api/scheduler/connect/callback picks up where we left off
 *   4. Call Zernio's hosted connect endpoint → receive authorizationUrl
 *   5. Return { authUrl } to the client which opens it (usually in a new tab)
 *
 * The `account.connected` webhook back to /api/scheduler/webhooks is what
 * ticks off the matching checklist item + fires the manager notification —
 * see the extended handler in that route.
 *
 * Intentionally mirrors /api/scheduler/connect logic so the OAuth state
 * token + callback path stay compatible; the only real differences here are
 * the auth gate (share token instead of admin session) and the platform
 * allowlist being narrower.
 */
const Body = z.object({
  share_token: z.string().uuid(),
  platform: z.enum(['tiktok', 'instagram', 'facebook', 'youtube']),
});

async function ensureLateProfile(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  clientName: string,
): Promise<string> {
  const { data: client } = await admin
    .from('clients')
    .select('late_profile_id')
    .eq('id', clientId)
    .single();

  if (client?.late_profile_id) return client.late_profile_id;

  const res = await fetch(`${getZernioApiBase()}/profiles`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getZernioApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: clientName }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create Zernio profile: ${await res.text()}`);
  }
  const body = (await res.json()) as { profile?: { _id?: string; id?: string } };
  const profileId = body.profile?._id ?? body.profile?.id;
  if (!profileId) {
    throw new Error('Zernio create profile: missing profile id in response');
  }

  await admin.from('clients').update({ late_profile_id: profileId }).eq('id', clientId);
  return profileId;
}

export async function POST(request: NextRequest) {
  try {
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    const { share_token, platform } = parsed.data;

    const admin = createAdminClient();

    // Tracker gate: must be a real (non-template) tracker, not archived.
    const { data: tracker } = await admin
      .from('onboarding_trackers')
      .select('id, client_id, status, is_template, clients!inner(id, name, slug)')
      .eq('share_token', share_token)
      .maybeSingle();
    if (!tracker || tracker.is_template || tracker.status === 'archived' || !tracker.client_id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const clientsField = (tracker as { clients: unknown }).clients;
    const client = Array.isArray(clientsField)
      ? (clientsField[0] as { id: string; name: string; slug: string } | undefined)
      : (clientsField as { id: string; name: string; slug: string } | null);
    if (!client) {
      return NextResponse.json({ error: 'Client missing' }, { status: 404 });
    }

    // Make sure there's a Zernio profile for this client.
    const profileId = await ensureLateProfile(admin, client.id, client.name);

    // Sign the same OAuth state token shape the admin connect route uses
    // so the callback doesn't need any changes.
    const service = getPostingService();
    const stateToken = await signState({
      client_id: client.id,
      platform,
      ts: Date.now(),
    });
    // Derive the origin from the request first, falling back to env
    // (NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_SITE_URL). The request-origin path
    // makes this robust in previews + any reverse-proxy setup where a static
    // env var might be wrong.
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

    return NextResponse.json({ authUrl: result.authorizationUrl });
  } catch (error) {
    // Surface the underlying message to the UI so admins debugging in
    // console see the specific Zernio error instead of a generic 500.
    const msg = error instanceof Error ? error.message : 'Failed to start connection';
    console.error('POST /api/onboarding/public/connect error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
