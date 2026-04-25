import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { queueOnboardingNotification } from '@/lib/onboarding/queue-notification';
import { recomputePhaseStatuses } from '@/lib/onboarding/recompute-phase-statuses';
import { bumpPocActivityForTracker } from '@/lib/onboarding/poc-activity';

export const dynamic = 'force-dynamic';

/**
 * POST /api/onboarding/public/item-toggle
 *
 * Client-facing, share-token-gated write endpoint. Lets a client on the
 * public onboarding page flip their OWN checklist items between pending
 * and done. The endpoint:
 *
 *   1. Validates the share_token is a UUID and points to an active tracker
 *      (not templates, not archived).
 *   2. Fetches the target item + its group and confirms the group actually
 *      belongs to this tracker — a malicious client can't flip items on
 *      another tracker just because they guessed the UUID.
 *   3. Refuses the write if the item's owner is 'agency' — those are
 *      things the agency marks done, not the client.
 *   4. Writes the status change plus an onboarding_events row that records
 *      what was flipped (task snapshot + timestamp + 'client' actor).
 *
 * Uses the service-role admin client because the public page has no auth
 * session. Every client-originated mutation goes through this one guarded
 * chokepoint. Failure responses are terse on purpose — we don't help a
 * probing attacker distinguish "bad token" from "item doesn't exist".
 */
const Body = z.object({
  share_token: z.string().uuid(),
  item_id: z.string().uuid(),
  done: z.boolean(),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    const { share_token, item_id, done } = parsed.data;

    const admin = createAdminClient();

    // 1. Share token → tracker
    const { data: tracker } = await admin
      .from('onboarding_trackers')
      .select('id, status, is_template, service, notify_emails, clients!inner(name, slug)')
      .eq('share_token', share_token)
      .maybeSingle();
    if (!tracker || tracker.is_template || tracker.status === 'archived') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // 2. Item → group → tracker match; owner must be client
    const { data: item } = await admin
      .from('onboarding_checklist_items')
      .select('id, task, owner, group_id, status, onboarding_checklist_groups!inner(tracker_id)')
      .eq('id', item_id)
      .maybeSingle();
    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    // Supabase types the joined row as array sometimes.
    const groupTracker = (item as { onboarding_checklist_groups: { tracker_id: string } | { tracker_id: string }[] }).onboarding_checklist_groups;
    const trackerIdForGroup = Array.isArray(groupTracker) ? groupTracker[0]?.tracker_id : groupTracker?.tracker_id;
    if (trackerIdForGroup !== tracker.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (item.owner !== 'client') {
      return NextResponse.json({ error: 'This task is handled by the agency.' }, { status: 403 });
    }

    // 3. Idempotent: if it's already in the target state, don't re-write.
    const target: 'done' | 'pending' = done ? 'done' : 'pending';
    if (item.status === target) {
      return NextResponse.json({ ok: true, already: true });
    }

    // 4. Update + event log in parallel for speed. The event capture carries
    // the task name so the admin feed shows a useful line even if the item
    // is later renamed or deleted.
    const [updateRes] = await Promise.all([
      admin.from('onboarding_checklist_items').update({ status: target }).eq('id', item_id),
      admin.from('onboarding_events').insert({
        tracker_id: tracker.id,
        kind: done ? 'item_completed' : 'item_uncompleted',
        item_id,
        metadata: { task: item.task },
        actor: 'client',
      }),
    ]);
    if (updateRes.error) {
      console.error('public item-toggle update error:', updateRes.error);
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }

    // Queue a batched notification on completion only. Un-ticks stay silent.
    // The cron at /api/cron/onboarding-notifications drains the queue every
    // minute — multiple completions inside that window ship as one email.
    if (target === 'done') {
      await queueOnboardingNotification(admin, tracker.id, {
        kind: 'item_completed',
        detail: item.task,
      });
    }

    // Re-bucket phase statuses based on the new overall progress. Runs on
    // both done and pending flips so unchecking an item demotes phases too.
    await recomputePhaseStatuses(admin, tracker.id);

    // Bump the parent flow's POC activity cursor so reminder/no-progress
    // crons reset. No-op for legacy trackers not attached to a flow.
    await bumpPocActivityForTracker(admin, tracker.id);

    return NextResponse.json({ ok: true, status: target });
  } catch (error) {
    console.error('POST /api/onboarding/public/item-toggle error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
