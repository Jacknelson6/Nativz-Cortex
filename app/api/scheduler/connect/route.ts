import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPostingService } from '@/lib/posting';
import { z } from 'zod';
import type { SocialPlatform } from '@/lib/posting/types';
import { signState } from '@/lib/scheduler/oauth-state';
import { ensureZernioProfile } from '@/lib/zernio/ensure-profile';

const ConnectSchema = z.object({
  platform: z.enum(['facebook', 'instagram', 'tiktok', 'youtube']),
  client_id: z.string().uuid(),
});

// Zernio profile creation is centralised in lib/zernio/ensure-profile.ts,
// used by this route plus the public client + connection-invite connect
// routes.

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

    const profileId = await ensureZernioProfile(
      adminClient,
      parsed.data.client_id,
      clientRow?.name ?? 'Client',
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
