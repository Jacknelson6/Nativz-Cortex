import type { createAdminClient } from '@/lib/supabase/admin';
import { looksLikeTimeout, verifyAndReconcilePost } from '@/lib/calendar/verify-post';

type AdminClient = ReturnType<typeof createAdminClient>;

export type PartialFailureLeg = {
  platform: string;
  username: string | null;
  reason: string;
};

export type SendPartialFailureFn = (
  adminClient: AdminClient,
  post: Record<string, unknown>,
  failures: PartialFailureLeg[],
) => Promise<void>;

/**
 * Guard wrapper around `sendPartialFailureNotification` that prevents the two
 * recurring notification-spam patterns observed in production:
 *
 *   1. Duplicate notifications from parallel cron workers.
 *      Two Vercel cron ticks can fire back-to-back (a slow tick lingers,
 *      the next tick starts before it commits the post update). Both can
 *      then re-claim the same row and both terminal-fail it. The CAS on
 *      `updated_at` prevents simultaneous reads but not sequential ones.
 *      We dedup by stamping `scheduled_posts.failure_notification_sent_at`
 *      atomically with the notify call. If the column is already set,
 *      this is a no-op.
 *
 *   2. False-positive timeout notifications.
 *      Zernio's publishPost wait-window can lapse before a slow platform
 *      (LinkedIn especially) confirms acceptance. The leg gets marked
 *      `failed` with "Publishing timed out during platform API call. The
 *      post may have been published externally." but the platform actually
 *      did publish. The cron's RECONCILE TIMEOUT FALSE-FAILS sweep catches
 *      these — but it runs AFTER the notify call, so the team gets paged
 *      first and the row gets reconciled silently 30s later. We invert
 *      that order here: when every failure reason in this batch matches a
 *      timeout pattern, run the reconcile first; if it flips the post
 *      back to 'published' (or the failures clear), suppress the page.
 *
 * On reconcile we re-fetch the latest spp + post state to decide whether
 * any failures remain — if everything reconciled to 'published', the parent
 * status changes to 'published' and there's nothing left to alert on.
 *
 * Always pass through to the real notify fn for non-timeout failures or when
 * reconcile leaves real failures behind. The cron's `sendPartialFailureNotification`
 * is private to that route file, so it's threaded in as a callback.
 */
export async function notifyPartialFailureGuarded(
  adminClient: AdminClient,
  post: Record<string, unknown>,
  failures: PartialFailureLeg[],
  sendNotification: SendPartialFailureFn,
): Promise<void> {
  if (failures.length === 0) return;
  const postId = post.id as string;
  if (!postId) return;

  // Dedup: short-circuit if a notification already fired for this terminal
  // failure transition. Cleared on the next successful publish.
  const { data: dedupRow } = await adminClient
    .from('scheduled_posts')
    .select('failure_notification_sent_at')
    .eq('id', postId)
    .maybeSingle();
  const alreadyNotified = (dedupRow as { failure_notification_sent_at: string | null } | null)
    ?.failure_notification_sent_at;
  if (alreadyNotified) {
    console.log(
      `[notify-partial-failure] suppressing duplicate for ${postId} (already notified at ${alreadyNotified})`,
    );
    return;
  }

  // If every failure reason matches a Zernio timeout pattern, try to
  // reconcile against Zernio's authoritative post state before paging.
  // Real failures (auth, content rejected, etc.) skip this path and notify
  // immediately.
  const allLookLikeTimeout = failures.every((f) => looksLikeTimeout(f.reason));
  if (allLookLikeTimeout) {
    try {
      const result = await verifyAndReconcilePost(adminClient, postId);
      if (result.reconciledPlatforms > 0) {
        console.log(
          `[notify-partial-failure] reconciled ${result.reconciledPlatforms} timeout(s) on ${postId} before notify; new status=${result.newPostStatus}`,
        );
      }
    } catch (err) {
      console.error(`[notify-partial-failure] reconcile attempt failed for ${postId}:`, err);
    }

    // Re-derive the failure list from the freshest spp state. If reconcile
    // flipped every leg to 'published' (or the post itself is now
    // 'published'), suppress the notification entirely.
    const { data: refreshedPost } = await adminClient
      .from('scheduled_posts')
      .select('status, failure_notification_sent_at')
      .eq('id', postId)
      .maybeSingle();
    const refreshedStatus = (refreshedPost as { status: string } | null)?.status;
    if (refreshedStatus === 'published') {
      console.log(
        `[notify-partial-failure] suppressing — ${postId} reconciled to 'published'`,
      );
      return;
    }
    if (
      (refreshedPost as { failure_notification_sent_at: string | null } | null)
        ?.failure_notification_sent_at
    ) {
      // A parallel worker beat us to the dedup stamp between our two reads.
      console.log(
        `[notify-partial-failure] suppressing — ${postId} stamped by parallel worker`,
      );
      return;
    }

    const { data: spp } = await adminClient
      .from('scheduled_post_platforms')
      .select(
        'status, failure_reason, social_profiles!inner(platform, username)',
      )
      .eq('post_id', postId);
    type SppShape = {
      status: string;
      failure_reason: string | null;
      social_profiles: { platform: string; username: string | null } | null;
    };
    const refreshedFailures: PartialFailureLeg[] = ((spp ?? []) as unknown as SppShape[])
      .filter((r) => r.status === 'failed')
      .map((r) => ({
        platform: r.social_profiles?.platform ?? 'unknown',
        username: r.social_profiles?.username ?? null,
        reason: r.failure_reason ?? 'unknown error',
      }));
    if (refreshedFailures.length === 0) {
      console.log(
        `[notify-partial-failure] suppressing — ${postId} has no failed legs after reconcile`,
      );
      return;
    }
    failures = refreshedFailures;
  }

  // Stamp the dedup column FIRST so a parallel worker's dedup check sees us.
  // If the stamp fails (DB error), still try to notify — duplicate is the
  // lesser evil to silence.
  const stampedAt = new Date().toISOString();
  const { error: stampErr } = await adminClient
    .from('scheduled_posts')
    .update({ failure_notification_sent_at: stampedAt })
    .eq('id', postId)
    .is('failure_notification_sent_at', null);
  if (stampErr) {
    console.error(
      `[notify-partial-failure] failed to stamp dedup column for ${postId}:`,
      stampErr,
    );
  }

  await sendNotification(adminClient, post, failures);
}
