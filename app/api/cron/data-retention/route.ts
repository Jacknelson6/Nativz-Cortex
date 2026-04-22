import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';

export const maxDuration = 60;

/**
 * GET /api/cron/data-retention
 *
 * Vercel cron job: enforce data retention policies (SOC 2 P3.2).
 * - Activity logs older than 1 year -> deleted
 * - Completed topic searches older than 2 years -> deleted
 * - Expired invite tokens -> deleted
 * - Read notifications older than 90 days -> deleted
 *
 * @auth Bearer CRON_SECRET (mandatory)
 * @returns {{ message: string, deleted: Record<string, number> }}
 */
async function handleGet(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const now = new Date();

    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const twoYearsAgo = new Date(now);
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // 1. Activity logs older than 1 year
    const { data: activityData, error: activityError } = await adminClient
      .from('activity_log')
      .delete()
      .lt('created_at', oneYearAgo.toISOString())
      .select('id');

    if (activityError) {
      console.error('[cron/data-retention] activity_log cleanup error:', activityError);
    }

    // 2. Completed topic searches older than 2 years
    const { data: searchData, error: searchError } = await adminClient
      .from('topic_searches')
      .delete()
      .eq('status', 'completed')
      .lt('created_at', twoYearsAgo.toISOString())
      .select('id');

    if (searchError) {
      console.error('[cron/data-retention] topic_searches cleanup error:', searchError);
    }

    // 3. Expired invite tokens
    const { data: tokenData, error: tokenError } = await adminClient
      .from('invite_tokens')
      .delete()
      .lt('expires_at', now.toISOString())
      .select('id');

    if (tokenError) {
      console.error('[cron/data-retention] invite_tokens cleanup error:', tokenError);
    }

    // 4. Read notifications older than 90 days
    const { data: notifData, error: notifError } = await adminClient
      .from('notifications')
      .delete()
      .eq('is_read', true)
      .lt('created_at', ninetyDaysAgo.toISOString())
      .select('id');

    if (notifError) {
      console.error('[cron/data-retention] notifications cleanup error:', notifError);
    }

    const deleted = {
      activity_log: activityData?.length ?? 0,
      topic_searches: searchData?.length ?? 0,
      invite_tokens: tokenData?.length ?? 0,
      notifications: notifData?.length ?? 0,
    };

    const total = Object.values(deleted).reduce((sum, n) => sum + n, 0);

    console.log(`[cron/data-retention] completed: ${total} rows deleted`, deleted);

    return NextResponse.json({
      message: `Data retention cleanup complete: ${total} rows deleted`,
      deleted,
    });
  } catch (error) {
    console.error('GET /api/cron/data-retention error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export const GET = withCronTelemetry({ route: '/api/cron/data-retention' }, handleGet);
