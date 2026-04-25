/**
 * Auto-advance phase statuses based on overall checklist progress.
 *
 * The schema doesn't link groups to phases, so "phase X is done when its
 * items are done" isn't possible. Instead, we bucket overall progress
 * evenly across phases: with K phases, phase N is "done" once progress
 * crosses (N+1)/K, "in_progress" once it crosses N/K, and "not_started"
 * below that.
 *
 * Example with 5 phases:
 *   0% → all not_started
 *   20% → phase 1 done; phases 2-5 not_started
 *   45% → phases 1-2 done; phase 3 in_progress; rest not_started
 *   100% → all phases done
 *
 * Only UPDATEs phases whose status actually changed, to minimise writes.
 * Safe to call on every item tick — idempotent when nothing changes.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

type PhaseStatus = 'not_started' | 'in_progress' | 'done';

export async function recomputePhaseStatuses(
  admin: SupabaseClient,
  trackerId: string,
): Promise<void> {
  try {
    // Items (for progress) + phases (ordered) in parallel
    const [itemsRes, phasesRes] = await Promise.all([
      admin
        .from('onboarding_checklist_items')
        .select('status, onboarding_checklist_groups!inner(tracker_id)')
        .eq('onboarding_checklist_groups.tracker_id', trackerId),
      admin
        .from('onboarding_phases')
        .select('id, status, sort_order')
        .eq('tracker_id', trackerId)
        .order('sort_order', { ascending: true }),
    ]);

    const items = (itemsRes.data ?? []) as { status: 'pending' | 'done' }[];
    const phases = (phasesRes.data ?? []) as { id: string; status: PhaseStatus; sort_order: number }[];

    if (phases.length === 0) return;

    const total = items.length;
    const done = items.filter((it) => it.status === 'done').length;
    const pct = total === 0 ? 0 : done / total;

    const updates: Promise<unknown>[] = [];

    phases.forEach((phase, idx) => {
      const lower = idx / phases.length;
      const upper = (idx + 1) / phases.length;

      let next: PhaseStatus;
      if (pct >= upper) next = 'done';
      else if (pct > lower) next = 'in_progress';
      else next = 'not_started';

      if (next !== phase.status) {
        // Supabase filter builders are thenable, wrap in Promise.resolve so
        // TS sees a proper Promise for Promise.all.
        updates.push(
          Promise.resolve(admin.from('onboarding_phases').update({ status: next }).eq('id', phase.id)),
        );
      }
    });

    if (updates.length > 0) {
      await Promise.all(updates);
    }

    // Roll the segment + flow forward off the same progress signal.
    await recomputeFlowSegmentStatus(admin, trackerId, pct).catch((err) => {
      console.error('[recomputePhaseStatuses] flow segment update failed:', err);
    });
  } catch (err) {
    // Never throw — phase status is enhancement, not critical path.
    console.error('[recomputePhaseStatuses] failed:', err);
  }
}

/**
 * If this tracker is attached to an onboarding flow as a segment, mark
 * the segment 'in_progress' (>0% done) or 'done' (100% done) accordingly.
 * Fires stakeholder segment_completed milestone on the 0→done transition.
 * If every non-archived segment in the flow is 'done', flips the flow
 * itself to 'completed' and fires the onboarding_complete milestone.
 */
async function recomputeFlowSegmentStatus(
  admin: SupabaseClient,
  trackerId: string,
  pct: number,
): Promise<void> {
  const { data: seg } = await admin
    .from('onboarding_flow_segments')
    .select('id, kind, flow_id, status')
    .eq('tracker_id', trackerId)
    .maybeSingle();
  if (!seg) return;

  type Seg = { id: string; kind: string; flow_id: string; status: 'pending' | 'in_progress' | 'done' };
  const s = seg as Seg;
  const next: Seg['status'] = pct >= 1 ? 'done' : pct > 0 ? 'in_progress' : 'pending';

  if (next === s.status) return;

  const patch: Record<string, unknown> = { status: next };
  if (next === 'in_progress' && !s.status.includes('in_progress')) {
    patch.started_at = new Date().toISOString();
  }
  if (next === 'done') {
    patch.completed_at = new Date().toISOString();
  }

  await admin.from('onboarding_flow_segments').update(patch).eq('id', s.id);

  if (next === 'done') {
    // Fire stakeholder milestone (best-effort).
    try {
      const { sendFlowStakeholderMilestone } = await import('@/lib/onboarding/system-emails');
      await sendFlowStakeholderMilestone(admin, s.flow_id, 'segment_completed', {
        segmentKind: s.kind as never,
      });
    } catch (err) {
      console.error('[recomputePhaseStatuses] segment milestone fire failed:', err);
    }

    // Flow rollup: if every segment is now done, complete the flow.
    const { data: siblings } = await admin
      .from('onboarding_flow_segments')
      .select('status')
      .eq('flow_id', s.flow_id);
    const allDone = ((siblings ?? []) as Array<{ status: string }>).every((r) => r.status === 'done');
    if (allDone) {
      const nowIso = new Date().toISOString();
      await admin
        .from('onboarding_flows')
        .update({ status: 'completed', completed_at: nowIso })
        .eq('id', s.flow_id);
      try {
        const { sendFlowStakeholderMilestone } = await import('@/lib/onboarding/system-emails');
        await sendFlowStakeholderMilestone(admin, s.flow_id, 'onboarding_complete');
      } catch (err) {
        console.error('[recomputePhaseStatuses] onboarding-complete milestone fire failed:', err);
      }
    }
  }
}
