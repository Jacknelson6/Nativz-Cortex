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
  } catch (err) {
    // Never throw — phase status is enhancement, not critical path.
    console.error('[recomputePhaseStatuses] failed:', err);
  }
}
