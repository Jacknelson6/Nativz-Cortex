import Link from 'next/link';
import { ArrowRight, CalendarClock, ClipboardList, Rocket } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { StartFlowButton } from './start-flow-button';

/**
 * Compact flow-state card shown at the top of the client info page. Bridges
 * the gap between /admin/clients/[slug] (where you land) and the actual
 * onboarding/scheduling surfaces.
 *
 * Three branches:
 *   1. No live flow             → "Start onboarding" inline action.
 *   2. Live flow, no kickoff    → status + link to /admin/onboarding/[id].
 *   3. Live flow + kickoff      → status + link to /admin/scheduling.
 */

type FlowStatus = 'needs_proposal' | 'awaiting_payment' | 'active' | 'paused' | 'completed' | 'archived';

const STATUS_LABELS: Record<FlowStatus, string> = {
  needs_proposal: 'Needs proposal',
  awaiting_payment: 'Awaiting payment',
  active: 'Intake in progress',
  paused: 'Paused',
  completed: 'Onboarding complete',
  archived: 'Archived',
};

interface FlowRow {
  id: string;
  status: FlowStatus;
}

interface SchedulingEventRow {
  id: string;
  status: 'open' | 'scheduled' | 'canceled' | 'expired';
  share_token: string;
}

export async function ClientFlowStateCard({
  admin,
  clientId,
  clientName,
}: {
  admin: SupabaseClient;
  clientId: string;
  clientName: string;
}) {
  const { data: flow } = await admin
    .from('onboarding_flows')
    .select('id, status')
    .eq('client_id', clientId)
    .not('status', 'in', '(archived)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<FlowRow>();

  if (!flow) {
    return (
      <div className="rounded-xl border border-dashed border-nativz-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-surface ring-1 ring-inset ring-accent/20">
              <Rocket size={15} className="text-accent-text" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">No onboarding flow yet</p>
              <p className="text-xs text-text-muted">
                Start the sales pipeline for {clientName} — proposal, signing, intake.
              </p>
            </div>
          </div>
          <StartFlowButton clientId={clientId} clientName={clientName} />
        </div>
      </div>
    );
  }

  const { data: scheduling } = await admin
    .from('team_scheduling_events')
    .select('id, status, share_token')
    .eq('flow_id', flow.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<SchedulingEventRow>();

  const flowHref = `/admin/onboarding/${flow.id}`;
  const schedulingHref = '/admin/scheduling';
  const isCompleted = flow.status === 'completed';
  const showKickoffRow = !!scheduling;

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-surface ring-1 ring-inset ring-accent/20">
            <ClipboardList size={15} className="text-accent-text" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary">
              Onboarding · {STATUS_LABELS[flow.status]}
            </p>
            <p className="text-xs text-text-muted">
              {isCompleted
                ? 'Intake done — kickoff scheduling is live below.'
                : 'Resume the proposal, intake checklist, and team coordination.'}
            </p>
          </div>
        </div>
        <Link
          href={flowHref}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-nativz-border bg-background px-3 py-1.5 text-xs text-text-primary transition hover:bg-surface-hover"
        >
          Open onboarding
          <ArrowRight size={12} aria-hidden />
        </Link>
      </div>

      {showKickoffRow && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-nativz-border/60 bg-background/50 p-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10">
              <CalendarClock size={13} className="text-accent-text" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-text-primary">
                Kickoff scheduling · {scheduling.status === 'open' ? 'awaiting pick' : scheduling.status}
              </p>
              <p className="text-[11px] text-text-muted">
                Share /schedule/{scheduling.share_token.slice(0, 8)}…
              </p>
            </div>
          </div>
          <Link
            href={schedulingHref}
            className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-text-muted hover:text-text-primary"
          >
            Manage
            <ArrowRight size={11} aria-hidden />
          </Link>
        </div>
      )}
    </div>
  );
}
