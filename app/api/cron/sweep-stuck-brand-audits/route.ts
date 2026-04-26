import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';

export const maxDuration = 30;

const STUCK_TTL_MINUTES = 10;

/**
 * GET /api/cron/sweep-stuck-brand-audits
 *
 * Marks `brand_audits` rows still in `status = 'running'` past the TTL as
 * `'failed'`. Covers the case where the inline run engine exceeded the
 * function's 300s ceiling (or the host process died mid-run) and left the
 * row referenceable but never reconciled. Without this sweeper the detail
 * page would poll forever.
 *
 * @auth Bearer CRON_SECRET (mandatory)
 */
async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STUCK_TTL_MINUTES * 60 * 1000).toISOString();

  const { data: stale, error: selectErr } = await admin
    .from('brand_audits')
    .select('id')
    .eq('status', 'running')
    .lt('created_at', cutoff);

  if (selectErr) {
    console.error('[cron/sweep-stuck-brand-audits] select error:', selectErr);
    return NextResponse.json({ error: selectErr.message }, { status: 500 });
  }

  if (!stale || stale.length === 0) {
    return NextResponse.json({ swept: 0 });
  }

  const ids = stale.map((r) => (r as { id: string }).id);
  const { error: updateErr } = await admin
    .from('brand_audits')
    .update({
      status: 'failed',
      error_message: `Audit timed out — exceeded ${STUCK_TTL_MINUTES} min wall time.`,
      completed_at: new Date().toISOString(),
    })
    .in('id', ids);

  if (updateErr) {
    console.error('[cron/sweep-stuck-brand-audits] update error:', updateErr);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ swept: ids.length, cutoff });
}

export const GET = withCronTelemetry(
  { route: '/api/cron/sweep-stuck-brand-audits' },
  handleGet,
);
