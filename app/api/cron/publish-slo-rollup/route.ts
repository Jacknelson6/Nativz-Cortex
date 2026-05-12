import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import { computeSloBuckets, upsertSloRows } from '@/lib/ops/publish-slo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/publish-slo-rollup
 *
 * Nightly rollup that snapshots the previous 30 days of publish-pipeline
 * SLO data into `publish_slo_daily`. The SLO: every scheduled post
 * publishes within 5 minutes of its `scheduled_at`. Each row records
 * total / in-window / late / failed / stuck counts for one
 * Chicago-local day.
 *
 * We re-snapshot the trailing 30 days (not just yesterday) so that
 * late-arriving status flips — a post that gets manually republished
 * Wednesday afternoon for a Monday slot — are reflected in the
 * historical bucket. Upsert on `day` keeps the table idempotent across
 * re-runs.
 */

const LOOKBACK_DAYS = 30;
// Pad the UTC window so days near a DST boundary don't drop rows whose
// scheduled_at fell on the Chicago side of midnight but the UTC side of
// the next day. 36h on each end is overkill but free.
const PAD_HOURS = 36;

async function handleGet(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const fromIso = new Date(now - (LOOKBACK_DAYS * 24 + PAD_HOURS) * 60 * 60 * 1000).toISOString();
  const toIso = new Date(now + PAD_HOURS * 60 * 60 * 1000).toISOString();

  const buckets = await computeSloBuckets(admin, fromIso, toIso);
  const rowsUpserted = await upsertSloRows(admin, buckets);

  return NextResponse.json({
    ok: true,
    rowsUpserted,
    daysCovered: buckets.size,
    fromIso,
    toIso,
  });
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/publish-slo-rollup',
    extractRowsProcessed: (body) => {
      if (typeof body !== 'object' || body === null) return undefined;
      const b = body as { rowsUpserted?: number };
      return b.rowsUpserted;
    },
    extractMetadata: (body) => {
      if (typeof body !== 'object' || body === null) return undefined;
      const b = body as { daysCovered?: number };
      return { daysCovered: b.daysCovered };
    },
  },
  handleGet,
);
