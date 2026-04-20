import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ZernioPostingService } from '@/lib/posting';

const querySchema = z.object({
  clientId: z.string().uuid(),
  platform: z.enum(['instagram', 'youtube']),
});

/**
 * GET /api/reporting/demographics?clientId=…&platform=instagram|youtube
 *
 * Pulls demographic breakdowns from Zernio's Instagram / YouTube
 * dedicated endpoints. We resolve the Zernio accountId from our
 * social_profiles row, then proxy to the platform-specific wrapper.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    clientId: searchParams.get('clientId'),
    platform: searchParams.get('platform'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid params', details: parsed.error.flatten() }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from('social_profiles')
    .select('late_account_id')
    .eq('client_id', parsed.data.clientId)
    .eq('platform', parsed.data.platform)
    .not('late_account_id', 'is', null)
    .maybeSingle();

  if (!profile?.late_account_id) {
    return NextResponse.json({ demographics: null, reason: 'not_connected' });
  }

  const zernio = new ZernioPostingService();
  if (parsed.data.platform === 'instagram') {
    const demographics = await zernio.getInstagramDemographics(profile.late_account_id);
    return NextResponse.json({ demographics });
  }
  const demographics = await zernio.getYoutubeDemographics(profile.late_account_id);
  return NextResponse.json({ demographics });
}
