import { NextRequest, NextResponse } from 'next/server';
import { syncAllAffiliateClients } from '@/lib/uppromote/sync';

export const maxDuration = 60;

/**
 * GET /api/cron/sync-affiliates (Vercel cron)
 * POST /api/cron/sync-affiliates (manual trigger)
 *
 * Sync affiliate data from UpPromote for all clients with a configured API key.
 * Requires CRON_SECRET bearer token if set; otherwise allows unauthenticated access.
 *
 * @auth Bearer CRON_SECRET (optional — if CRON_SECRET env var is set)
 * @returns {{ success: true, synced: number, failed: number, ... }}
 */
async function handler(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
export const GET = handler;
export const POST = handler;
