import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncClientReporting } from '@/lib/reporting/sync';
import type { DateRange } from '@/lib/types/reporting';

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Query active clients that have at least one social profile
    const { data: clients, error: clientsError } = await adminClient
      .from('clients')
      .select('id, name, social_profiles!inner(id)')
      .eq('is_active', true);

    if (clientsError) {
      console.error('Cron sync-reporting query error:', clientsError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    if (!clients?.length) {
      return NextResponse.json({
        message: 'No active clients with social profiles',
        synced: 0,
        failed: 0,
      });
    }

    // Default date range: last 7 days
    const dateRange: DateRange = {
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0],
      end: new Date().toISOString().split('T')[0],
    };

    let syncedCount = 0;
    let failedCount = 0;

    for (const client of clients) {
      try {
        const result = await syncClientReporting(client.id, dateRange);

        if (result.synced) {
          syncedCount++;
          console.log(
            `[sync-reporting] ${client.name}: synced ${result.platforms.length} platforms, ${result.postsCount} posts`,
          );
        } else {
          failedCount++;
          console.warn(
            `[sync-reporting] ${client.name}: sync returned no platforms`,
            result.errors,
          );
        }

        if (result.errors.length > 0) {
          console.warn(
            `[sync-reporting] ${client.name} errors:`,
            result.errors,
          );
        }
      } catch (err) {
        failedCount++;
        console.error(
          `[sync-reporting] ${client.name} (${client.id}) failed:`,
          err,
        );
      }
    }

    return NextResponse.json({
      message: `Processed ${clients.length} clients`,
      synced: syncedCount,
      failed: failedCount,
    });
  } catch (error) {
    console.error('GET /api/cron/sync-reporting error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
