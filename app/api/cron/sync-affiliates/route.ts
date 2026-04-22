import { NextRequest, NextResponse } from 'next/server';
import { syncAllAffiliateClients } from '@/lib/uppromote/sync';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';

export const maxDuration = 60;

/**
 * GET /api/cron/sync-affiliates (Vercel cron)
 * POST /api/cron/sync-affiliates (manual trigger from admin UI)
 *
 * Sync affiliate data from UpPromote for all clients with a configured API key.
 * Auth: accepts either CRON_SECRET bearer token (Vercel cron) or admin session (manual trigger).
 *
 * @auth Bearer CRON_SECRET or admin session cookie
 * @returns {{ success: true, synced: number, ... }}
 */
async function handler(request: NextRequest) {
  try {
    // Auth: accept CRON_SECRET (for Vercel cron) or admin session (for manual UI trigger)
    const cronSecret = process.env.CRON_SECRET;
    const hasCronAuth = cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`;

    if (!hasCronAuth) {
      const supabase = await createServerSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const admin = createAdminClient();
      const { data: userData } = await admin.from('users').select('role').eq('id', user.id).single();
      if (!userData || userData.role !== 'admin') {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
      }
    }

    const result = await syncAllAffiliateClients();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('/api/cron/sync-affiliates error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

// GET for Vercel crons, POST for manual triggers
export const GET = withCronTelemetry({ route: '/api/cron/sync-affiliates' }, handler);
export const POST = withCronTelemetry({ route: '/api/cron/sync-affiliates' }, handler);
