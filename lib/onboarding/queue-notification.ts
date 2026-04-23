/**
 * Enqueue a client event for batched manager notification. Replaces direct
 * `notifyManagers` calls from the public routes so bursts of activity
 * (ticking 5 tasks in 30s) coalesce into one email instead of 5.
 *
 * Mechanism:
 *   - Each tracker has at most one row in onboarding_notification_jobs
 *   - First event inserts the row with scheduled_for = now + BATCH_WINDOW
 *   - Subsequent events within the window append to the same events array
 *   - A cron (`/api/cron/onboarding-notifications`) drains rows where
 *     scheduled_for <= now, sends a batched email per tracker, deletes the row
 *
 * Only non-chatty event kinds queue. item_uncompleted / phase_viewed are
 * still logged to onboarding_events but never trigger notifications.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotifiableEventKind } from '@/lib/onboarding/notify-managers';

// 60s window — long enough to absorb a ticking spree, short enough to feel
// close to real-time. Tune via env if needed later.
export const NOTIFICATION_BATCH_WINDOW_MS = 60_000;

export interface QueuedEvent {
  kind: NotifiableEventKind;
  detail: string;
  at: string; // ISO
}

export async function queueOnboardingNotification(
  admin: SupabaseClient,
  trackerId: string,
  event: { kind: NotifiableEventKind; detail: string },
): Promise<void> {
  const entry: QueuedEvent = {
    kind: event.kind,
    detail: event.detail,
    at: new Date().toISOString(),
  };

  try {
    // Read-then-write upsert. We can't use Postgres' jsonb_concat-on-conflict
    // elegantly via the JS client without RPC, so two queries is fine — both
    // against an indexed primary key.
    const existing = await admin
      .from('onboarding_notification_jobs')
      .select('events')
      .eq('tracker_id', trackerId)
      .maybeSingle();

    const existingEvents = existing?.data
      ? ((existing.data as { events: unknown }).events as QueuedEvent[] | null) ?? []
      : null;

    if (existingEvents === null) {
      // First event for this tracker in the current window — create the row.
      const scheduledFor = new Date(Date.now() + NOTIFICATION_BATCH_WINDOW_MS).toISOString();
      const { error } = await admin.from('onboarding_notification_jobs').insert({
        tracker_id: trackerId,
        events: [entry],
        scheduled_for: scheduledFor,
      });
      if (error) {
        console.error('[queueNotification] insert failed:', error);
      }
    } else {
      // Append to existing. Scheduled_for stays on its original timer so the
      // window doesn't keep sliding forward with every new event.
      const { error } = await admin
        .from('onboarding_notification_jobs')
        .update({ events: [...existingEvents, entry] })
        .eq('tracker_id', trackerId);
      if (error) {
        console.error('[queueNotification] update failed:', error);
      }
    }
  } catch (err) {
    // Never throw — notifications are enhancement, not critical path.
    console.error('[queueNotification] unexpected error:', err);
  }
}
