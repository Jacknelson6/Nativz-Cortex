import type { SupabaseClient } from '@supabase/supabase-js';
import { logLifecycleEvent } from '@/lib/lifecycle/state-machine';
import { autoCreateKickoffEvent } from '@/lib/onboarding/auto-create-kickoff';
import { sendFlowStakeholderMilestone } from '@/lib/onboarding/system-emails';

/**
 * Recompute whether all required client-owned intake items in a flow are
 * satisfied and (if so) advance the flow's status to 'completed'.
 *
 * "Satisfied" means status='done' OR dont_have=true (the team has taken
 * over for that platform/item). Agency-owned items don't count toward
 * completion — clients shouldn't be blocked on the team's checklist.
 *
 * Idempotent: returns the new status when a flip happens, otherwise the
 * existing status. Safe to call after every item PATCH.
 *
 * Only flips from 'active' → 'completed'. Flows in awaiting_payment, paused,
 * or needs_proposal stay where they are — those have other gating rules.
 */

export type CompletionResult = {
  status: 'completed' | 'unchanged';
  totalRequired: number;
  satisfied: number;
};

export async function checkAndFlipFlowCompletion(
  admin: SupabaseClient,
  flowId: string,
): Promise<CompletionResult> {
  const { data: flow } = await admin
    .from('onboarding_flows')
    .select('id, status, client_id, completed_at')
    .eq('id', flowId)
    .maybeSingle();
  if (!flow || flow.status === 'completed' || flow.status === 'archived') {
    return { status: 'unchanged', totalRequired: 0, satisfied: 0 };
  }

  const { data: segments } = await admin
    .from('onboarding_flow_segments')
    .select('tracker_id')
    .eq('flow_id', flowId);
  const trackerIds = (segments ?? [])
    .map((s) => s.tracker_id as string | null)
    .filter((id): id is string => !!id);
  if (trackerIds.length === 0) {
    return { status: 'unchanged', totalRequired: 0, satisfied: 0 };
  }

  const { data: groups } = await admin
    .from('onboarding_checklist_groups')
    .select('id')
    .in('tracker_id', trackerIds);
  const groupIds = (groups ?? []).map((g) => g.id);
  if (groupIds.length === 0) {
    return { status: 'unchanged', totalRequired: 0, satisfied: 0 };
  }

  const { data: items } = await admin
    .from('onboarding_checklist_items')
    .select('id, status, required, owner, dont_have')
    .in('group_id', groupIds)
    .eq('owner', 'client')
    .eq('required', true);

  const required = items ?? [];
  const totalRequired = required.length;
  const satisfied = required.filter((it) => it.status === 'done' || it.dont_have).length;

  if (totalRequired === 0 || satisfied < totalRequired) {
    return { status: 'unchanged', totalRequired, satisfied };
  }

  if (flow.status !== 'active') {
    return { status: 'unchanged', totalRequired, satisfied };
  }

  const completedAt = new Date().toISOString();
  await admin
    .from('onboarding_flows')
    .update({ status: 'completed', completed_at: completedAt })
    .eq('id', flowId)
    .eq('status', 'active');

  if (flow.client_id) {
    await logLifecycleEvent(
      flow.client_id as string,
      'onboarding.completed',
      'Onboarding complete — all required intake items satisfied.',
      {
        metadata: { flow_id: flowId, total_required: totalRequired },
        admin,
      },
    );

    // Best-effort: spin up a kickoff scheduling picker now that the client
    // is done. Failure here doesn't unwind the completion — the team can
    // still create one manually from /admin/scheduling.
    await autoCreateKickoffEvent(admin, flowId, flow.client_id as string).catch((err) =>
      console.error('[check-completion] kickoff auto-create failed', err),
    );

    // Email internal stakeholders on `onboarding_flow_stakeholders` who
    // opted into onboarding_complete. The email reads the kickoff picker
    // URL itself, so this fires after auto-create-kickoff so the link
    // exists by the time the email queries for it.
    await sendFlowStakeholderMilestone(admin, flowId, 'onboarding_complete').catch((err) =>
      console.error('[check-completion] stakeholder milestone email failed', err),
    );
  }

  return { status: 'completed', totalRequired, satisfied };
}
