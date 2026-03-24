import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPostingService, getZernioApiBase, getZernioApiKey } from '@/lib/posting';
import { z } from 'zod';
import type { SocialPlatform } from '@/lib/posting/types';
import { signState } from '@/lib/scheduler/oauth-state';

const ConnectSchema = z.object({
  platform: z.enum(['facebook', 'instagram', 'tiktok', 'youtube']),
  client_id: z.string().uuid(),
});

/** Create a Zernio profile for a client if one doesn't exist yet (stored as late_profile_id). */
async function ensureLateProfile(clientId: string, clientName: string): Promise<string> {
  const adminClient = createAdminClient();

  // Check if client already has a Zernio/Late profile id
  const { data: client } = await adminClient
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
  const lateProfileId = body.profile?._id ?? body.profile?.id;
  if (!lateProfileId) {
    throw new Error('Zernio create profile: missing profile id in response');
  }

  // Save it to our DB
  await adminClient
    .from('clients')
    .update({ late_profile_id: lateProfileId })
    .eq('id', clientId);

  return lateProfileId;
}

/**
 * POST /api/scheduler/connect
 *
 * Initiate Zernio OAuth to connect a social account for a client. Creates a Zernio profile
 * (stored as late_profile_id) if missing, then returns authUrl to redirect the user.
 *
 * @auth Required (any authenticated user)
 * @body platform - 'facebook' | 'instagram' | 'tiktok' | 'youtube' (required)
 * @body client_id - Client UUID (required)
 * @returns {{ authUrl: string }}
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = ConnectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    // Get client name for Late profile
    const adminClient = createAdminClient();
    const { data: clientRow } = await adminClient
      .from('clients')
      .select('name')
      .eq('id', parsed.data.client_id)
      .single();

    const profileId = await ensureLateProfile(
      parsed.data.client_id,
      clientRow?.name ?? 'Client'
    );

    const service = getPostingService();
    const stateToken = await signState({
      client_id: parsed.data.client_id,
      platform: parsed.data.platform,
      ts: Date.now(),
    });
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/scheduler/connect/callback?state=${stateToken}`;
    const result = await service.connectProfile({
      platform: parsed.data.platform as SocialPlatform,
      callbackUrl,
      profileId,
    });

    return NextResponse.json({ authUrl: result.authorizationUrl });
  } catch (error) {
    console.error('POST /api/scheduler/connect error:', error);
    return NextResponse.json({ error: 'Failed to start connection' }, { status: 500 });
  }
}
