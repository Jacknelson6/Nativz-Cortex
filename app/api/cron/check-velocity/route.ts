import { NextRequest, NextResponse } from 'next/server';
import { checkPostVelocity } from '@/lib/reporting/velocity';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';

export const maxDuration = 120;

/**
 * GET /api/cron/check-velocity
 *
 * Vercel cron job: check post velocity for published posts and flag any with
 * unusual engagement patterns as trending. Requires CRON_SECRET bearer token.
 *
 * @auth Bearer CRON_SECRET (Vercel cron)
 * @returns {{ message: string, checked: number, trending: number }}
 */
async function handleGet(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await checkPostVelocity();

    return NextResponse.json({
      message: `Checked ${result.checked} posts, ${result.trending} trending`,
      ...result,
    });
  } catch (error) {
    console.error('GET /api/cron/check-velocity error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export const GET = withCronTelemetry({ route: '/api/cron/check-velocity' }, handleGet);
