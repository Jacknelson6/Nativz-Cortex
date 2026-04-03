import { NextRequest, NextResponse } from 'next/server';
import { runTopicSearchOpsCron } from '@/lib/topic-search/ops-cron';

export const maxDuration = 120;

/**
 * GET /api/cron/topic-search-notify
 *
 * Vercel cron: alert admins on failed topic searches (missed inline notify) and on
 * runs stuck in pending / pending_subtopics / processing past env thresholds.
 *
 * @auth Bearer CRON_SECRET
 * @env TOPIC_SEARCH_STUCK_PROCESSING_MINUTES (default 25)
 * @env TOPIC_SEARCH_STUCK_QUEUE_MINUTES (default 90)
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await runTopicSearchOpsCron();

    return NextResponse.json({
      message: 'Topic search notify pass complete',
      ...result,
    });
  } catch (error) {
    console.error('GET /api/cron/topic-search-notify error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
