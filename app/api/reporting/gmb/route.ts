import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ZernioPostingService } from '@/lib/posting';

const querySchema = z.object({
  clientId: z.string().uuid(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * GET /api/reporting/gmb?clientId=…
 *
 * Unified Google Business Profile analytics: performance metrics
 * (views, calls, directions, website clicks) + top search keywords.
 * Returns { connected: false } when the client has no GMB account
 * linked to Zernio yet, so the UI can render a connect CTA.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    clientId: searchParams.get('clientId'),
    start: searchParams.get('start') ?? undefined,
    end: searchParams.get('end') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid params', details: parsed.error.flatten() }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from('social_profiles')
    .select('late_account_id')
    .eq('client_id', parsed.data.clientId)
    .eq('platform', 'googlebusiness')
    .not('late_account_id', 'is', null)
    .maybeSingle();

  if (!profile?.late_account_id) {
    return NextResponse.json({ connected: false });
  }

  const zernio = new ZernioPostingService();
  const [performance, keywords] = await Promise.all([
    zernio.getGoogleBusinessPerformance(profile.late_account_id, parsed.data.start, parsed.data.end),
    zernio.getGoogleBusinessSearchKeywords(profile.late_account_id, parsed.data.start, parsed.data.end),
  ]);

  return NextResponse.json({ connected: true, performance, keywords });
}
