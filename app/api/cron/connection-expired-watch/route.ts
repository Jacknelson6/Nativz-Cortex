import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ZernioPostingService } from '@/lib/posting';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/connection-expired-watch
 *
 * Re-probes Zernio's `/accounts/{id}/health` for every `social_profiles`
 * row with a Zernio account id, then persists `token_status` +
 * `token_expires_at` so the Connections matrix reflects reality.
 *
 * Auto-emails were removed 2026-05-07 per Jack — reconnect emails are
 * hand-sent from the matrix. This cron is now probe-only.
 *
 * Auth: Bearer `CRON_SECRET` (Vercel cron header).
 */

function deriveStatus(health: {
  tokenValid: boolean;
  needsRefresh: boolean;
  tokenExpiresAt: string | null;
}): string {
  if (!health.tokenValid) return 'expired';
  if (health.needsRefresh) return 'needs_refresh';
  if (
    health.tokenExpiresAt &&
    new Date(health.tokenExpiresAt).getTime() < Date.now()
  ) {
    return 'expired';
  }
  return 'valid';
}

async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: probeRows, error: probeErr } = await admin
    .from('social_profiles')
    .select('id, late_account_id')
    .not('late_account_id', 'is', null);

  if (probeErr) {
    return NextResponse.json(
      { error: 'db_error', detail: probeErr.message },
      { status: 500 },
    );
  }

  const service = new ZernioPostingService();
  let probed = 0;
  let probeSkipped = 0;
  await Promise.all(
    (probeRows ?? []).map(async (r) => {
      const accountId = r.late_account_id as string | null;
      if (!accountId) {
        probeSkipped += 1;
        return;
      }
      const health = await service.getAccountHealth(accountId);
      if (!health) {
        probeSkipped += 1;
        return;
      }
      const status = deriveStatus(health);
      const { error: updateErr } = await admin
        .from('social_profiles')
        .update({
          token_expires_at: health.tokenExpiresAt,
          token_status: status,
        })
        .eq('id', r.id);
      if (updateErr) {
        probeSkipped += 1;
        return;
      }
      probed += 1;
    }),
  );

  return NextResponse.json({
    probed,
    probeSkipped,
    autoEmail: 'disabled',
  });
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/connection-expired-watch',
    extractRowsProcessed: (body) => {
      if (typeof body !== 'object' || body === null) return undefined;
      const probed = (body as { probed?: number }).probed;
      return typeof probed === 'number' ? probed : undefined;
    },
  },
  handleGet,
);
