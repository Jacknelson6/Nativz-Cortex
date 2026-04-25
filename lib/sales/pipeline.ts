import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { FlowStatus } from '@/lib/onboarding/flows';

/**
 * Unified sales-pipeline read model. Joins `clients`, the latest non-archived
 * `proposals` row, and the live `onboarding_flows` row per client into a
 * single shape the `/admin/sales` UI consumes.
 *
 * V1 keeps the join in TypeScript — the per-page row count is bounded by
 * total clients the agency has touched (proposals are 1:N per client; we
 * pick the latest). If/when this hits hundreds of brands per agency,
 * promote to a Postgres view or materialized view keyed on `clients.id`.
 *
 * Status priority (highest = primary pill on the row):
 *   archived > completed/active > paid > awaiting_payment > viewed > sent > drafted > none
 *
 * The "primary status" is purely a display concern — the underlying
 * proposal + flow rows still expose their own statuses for the per-row
 * detail (proposal: drafted/sent/viewed/signed/paid; flow: needs_proposal/
 * awaiting_payment/active/etc.).
 */

export type ProposalStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'signed'
  | 'paid'
  | 'expired'
  | 'canceled';

export type SalesRowProposal = {
  id: string;
  slug: string;
  title: string;
  status: ProposalStatus;
  agency: 'anderson' | 'nativz' | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  paid_at: string | null;
  created_at: string;
};

export type SalesRowFlow = {
  id: string;
  status: FlowStatus;
  started_at: string | null;
  completed_at: string | null;
  share_token: string;
  created_at: string;
};

export type SalesPipelineRow = {
  client: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    agency: string | null;
    lifecycle_state: string | null;
    auto_created_from_proposal_id: string | null;
  };
  latest_proposal: SalesRowProposal | null;
  flow: SalesRowFlow | null;
  /** Single primary status pill the roster renders. */
  primary_status: PrimaryStatus;
  /** Most recent activity timestamp across proposal + flow. */
  last_activity_at: string | null;
};

export type PrimaryStatus =
  | 'drafted'
  | 'sent'
  | 'viewed'
  | 'signed'
  | 'awaiting_payment'
  | 'paid'
  | 'onboarding'
  | 'active'
  | 'archived'
  | 'lead_no_proposal';

const PRIMARY_STATUS_ORDER: PrimaryStatus[] = [
  'archived',
  'active',
  'onboarding',
  'paid',
  'awaiting_payment',
  'signed',
  'viewed',
  'sent',
  'drafted',
  'lead_no_proposal',
];

export const PRIMARY_STATUS_LABEL: Record<PrimaryStatus, string> = {
  drafted: 'Drafted',
  sent: 'Sent',
  viewed: 'Viewed',
  signed: 'Signed',
  awaiting_payment: 'Awaiting payment',
  paid: 'Paid',
  onboarding: 'Onboarding',
  active: 'Active client',
  archived: 'Archived',
  lead_no_proposal: 'Lead — no proposal',
};

export const PRIMARY_STATUS_PILL: Record<PrimaryStatus, string> = {
  drafted: 'border-zinc-400/40 bg-zinc-400/10 text-zinc-200',
  sent: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200',
  viewed: 'border-indigo-400/40 bg-indigo-400/10 text-indigo-200',
  signed: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  awaiting_payment: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
  paid: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  onboarding: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  active: 'border-emerald-600/40 bg-emerald-600/10 text-emerald-100',
  archived: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300',
  lead_no_proposal: 'border-zinc-400/40 bg-zinc-400/10 text-zinc-200',
};

function rankPrimaryStatus(s: PrimaryStatus): number {
  return PRIMARY_STATUS_ORDER.indexOf(s);
}

export function comparePrimaryStatus(a: PrimaryStatus, b: PrimaryStatus): number {
  return rankPrimaryStatus(a) - rankPrimaryStatus(b);
}

function deriveProposalStatus(p: SalesRowProposal | null): PrimaryStatus | null {
  if (!p) return null;
  switch (p.status) {
    case 'draft':
      return 'drafted';
    case 'sent':
      return p.viewed_at ? 'viewed' : 'sent';
    case 'viewed':
      return 'viewed';
    case 'signed':
      return p.paid_at ? 'paid' : 'awaiting_payment';
    case 'paid':
      return 'paid';
    case 'expired':
    case 'canceled':
      return 'archived';
    default:
      return null;
  }
}

function deriveFlowStatus(f: SalesRowFlow | null): PrimaryStatus | null {
  if (!f) return null;
  switch (f.status) {
    case 'needs_proposal':
      return null; // proposal status takes over if it exists
    case 'awaiting_payment':
      return 'awaiting_payment';
    case 'active':
      return 'onboarding';
    case 'paused':
      return 'onboarding';
    case 'completed':
      return 'active';
    case 'archived':
      return 'archived';
    default:
      return null;
  }
}

function pickPrimaryStatus(
  proposalStatus: PrimaryStatus | null,
  flowStatus: PrimaryStatus | null,
): PrimaryStatus {
  // Flow status wins once we're past the proposal-pending stage (i.e.
  // anyone in active/onboarding/archived state). Otherwise the proposal
  // status drives the row — that's what the admin is actively chasing.
  if (flowStatus === 'active' || flowStatus === 'onboarding' || flowStatus === 'archived') {
    return flowStatus;
  }
  if (proposalStatus) return proposalStatus;
  if (flowStatus) return flowStatus;
  return 'lead_no_proposal';
}

function lastActivityFromProposal(p: SalesRowProposal | null): string | null {
  if (!p) return null;
  return p.paid_at ?? p.signed_at ?? p.viewed_at ?? p.sent_at ?? p.created_at;
}

function lastActivityFromFlow(f: SalesRowFlow | null): string | null {
  if (!f) return null;
  return f.completed_at ?? f.started_at ?? f.created_at;
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

type AdminClient = SupabaseClient;

/**
 * Build the unified pipeline rows for an agency. Includes:
 *   - clients with at least one proposal OR an active flow
 *   - clients flagged as a lead even without a proposal yet (so the
 *     admin can see fresh prospects waiting for outreach)
 */
export async function getSalesPipelineRows(opts: {
  agency?: 'anderson' | 'nativz' | null;
  admin?: AdminClient;
}): Promise<SalesPipelineRow[]> {
  const admin = opts.admin ?? createAdminClient();
  const agencyFilter = opts.agency ?? null;

  // Pull every clients row with any activity (proposal or flow) plus
  // brand-new leads. We hide manually-archived brands (`hide_from_roster`)
  // by default so the pipeline doesn't drown in legacy shells.
  let clientsQuery = admin
    .from('clients')
    .select(
      'id, name, slug, logo_url, agency, lifecycle_state, auto_created_from_proposal_id, hide_from_roster, created_at',
    )
    .eq('hide_from_roster', false)
    .order('created_at', { ascending: false });
  if (agencyFilter) clientsQuery = clientsQuery.eq('agency', agencyFilter);

  const [clientsRes, proposalsRes, flowsRes] = await Promise.all([
    clientsQuery,
    admin
      .from('proposals')
      .select(
        'id, slug, title, status, agency, sent_at, viewed_at, signed_at, paid_at, created_at, client_id',
      )
      .order('created_at', { ascending: false }),
    admin
      .from('onboarding_flows')
      .select(
        'id, status, started_at, completed_at, share_token, created_at, client_id',
      )
      .order('created_at', { ascending: false }),
  ]);

  type ProposalRow = SalesRowProposal & { client_id: string | null };
  type FlowRowDb = SalesRowFlow & { client_id: string };

  const proposalsByClient = new Map<string, ProposalRow[]>();
  for (const p of (proposalsRes.data ?? []) as ProposalRow[]) {
    if (!p.client_id) continue;
    const list = proposalsByClient.get(p.client_id) ?? [];
    list.push(p);
    proposalsByClient.set(p.client_id, list);
  }

  const flowByClient = new Map<string, FlowRowDb>();
  for (const f of (flowsRes.data ?? []) as FlowRowDb[]) {
    // First wins (created_at desc above); a client should have at most
    // one non-archived flow anyway thanks to the partial unique index.
    if (!flowByClient.has(f.client_id)) flowByClient.set(f.client_id, f);
  }

  const rows: SalesPipelineRow[] = [];
  for (const c of (clientsRes.data ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    agency: string | null;
    lifecycle_state: string | null;
    auto_created_from_proposal_id: string | null;
    hide_from_roster: boolean;
    created_at: string;
  }>) {
    const clientProposals = (proposalsByClient.get(c.id) ?? []).filter(
      (p) => p.status !== 'expired' && p.status !== 'canceled',
    );
    const latest = clientProposals[0] ?? null;
    const flowDb = flowByClient.get(c.id) ?? null;
    const flow: SalesRowFlow | null = flowDb
      ? {
          id: flowDb.id,
          status: flowDb.status,
          started_at: flowDb.started_at,
          completed_at: flowDb.completed_at,
          share_token: flowDb.share_token,
          created_at: flowDb.created_at,
        }
      : null;

    // Hide pure leads with no proposal AND no flow AND not flagged as a
    // recent prospect — keeps the pipeline tight. Active leads stay.
    if (!latest && !flow && c.lifecycle_state !== 'lead') continue;

    const primaryStatus = pickPrimaryStatus(deriveProposalStatus(latest), deriveFlowStatus(flow));
    const lastActivity = maxIso(lastActivityFromProposal(latest), lastActivityFromFlow(flow));

    rows.push({
      client: {
        id: c.id,
        name: c.name,
        slug: c.slug,
        logo_url: c.logo_url,
        agency: c.agency,
        lifecycle_state: c.lifecycle_state,
        auto_created_from_proposal_id: c.auto_created_from_proposal_id,
      },
      latest_proposal: latest
        ? {
            id: latest.id,
            slug: latest.slug,
            title: latest.title,
            status: latest.status,
            agency: latest.agency,
            sent_at: latest.sent_at,
            viewed_at: latest.viewed_at,
            signed_at: latest.signed_at,
            paid_at: latest.paid_at,
            created_at: latest.created_at,
          }
        : null,
      flow,
      primary_status: primaryStatus,
      last_activity_at: lastActivity,
    });
  }

  // Latest activity first — admin sees what changed most recently.
  rows.sort((a, b) => {
    const ax = a.last_activity_at ?? a.client.id;
    const bx = b.last_activity_at ?? b.client.id;
    return bx.localeCompare(ax);
  });

  return rows;
}

export function countByPrimaryStatus(rows: SalesPipelineRow[]): Record<PrimaryStatus, number> {
  const counts: Record<PrimaryStatus, number> = {
    drafted: 0,
    sent: 0,
    viewed: 0,
    signed: 0,
    awaiting_payment: 0,
    paid: 0,
    onboarding: 0,
    active: 0,
    archived: 0,
    lead_no_proposal: 0,
  };
  for (const r of rows) counts[r.primary_status] += 1;
  return counts;
}
