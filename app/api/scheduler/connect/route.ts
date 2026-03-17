import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPostingService } from '@/lib/posting';
import { z } from 'zod';
import type { SocialPlatform } from '@/lib/posting/types';
import { signState } from '@/lib/scheduler/oauth-state';

const LATE_API_BASE = 'https://getlate.dev/api/v1';

const ConnectSchema = z.object({
  platform: z.enum(['facebook', 'instagram', 'tiktok', 'youtube']),
  client_id: z.string().uuid(),
});

/** Create a Late profile for a client if one doesn't exist yet */
async function ensureLateProfile(clientId: string, clientName: string): Promise<string> {
  const adminClient = createAdminClient();

  // Check if client already has a Late profile
  const { data: client } = await adminClient
    .from('clients')
    .select('late_profile_id')
    .eq('id', clientId)
    .single();

  if (client?.late_profile_id) return client.late_profile_id;

  // Create a new profile in Late
  const res = await fetch(`${LATE_API_BASE}/profiles`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.LATE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: clientName }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create Late profile: ${await res.text()}`);
  }

  const { profile } = await res.json();
  const lateProfileId = profile._id;

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
 * Initiate a Late API social account connection for a client. Creates a Late profile
 * for the client if one doesn't exist yet, then returns an authorization URL to redirect
 * the user to for platform OAuth.
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
