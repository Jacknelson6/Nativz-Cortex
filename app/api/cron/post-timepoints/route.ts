// ZNA-06: cron - sample per-post timepoints, classify trajectories,
// retention-cleanup. Runs every 30 min via vercel.json.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runTrajectorySampler } from '@/lib/analytics/trajectory-sampler';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';

export const maxDuration = 300;

/**
 * GET /api/cron/post-timepoints
 *
 * Walks post_metrics for the last 30 days, captures timepoints on the
 * 1h/6h/24h/48h/72h/daily cadence, classifies each post's trajectory,
 * and prunes timepoints older than 30 days.
 *
 * @auth Bearer CRON_SECRET (Vercel cron)
 */
async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  try {
    const result = await runTrajectorySampler({ supabase: admin });
    return NextResponse.json({
      scanned: result.scanned,
      sampled: result.sampled,
      classified: result.classified,
      expired_rows_deleted: result.expiredDeleted,
      duration_ms: result.durationMs,
      failures: result.failures,
    });
  } catch (err) {
    console.error('[zna-06] cron failed', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/post-timepoints',
    extractRowsProcessed: (body) => {
      if (body && typeof body === 'object' && 'classified' in body) {
        const n = (body as { classified?: unknown }).classified;
        return typeof n === 'number' ? n : undefined;
      }
      return undefined;
    },
  },
  handleGet,
);
