import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncTodoist } from '@/lib/todoist/sync';
import { createNotification } from '@/lib/notifications';

// Debounce: skip sync if last sync was less than 60s ago
const SYNC_COOLDOWN_MS = 60_000;

/**
 * POST /api/todoist/sync
 *
 * Trigger a full bidirectional sync between Todoist and Cortex tasks for the authenticated user.
 * Auto-sync mode (auto=true) skips the sync if the user was synced within the last 60 seconds.
 * Sends a notification if the sync encounters errors.
 *
 * @auth Required (any authenticated user; must have Todoist connected)
 * @query auto - If 'true', skip sync if last sync was less than 60 seconds ago (default: false)
 * @returns {{ pulled: number, pushed: number, errors: string[], skipped?: boolean }}
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data } = await admin
      .from('users')
      .select('todoist_api_key, todoist_project_id, todoist_synced_at')
      .eq('id', user.id)
      .single();

    if (!data?.todoist_api_key) {
      return NextResponse.json({ error: 'Todoist not connected' }, { status: 400 });
    }

    // Auto-sync mode: skip if synced recently
    const isAuto = new URL(request.url).searchParams.get('auto') === 'true';
    if (isAuto && data.todoist_synced_at) {
      const lastSync = new Date(data.todoist_synced_at).getTime();
      if (Date.now() - lastSync < SYNC_COOLDOWN_MS) {
        return NextResponse.json({ skipped: true, pulled: 0, pushed: 0, errors: [] });
      }
    }

    const result = await syncTodoist(
      user.id,
      data.todoist_api_key,
      data.todoist_project_id ?? undefined,
    );

    // Notify the user if sync had errors
    if (result.errors.length > 0) {
      await createNotification({
        userId: user.id,
        type: 'sync_failed',
        title: 'Todoist sync issue',
        body: result.errors.join('; ').substring(0, 200),
        linkPath: '/admin/tasks',
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('POST /api/todoist/sync error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
