import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ZernioPostingService } from '@/lib/posting';

const querySchema = z.object({ clientId: z.string().uuid() });

/**
 * GET /api/reporting/tiktok-creator-info?clientId=…
 *
 * Surfaces TikTok creator-level signals (verification, canPostMore,
 * allowed privacy levels) for the platform badge / publishing UI.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({ clientId: searchParams.get('clientId') });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from('social_profiles')
    .select('late_account_id')
    .eq('client_id', parsed.data.clientId)
    .eq('platform', 'tiktok')
    .not('late_account_id', 'is', null)
    .maybeSingle();

  if (!profile?.late_account_id) return NextResponse.json({ connected: false });

  const zernio = new ZernioPostingService();
  const info = await zernio.getTikTokCreatorInfo(profile.late_account_id);
  return NextResponse.json({ connected: true, info });
}
