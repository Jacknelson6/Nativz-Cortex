import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ZernioPostingService } from '@/lib/posting';
import type { SocialPlatform } from '@/lib/posting/types';

const querySchema = z.object({
  clientId: z.string().uuid().optional(),
  platform: z.enum(['facebook', 'instagram', 'tiktok', 'youtube', 'linkedin']).optional(),
  source: z.enum(['all', 'late', 'external']).optional(),
});

/**
 * GET /api/reporting/content-decay
 *
 * Proxies /v1/analytics/content-decay — returns engagement-accumulation
 * buckets (0-6h, 6-12h, 12-24h, 1-2d, 2-7d, 7d+) so the UI can show
 * how fast posts reach their final engagement.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    clientId: searchParams.get('clientId') ?? undefined,
    platform: searchParams.get('platform') ?? undefined,
    source: searchParams.get('source') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid params', details: parsed.error.flatten() }, { status: 400 });
  }

  // Resolve clientId → Zernio profileId to scope the query when provided.
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
  const buckets = await zernio.getContentDecay({
    platform: parsed.data.platform as SocialPlatform | undefined,
    profileId,
    source: parsed.data.source,
  });

  return NextResponse.json({ buckets });
}
