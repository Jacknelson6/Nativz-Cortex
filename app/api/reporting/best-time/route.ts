import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ZernioPostingService } from '@/lib/posting';
import type { SocialPlatform } from '@/lib/posting/types';

const querySchema = z.object({
  clientId: z.string().uuid().optional(),
  platform: z.enum(['facebook', 'instagram', 'tiktok', 'youtube', 'linkedin']).optional(),
});

/**
 * GET /api/reporting/best-time
 *
 * Proxies /v1/analytics/best-time — day-of-week × hour engagement slots
 * ranked by avg_engagement. When clientId is supplied we resolve its
 * Zernio profileId so Zernio can scope the aggregation to that client.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    clientId: searchParams.get('clientId') ?? undefined,
    platform: searchParams.get('platform') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid params', details: parsed.error.flatten() }, { status: 400 });
  }

  let profileId: string | undefined;
  if (parsed.data.clientId) {
    const { data: client } = await supabase
      .from('clients')
      .select('late_profile_id')
      .eq('id', parsed.data.clientId)
      .single();
    profileId = client?.late_profile_id ?? undefined;
  }

  const zernio = new ZernioPostingService();
  const slots = await zernio.getBestTime({
    platform: parsed.data.platform as SocialPlatform | undefined,
    profileId,
  });

  return NextResponse.json({ slots });
}
