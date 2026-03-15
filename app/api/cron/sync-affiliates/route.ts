import { NextRequest, NextResponse } from 'next/server';
import { syncAllAffiliateClients } from '@/lib/uppromote/sync';

export const maxDuration = 60;

async function handler(request: NextRequest) {
  try {
    // Optional CRON_SECRET check
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = request.headers.get('authorization');
      if (auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
export const GET = handler;
export const POST = handler;
