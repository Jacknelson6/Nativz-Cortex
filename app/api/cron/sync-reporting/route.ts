import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncClientReporting } from '@/lib/reporting/sync';
import { generateAnalyticsNotifications } from '@/lib/reporting/notifications';
import { notifyAdmins } from '@/lib/notifications';
import type { DateRange } from '@/lib/types/reporting';

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Query ALL active clients — sync those with social profiles,
    // but also track clients without profiles for pipeline alerts
    const { data: allClients, error: allClientsError } = await adminClient
      .from('clients')
      .select('id, name, is_active')
      .eq('is_active', true);

    if (allClientsError) {
      console.error('Cron sync-reporting query error:', allClientsError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    if (!allClients?.length) {
      return NextResponse.json({
        message: 'No active clients',
        synced: 0,
        failed: 0,
        notifications: 0,
      });
    }

    // Get clients that actually have social profiles
    const { data: clientsWithProfiles } = await adminClient
      .from('clients')
      .select('id, name, social_profiles!inner(id)')
      .eq('is_active', true);

    const profileClientIds = new Set(
      (clientsWithProfiles ?? []).map((c) => c.id),
    );

    const today = new Date().toISOString().split('T')[0];

    let syncedCount = 0;
    let failedCount = 0;
    let totalNotifications = 0;

    // Sync analytics for clients with social profiles
    for (const client of allClients) {
      if (!profileClientIds.has(client.id)) continue;

      // Check if this client has any existing snapshots
      // If not, do a 90-day backfill. Otherwise, sync last 7 days.
      const { count: snapshotCount } = await adminClient
        .from('platform_snapshots')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client.id);

      const lookbackDays = (snapshotCount ?? 0) === 0 ? 90 : 7;
      const dateRange: DateRange = {
        start: new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        end: today,
      };

      try {
        const result = await syncClientReporting(client.id, dateRange);

        if (result.synced) {
          syncedCount++;
          console.log(
            `[sync-reporting] ${client.name}: synced ${result.platforms.length} platforms, ${result.postsCount} posts`,
          );

          // Generate notifications for this client's metrics
          try {
            const notifCount = await generateAnalyticsNotifications(
              client.id,
              client.name,
            );
            totalNotifications += notifCount;
            if (notifCount > 0) {
              console.log(
                `[sync-reporting] ${client.name}: generated ${notifCount} notifications`,
              );
            }
          } catch (notifErr) {
            console.error(
              `[sync-reporting] ${client.name} notification generation failed:`,
              notifErr,
            );
          }
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

          // Notify admins about sync errors
          await notifyAdmins({
            type: 'sync_failed',
            title: `Sync issue for ${client.name}`,
            body: result.errors.join('; ').substring(0, 200),
            linkPath: `/admin/analytics?client=${client.id}`,
          });
          totalNotifications++;
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
      message: `Processed ${allClients.length} clients`,
      synced: syncedCount,
      failed: failedCount,
      notifications: totalNotifications,
    });
  } catch (error) {
    console.error('GET /api/cron/sync-reporting error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
