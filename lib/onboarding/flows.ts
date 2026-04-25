import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Flow domain types + thin server utilities. The schema is in migration
 * 162_onboarding_flows.sql. UI components import the types from here so
 * server actions and REST routes stay in sync.
 */

export type FlowStatus =
  | 'needs_proposal'
  | 'awaiting_payment'
  | 'active'
  | 'paused'
  | 'completed'
  | 'archived';

export type SegmentKind = 'agreement_payment' | 'social' | 'paid_media' | 'web';

export const SEGMENT_KIND_LABEL: Record<SegmentKind, string> = {
  agreement_payment: 'Agreement & Payment',
  social: 'Social',
  paid_media: 'Paid Media',
  web: 'Web',
};

export type Flow = {
  id: string;
  client_id: string;
  status: FlowStatus;
  proposal_id: string | null;
  share_token: string;
  poc_emails: string[];
  toast_dismissed_at: string | null;
  last_poc_activity_at: string | null;
  last_reminder_sent_at: string | null;
  last_no_progress_flag_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type AdminClient = SupabaseClient;

/**
 * Create a flow for a client if one isn't already live. The unique partial
 * index on (client_id) WHERE status NOT IN ('archived','completed') means
 * a second insert returns a unique-violation; we surface that as 'exists'
 * so callers can resolve the existing flow id without a separate read.
 */
export async function createFlowForClient(opts: {
  clientId: string;
  createdBy: string;
  admin?: AdminClient;
}): Promise<{ ok: true; flow: Flow; existing: boolean } | { ok: false; error: string }> {
  const admin = opts.admin ?? createAdminClient();

  const { data: existing } = await admin
    .from('onboarding_flows')
    .select('*')
    .eq('client_id', opts.clientId)
    .not('status', 'in', '(archived,completed)')
    .maybeSingle();

  if (existing) {
    return { ok: true, flow: existing as Flow, existing: true };
  }

  const { data: created, error } = await admin
    .from('onboarding_flows')
    .insert({
      client_id: opts.clientId,
      status: 'needs_proposal',
      created_by: opts.createdBy,
    })
    .select('*')
    .single();
  if (error || !created) {
    return { ok: false, error: error?.message ?? 'insert failed' };
  }

  // Always-first segment: Agreement & Payment, virtual (no tracker row).
  await admin.from('onboarding_flow_segments').insert({
    flow_id: created.id,
    kind: 'agreement_payment',
    tracker_id: null,
    position: 0,
    status: 'pending',
  });

  return { ok: true, flow: created as Flow, existing: false };
}

/**
 * Idempotent flow ensure-or-link. Used by the public sign endpoint to
 * guarantee a flow exists for the proposal's client_id and that the flow
 * is linked to the proposal. Three branches:
 *
 *   1. A live flow exists AND already references this proposal → no-op.
 *   2. A live flow exists but doesn't reference this proposal → patch
 *      `proposal_id` and bump status to `desiredStatus` (defaults to the
 *      flow's current status — caller decides if a transition is wanted).
 *   3. No live flow exists → create one with the desired status, link
 *      proposal_id, scaffold the always-first agreement_payment segment.
 *
 * Returns the resolved flow row in every case.
 */
export async function ensureFlowForClient(opts: {
  clientId: string;
  proposalId: string | null;
  desiredStatus?: FlowStatus;
  createdBy: string | null;
  admin?: AdminClient;
}): Promise<{ ok: true; flow: Flow; created: boolean } | { ok: false; error: string }> {
  const admin = opts.admin ?? createAdminClient();

  const { data: existing } = await admin
    .from('onboarding_flows')
    .select('*')
    .eq('client_id', opts.clientId)
    .not('status', 'in', '(archived,completed)')
    .maybeSingle();

  if (existing) {
    const patch: Partial<Flow> = {};
    if (opts.proposalId && existing.proposal_id !== opts.proposalId) {
      patch.proposal_id = opts.proposalId;
    }
    if (opts.desiredStatus && existing.status !== opts.desiredStatus) {
      patch.status = opts.desiredStatus;
    }
    if (Object.keys(patch).length === 0) {
      return { ok: true, flow: existing as Flow, created: false };
    }
    const { data: updated, error: updErr } = await admin
      .from('onboarding_flows')
      .update(patch)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (updErr || !updated) {
      return { ok: false, error: updErr?.message ?? 'flow update failed' };
    }
    return { ok: true, flow: updated as Flow, created: false };
  }

  const { data: created, error } = await admin
    .from('onboarding_flows')
    .insert({
      client_id: opts.clientId,
      status: opts.desiredStatus ?? 'awaiting_payment',
      proposal_id: opts.proposalId,
      created_by: opts.createdBy,
    })
    .select('*')
    .single();
  if (error || !created) {
    return { ok: false, error: error?.message ?? 'flow insert failed' };
  }

  await admin.from('onboarding_flow_segments').insert({
    flow_id: created.id,
    kind: 'agreement_payment',
    tracker_id: null,
    position: 0,
    // Sign-time path means the agreement is already signed — segment
    // tracker pulls live state from the proposal_events trail.
    status: opts.desiredStatus === 'awaiting_payment' ? 'in_progress' : 'pending',
  });

  return { ok: true, flow: created as Flow, created: true };
}

/**
 * Persistent "Start onboarding" toasts the active admin should still see.
 * Fires whenever a flow they created is in `needs_proposal` status and
 * hasn't been dismissed. Closing it just sets toast_dismissed_at — the
 * flow itself stays live in the roster.
 */
export async function getPendingFlowToastsForUser(
  userId: string,
  admin?: AdminClient,
): Promise<
  Array<{
    flow_id: string;
    client_id: string;
    client_name: string;
    client_slug: string;
    client_logo: string | null;
    created_at: string;
  }>
> {
  const a = admin ?? createAdminClient();
  const { data } = await a
    .from('onboarding_flows')
    .select('id, client_id, created_at, clients!inner(name, slug, logo_url)')
    .eq('created_by', userId)
    .eq('status', 'needs_proposal')
    .is('toast_dismissed_at', null)
    .order('created_at', { ascending: false });

  type Row = {
    id: string;
    client_id: string;
    created_at: string;
    clients:
      | { name: string; slug: string; logo_url: string | null }
      | Array<{ name: string; slug: string; logo_url: string | null }>;
  };
  return ((data as Row[] | null) ?? []).map((r) => {
    const c = Array.isArray(r.clients) ? r.clients[0] : r.clients;
    return {
      flow_id: r.id,
      client_id: r.client_id,
      client_name: c?.name ?? 'Unknown brand',
      client_slug: c?.slug ?? '',
      client_logo: c?.logo_url ?? null,
      created_at: r.created_at,
    };
  });
}
