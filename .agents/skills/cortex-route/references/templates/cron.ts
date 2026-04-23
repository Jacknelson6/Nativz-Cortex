import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 120;

// Remember to register this cron in vercel.json:
// {
//   "crons": [
//     { "path": "/api/cron/TODO-path", "schedule": "*/5 * * * *" }
//   ]
// }

/**
 * GET /api/cron/TODO-path
 *
 * Vercel cron job: TODO: Describe what this cron does and its schedule.
 * Requires CRON_SECRET bearer token.
 *
 * @auth Bearer CRON_SECRET (Vercel cron)
 * @returns {{ message: string }}
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // TODO: Your cron business logic here
    // No user context available — use adminClient for all queries
    // const { data, error } = await adminClient
    //   .from('table')
    //   .select('*')
    //   .eq('status', 'pending');

    return NextResponse.json({ message: 'Cron completed', processed: 0 });
  } catch (error) {
    console.error('GET /api/cron/TODO-path error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
